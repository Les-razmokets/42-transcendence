import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { COOKIE_NAME } from '../src/auth/utils/cookie';

/*
 * ASSUMPTIONS TO CHECK:
 *  - configureApp registers cookie-parser too (not strictly needed here, but the guard will need it).
 *  - NODE_ENV is not "production" in tests, so the cookie is not Secure
 *    (otherwise supertest could not send it back over plain HTTP).
 *  - login returns 200, logout returns 204.
 *  - JwtService can be retrieved with { strict: false } (it is provided by JwtModule inside AuthModule).
 *  - Run against a TEST database: beforeEach wipes the User table.
 */

describe('Auth cookie: register / login / logout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let lifetime: number; // seconds

  const PASSWORD = 'Correct-Horse-9-Battery!';
  const EMAIL = 'cookie.user@example.com';

  const login = (
    body: Record<string, unknown> = { email: EMAIL, password: PASSWORD },
  ) => request(app.getHttpServer()).post('/api/auth/login').send(body);

  const logout = () => request(app.getHttpServer()).post('/api/auth/logout');

  const register = () =>
    request(app.getHttpServer()).post('/api/auth/register').send({
      firstName: 'Cookie',
      lastName: 'User',
      pseudo: 'cookieuser',
      email: EMAIL,
      password: PASSWORD,
      birthDate: '1990-01-01',
    });

  // finds our cookie among all Set-Cookie headers of a response
  const findCookie = (res: request.Response): string | undefined => {
    const raw = res.headers['set-cookie'] as unknown as
      string[] | string | undefined;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  };

  const cookieValue = (setCookie: string) =>
    setCookie.split(';')[0].slice(COOKIE_NAME.length + 1);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService, { strict: false });
    lifetime = Number(
      app.get(ConfigService).getOrThrow('JWT_EXPIRES_IN_SECONDS'),
    );
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await register().expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('does not log the user in (no cookie)', async () => {
      await prisma.user.deleteMany();
      const res = await register().expect(201);
      expect(findCookie(res)).toBeUndefined();
    });
  });

  describe('login: cookie flags', () => {
    it('sets the access cookie with HttpOnly, SameSite=Lax and Path=/', async () => {
      const res = await login().expect(200);
      const cookie = findCookie(res);

      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(cookie).toMatch(/;\s*Path=\//i);
    });

    it('has no Domain attribute (cookie stays bound to the exact host)', async () => {
      const cookie = findCookie(await login().expect(200));
      expect(cookie).not.toMatch(/;\s*Domain=/i);
    });

    it('expires with the token: Max-Age equals the lifetime in seconds', async () => {
      const cookie = findCookie(await login().expect(200));
      expect(cookie).toMatch(new RegExp(`;\\s*Max-Age=${lifetime}(;|$)`, 'i'));
    });

    it('is not Secure outside production (supertest talks over plain HTTP)', async () => {
      if (process.env.NODE_ENV === 'production') return;
      const cookie = findCookie(await login().expect(200));
      expect(cookie).not.toMatch(/;\s*Secure/i);
    });
  });

  describe('login: cookie value', () => {
    it('is a JWT that verifies and identifies the user', async () => {
      const res = await login().expect(200);
      const token = cookieValue(findCookie(res)!);

      const payload = await jwt.verifyAsync<{ sub: string; role: string }>(
        token,
      );
      expect(payload.sub).toBe(res.body.id);
      expect(payload.role).toBe(res.body.role);
    });

    it('contains only sub, role, iat and exp, and expires after the lifetime', async () => {
      const token = cookieValue(findCookie(await login().expect(200))!);
      const payload = await jwt.verifyAsync<{ iat: number; exp: number }>(
        token,
      );

      expect(Object.keys(payload).sort()).toEqual([
        'exp',
        'iat',
        'role',
        'sub',
      ]);
      expect(payload.exp - payload.iat).toBe(lifetime);
    });

    it('never appears in the response body, and the body still has no hash', async () => {
      const res = await login().expect(200);
      const token = cookieValue(findCookie(res)!);

      expect(JSON.stringify(res.body)).not.toContain(token);
      expect(res.body).not.toHaveProperty('token');
      expect(res.body).not.toHaveProperty('access_token');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('does not contain the email or the password hash', async () => {
      const token = cookieValue(findCookie(await login().expect(200))!);
      const decoded = Buffer.from(token.split('.')[1], 'base64url').toString(
        'utf8',
      );

      expect(decoded).not.toContain(EMAIL);
      expect(decoded).not.toContain('argon2');
    });
  });

  describe('login failures set no cookie', () => {
    it.each([
      ['wrong password', { email: EMAIL, password: 'Wrong-Password-1!' }, 401],
      [
        'unknown email',
        { email: 'nobody@example.com', password: PASSWORD },
        401,
      ],
      ['invalid body', { email: EMAIL }, 400],
    ])('%s', async (_name, body, status) => {
      const res = await login(body).expect(status);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('logout', () => {
    it('returns 204 with no body', async () => {
      const res = await logout().expect(204);
      expect(res.text).toBe('');
    });

    it('clears the same cookie: empty value, already expired', async () => {
      const res = await logout().expect(204);
      const cookie = findCookie(res);

      expect(cookie).toBeDefined();
      expect(cookieValue(cookie!)).toBe('');

      const expires = cookie!.match(/;\s*Expires=([^;]+)/i)?.[1];
      const maxAgeZero = /;\s*Max-Age=0(;|$)/i.test(cookie!);
      expect(
        maxAgeZero ||
          (expires !== undefined && new Date(expires).getTime() < Date.now()),
      ).toBe(true);
    });

    it('clears with the same attributes as login (otherwise the browser keeps the cookie)', async () => {
      const loginCookie = findCookie(await login().expect(200))!;
      const logoutCookie = findCookie(await logout().expect(204))!;

      for (const attr of [
        /;\s*Path=\//i,
        /;\s*SameSite=Lax/i,
        /;\s*HttpOnly/i,
      ]) {
        expect(loginCookie).toMatch(attr);
        expect(logoutCookie).toMatch(attr);
      }
      expect(/;\s*Secure/i.test(loginCookie)).toBe(
        /;\s*Secure/i.test(logoutCookie),
      );
      expect(logoutCookie).not.toMatch(/;\s*Domain=/i);
    });

    it('works without a cookie (public route, idempotent)', async () => {
      await logout().expect(204);
      await logout().expect(204);
    });

    it('works with an expired or garbage cookie (a user must always be able to log out)', async () => {
      await logout()
        .set('Cookie', `${COOKIE_NAME}=garbage.token.value`)
        .expect(204);
    });

    it('works after a real login', async () => {
      const loginRes = await login().expect(200);
      const token = cookieValue(findCookie(loginRes)!);

      await logout().set('Cookie', `${COOKIE_NAME}=${token}`).expect(204);
    });
  });
});
