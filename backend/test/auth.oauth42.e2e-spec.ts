import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  jest,
} from '@jest/globals';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  COOKIE_NAME,
  OAUTH_COOKIE,
  OAUTH_PENDING_COOKIE,
} from '../src/auth/utils/cookie';
import { FortyTwoClientService } from '../src/auth/oauth/forty-two/forty-two.service';
import { FortyTwoAuthException } from '../src/auth/oauth/forty-two/utils/forty-two-auth.exception';
import type { FortyTwoProfile } from '../src/auth/oauth/forty-two/utils/forty-two-response.schema';
import { OAuthProvider } from '../src/generated/prisma/client';

/*
 * 42 is never called: exchangeCodeForToken and readProfile are replaced on the real
 * FortyTwoClientService instance. Everything else (state cookie, controller, service,
 * database, cookies) is the real thing.
 */

describe('42 OAuth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let client: FortyTwoClientService;
  let frontUrl: string;
  let pendingSecret: string;
  let sessionSecret: string;

  let exchange: jest.SpiedFunction<FortyTwoClientService['exchangeCodeForToken']>;
  let readProfile: jest.SpiedFunction<FortyTwoClientService['readProfile']>;

  const STATE = 'a'.repeat(64);
  const PASSWORD = 'Correct-Horse-9-Battery!';
  const PROFILE: FortyTwoProfile = {
    providerAccountId: '123456',
    email: 'jdoe@student.42.fr',
    login: '42jdoe',
    firstName: 'John',
    lastName: 'Doe',
  };

  const http = () => request(app.getHttpServer());

  // ---- cookie helpers -------------------------------------------------------
  const setCookies = (res: request.Response): string[] => {
    const raw = res.headers['set-cookie'] as unknown as
      string[] | string | undefined;
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };
  const findCookie = (res: request.Response, name: string) =>
    setCookies(res).find((c) => c.startsWith(`${name}=`));
  const cookieValue = (setCookie: string) =>
    decodeURIComponent(setCookie.split(';')[0].split('=').slice(1).join('='));
  const isCleared = (setCookie: string | undefined) =>
    setCookie !== undefined &&
    cookieValue(setCookie) === '' &&
    (/;\s*Max-Age=0(;|$)/i.test(setCookie) ||
      new Date(setCookie.match(/;\s*Expires=([^;]+)/i)?.[1] ?? 0).getTime() <
        Date.now());

  // ---- route helpers --------------------------------------------------------
  // the query is a raw string so we control exactly what Express parses (e.g. a repeated key)
  const callback = (
    query = `code=the-code&state=${STATE}`,
    stateCookie: string | null = STATE,
  ) => {
    const req = http().get(`/api/auth/42/callback?${query}`);
    return stateCookie === null
      ? req
      : req.set('Cookie', `${OAUTH_COOKIE}=${stateCookie}`);
  };

  const complete = (body: Record<string, unknown>, pending?: string) => {
    const req = http().post('/api/auth/42/complete').send(body);
    return pending === undefined
      ? req
      : req.set('Cookie', `${OAUTH_PENDING_COOKIE}=${pending}`);
  };

  // runs the callback for an unknown account and returns the pending token
  const getPendingToken = async () => {
    const res = await callback().expect(302);
    const cookie = findCookie(res, OAUTH_PENDING_COOKIE);
    expect(cookie).toBeDefined();
    return cookieValue(cookie!);
  };

  const signPending = (
    overrides: Record<string, unknown> = {},
    secret = pendingSecret,
    expiresIn = 600,
  ) =>
    new JwtService({}).signAsync(
      { typ: 'oauth_pending', ...PROFILE, ...overrides },
      { secret, expiresIn },
    );

  const me = (sessionToken: string) =>
    http().get('/api/users/me').set('Cookie', `${COOKIE_NAME}=${sessionToken}`);

  const createLinkedUser = (deletedAt: Date | null = null) =>
    prisma.user.create({
      data: {
        email: PROFILE.email,
        pseudo: PROFILE.login,
        firstName: PROFILE.firstName,
        lastName: PROFILE.lastName,
        birthDate: new Date('1990-01-01'),
        deletedAt,
        oauthAccounts: {
          create: {
            provider: OAuthProvider.FORTY_TWO,
            providerAccountId: PROFILE.providerAccountId,
          },
        },
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService, { strict: false });
    client = app.get(FortyTwoClientService, { strict: false });
    const config = app.get(ConfigService);
    frontUrl = config.getOrThrow<string>('FRONTEND_URL');
    pendingSecret = config.getOrThrow<string>('OAUTH_PENDING_SECRET');
    sessionSecret = config.getOrThrow<string>('JWT_SECRET');
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({}); // cascades to OAuthAccount
    exchange = jest
      .spyOn(client, 'exchangeCodeForToken')
      .mockResolvedValue('42-access-token');
    readProfile = jest.spyOn(client, 'readProfile').mockResolvedValue(PROFILE);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  describe('GET /api/auth/42', () => {
    it('redirects (302) to the 42 authorize URL', async () => {
      const res = await http().get('/api/auth/42').expect(302);
      const location = new URL(res.headers.location);
      const authUrl = new URL(
        `${process.env.FORTY_TWO_BASE_URL}${process.env.FORTY_TWO_AUTHORIZE}`,
      );

      expect(location.origin + location.pathname).toBe(
        authUrl.origin + authUrl.pathname,
      );
      expect(location.searchParams.get('response_type')).toBe('code');
    });

    it('sets a state cookie: HttpOnly, SameSite=Lax, scoped to /api/auth/42, 10 minutes', async () => {
      const cookie = findCookie(
        await http().get('/api/auth/42').expect(302),
        OAUTH_COOKIE,
      );

      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(cookie).toMatch(/;\s*Path=\/api\/auth\/42(;|$)/i);
      expect(cookie).toMatch(/;\s*Max-Age=600(;|$)/i);
    });

    it('the state in the URL is the one in the cookie', async () => {
      const res = await http().get('/api/auth/42').expect(302);
      const state = new URL(res.headers.location).searchParams.get('state');

      expect(cookieValue(findCookie(res, OAUTH_COOKIE)!)).toBe(state);
    });

    it('the state is 32 random bytes in hex, new on every call', async () => {
      const stateOf = async () =>
        new URL((await http().get('/api/auth/42').expect(302)).headers.location)
          .searchParams.get('state');
      const [a, b] = [await stateOf(), await stateOf()];

      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).not.toBe(b);
    });

    it('is public (no session needed)', async () => {
      await http().get('/api/auth/42').expect(302);
    });
  });

  // ===========================================================================
  describe('GET /api/auth/42/callback: state check', () => {
    const errorUrl = () => `${frontUrl}/login?error=oauth`;

    const cases: [string, () => request.Test][] = [
      ['no state cookie', () => callback(undefined, null)],
      ['a state that does not match the cookie', () => callback(undefined, 'b'.repeat(64))],
      ['a state of a different length', () => callback(undefined, 'short')],
      ['no state in the query', () => callback('code=the-code')],
      ['no code in the query', () => callback(`state=${STATE}`)],
      ['state sent twice (array)', () => callback(`code=c&state=${STATE}&state=${STATE}`)],
      ['code sent twice (array)', () => callback(`code=c&code=c&state=${STATE}`)],
    ];

    it.each(cases)('%s: generic error redirect, 42 never called', async (_name, run) => {
      const res = await run().expect(302);

      expect(res.headers.location).toBe(errorUrl());
      expect(exchange).not.toHaveBeenCalled();
      expect(findCookie(res, COOKIE_NAME)).toBeUndefined();
      expect(findCookie(res, OAUTH_PENDING_COOKIE)).toBeUndefined();
    });

    it('never answers with JSON, even on failure (the browser is navigating)', async () => {
      const res = await callback(undefined, null).expect(302);
      expect(res.headers['content-type'] ?? '').not.toMatch(/json/);
    });

    it('clears the state cookie on success (single use)', async () => {
      const res = await callback().expect(302);
      expect(isCleared(findCookie(res, OAUTH_COOKIE))).toBe(true);
    });

    it('clears the state cookie on failure too', async () => {
      const res = await callback(undefined, 'b'.repeat(64)).expect(302);
      expect(isCleared(findCookie(res, OAUTH_COOKIE))).toBe(true);
    });

    it('clears it with the same path it was set with (otherwise the browser keeps it)', async () => {
      const res = await callback().expect(302);
      expect(findCookie(res, OAUTH_COOKIE)).toMatch(
        /;\s*Path=\/api\/auth\/42(;|$)/i,
      );
    });
  });

  // ===========================================================================
  describe('GET /api/auth/42/callback: 42 failures', () => {
    it.each([
      ['the code exchange', () => exchange.mockRejectedValue(new FortyTwoAuthException())],
      ['the profile read', () => readProfile.mockRejectedValue(new FortyTwoAuthException())],
    ])('%s fails: generic error redirect, no cookie, nothing written', async (_name, arrange) => {
      arrange();
      const res = await callback().expect(302);

      expect(res.headers.location).toBe(`${frontUrl}/login?error=oauth`);
      expect(findCookie(res, COOKIE_NAME)).toBeUndefined();
      expect(findCookie(res, OAUTH_PENDING_COOKIE)).toBeUndefined();
      expect(await prisma.user.count()).toBe(0);
    });

    it('passes the code from the query to the exchange', async () => {
      await callback(`code=xyz&state=${STATE}`).expect(302);
      expect(exchange).toHaveBeenCalledWith('xyz');
      expect(readProfile).toHaveBeenCalledWith('42-access-token');
    });
  });

  // ===========================================================================
  describe('GET /api/auth/42/callback: unknown account', () => {
    it('redirects to the completion page', async () => {
      const res = await callback().expect(302);
      expect(res.headers.location).toBe(`${frontUrl}/signup/42`);
    });

    it('writes nothing to the database', async () => {
      await callback().expect(302);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.oAuthAccount.count()).toBe(0);
    });

    it('sets no session cookie', async () => {
      const res = await callback().expect(302);
      expect(findCookie(res, COOKIE_NAME)).toBeUndefined();
    });

    it('sets the pending cookie: HttpOnly, SameSite=Lax, scoped to /api/auth/42, 10 minutes', async () => {
      const cookie = findCookie(await callback().expect(302), OAUTH_PENDING_COOKIE);

      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(cookie).toMatch(/;\s*Path=\/api\/auth\/42(;|$)/i);
      expect(cookie).toMatch(/;\s*Max-Age=600(;|$)/i);
    });

    it('the pending token is signed with the pending secret and carries the profile', async () => {
      const token = await getPendingToken();
      const payload = await jwt.verifyAsync(token, { secret: pendingSecret });

      expect(payload).toMatchObject({ typ: 'oauth_pending', ...PROFILE });
    });

    it('the pending token does not work as a session (AuthGuard rejects it)', async () => {
      const token = await getPendingToken();
      await me(token).expect(401);
    });
  });

  // ===========================================================================
  describe('GET /api/auth/42/callback: email already used', () => {
    beforeEach(async () => {
      await http()
        .post('/api/auth/register')
        .send({
          firstName: 'Other',
          lastName: 'Person',
          pseudo: 'jdoe',
          email: PROFILE.email,
          password: PASSWORD,
          birthDate: '1990-01-01',
        })
        .expect(201);
    });

    it('generic error redirect, no automatic linking', async () => {
      const res = await callback().expect(302);

      expect(res.headers.location).toBe(`${frontUrl}/login?error=oauth`);
      expect(findCookie(res, COOKIE_NAME)).toBeUndefined();
      expect(findCookie(res, OAUTH_PENDING_COOKIE)).toBeUndefined();
      expect(await prisma.oAuthAccount.count()).toBe(0);
    });
  });

  // ===========================================================================
  describe('GET /api/auth/42/callback: account already linked', () => {
    it('logs the user in and redirects to the front end', async () => {
      const user = await createLinkedUser();
      const res = await callback().expect(302);

      expect(res.headers.location).toBe(frontUrl);
      const session = findCookie(res, COOKIE_NAME);
      expect(session).toBeDefined();
      expect(findCookie(res, OAUTH_PENDING_COOKIE)).toBeUndefined();

      const payload = await jwt.verifyAsync(cookieValue(session!));
      expect(payload.sub).toBe(user.id);
    });

    it('the session cookie has the same flags as a password login', async () => {
      await createLinkedUser();
      const session = findCookie(await callback().expect(302), COOKIE_NAME)!;

      expect(session).toMatch(/;\s*HttpOnly/i);
      expect(session).toMatch(/;\s*SameSite=Lax/i);
      expect(session).toMatch(/;\s*Path=\/(;|$)/i);
    });

    it('the session works on a protected route', async () => {
      const user = await createLinkedUser();
      const session = findCookie(await callback().expect(302), COOKIE_NAME)!;

      const res = await me(cookieValue(session)).expect(200);
      expect(res.body.id).toBe(user.id);
    });

    it('a soft-deleted user is refused', async () => {
      await createLinkedUser(new Date());
      const res = await callback().expect(302);

      expect(res.headers.location).toBe(`${frontUrl}/login?error=oauth`);
      expect(findCookie(res, COOKIE_NAME)).toBeUndefined();
    });
  });

  // ===========================================================================
  describe('POST /api/auth/42/complete', () => {
    const ADULT = { birthDate: '1990-01-01' };

    describe('success', () => {
      it('returns 201 with the "my profile" view, identity from 42', async () => {
        const res = await complete(ADULT, await getPendingToken()).expect(201);

        expect(res.body).toMatchObject({
          email: PROFILE.email,
          pseudo: PROFILE.login,
          firstName: PROFILE.firstName,
          lastName: PROFILE.lastName,
        });
        expect(res.body).not.toHaveProperty('passwordHash');
      });

      it('creates the user (no password) and the 42 link', async () => {
        await complete(ADULT, await getPendingToken()).expect(201);

        const user = await prisma.user.findUniqueOrThrow({
          where: { email: PROFILE.email },
          include: { oauthAccounts: true },
        });
        expect(user.passwordHash).toBeNull();
        expect(user.oauthAccounts).toHaveLength(1);
        expect(user.oauthAccounts[0]).toMatchObject({
          provider: OAuthProvider.FORTY_TWO,
          providerAccountId: PROFILE.providerAccountId,
        });
      });

      it('logs the user in: the session cookie works on a protected route', async () => {
        const res = await complete(ADULT, await getPendingToken()).expect(201);
        const session = findCookie(res, COOKIE_NAME);

        expect(session).toBeDefined();
        await me(cookieValue(session!)).expect(200);
      });

      it('clears the pending cookie with its own path', async () => {
        const res = await complete(ADULT, await getPendingToken()).expect(201);
        const cookie = findCookie(res, OAUTH_PENDING_COOKIE);

        expect(isCleared(cookie)).toBe(true);
        expect(cookie).toMatch(/;\s*Path=\/api\/auth\/42(;|$)/i);
      });

      it('the next 42 login finds the linked account (full round trip)', async () => {
        await complete(ADULT, await getPendingToken()).expect(201);

        const res = await callback().expect(302);
        expect(res.headers.location).toBe(frontUrl);
        expect(findCookie(res, COOKIE_NAME)).toBeDefined();
      });
    });

    describe('pending token rejected (401, nothing created)', () => {
      const cases: [string, () => Promise<string | undefined>][] = [
        ['no pending cookie', async () => undefined],
        ['garbage', async () => 'not.a.token'],
        ['signed with the session secret', () => signPending({}, sessionSecret)],
        ['expired', () => signPending({}, undefined, -10)],
        ['wrong typ', () => signPending({ typ: 'access' })],
        ['a real session token', async () => {
          await createLinkedUser();
          const res = await callback().expect(302);
          await prisma.user.deleteMany({});
          return cookieValue(findCookie(res, COOKIE_NAME)!);
        }],
      ];

      it.each(cases)('%s', async (_name, build) => {
        await complete(ADULT, await build()).expect(401);
        expect(await prisma.user.count()).toBe(0);
      });
    });

    describe('body validation (400, nothing created)', () => {
      const yearsAgo = (n: number) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - n);
        return d.toISOString().slice(0, 10);
      };

      it.each([
        ['under 18', { birthDate: yearsAgo(10) }],
        ['garbage birth date', { birthDate: 'banana' }],
        ['empty body', {}],
        ['an email in the body', { ...ADULT, email: 'victim@example.com' }],
        ['a pseudo in the body', { ...ADULT, pseudo: 'admin' }],
        ['a role in the body', { ...ADULT, role: 'ADMIN' }],
      ])('%s', async (_name, body) => {
        await complete(body, await getPendingToken()).expect(400);
        expect(await prisma.user.count()).toBe(0);
      });
    });

    describe('conflicts (409)', () => {
      it('replaying the same pending token after success creates nothing more', async () => {
        const token = await getPendingToken();
        await complete(ADULT, token).expect(201);

        const res = await complete(ADULT, token).expect(409);
        expect(JSON.stringify(res.body)).not.toMatch(/email|pseudo/i);
        expect(await prisma.user.count()).toBe(1);
      });

      it('two parallel completes: exactly one 201, one 409, no 500', async () => {
        const token = await getPendingToken();
        const results = await Promise.all([
          complete(ADULT, token),
          complete(ADULT, token),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await prisma.user.count()).toBe(1);
      });

      it('the email was taken by a password signup in the meantime', async () => {
        const token = await getPendingToken();
        await http()
          .post('/api/auth/register')
          .send({
            firstName: 'Fast',
            lastName: 'Squatter',
            pseudo: 'squatter',
            email: PROFILE.email,
            password: PASSWORD,
            birthDate: '1990-01-01',
          })
          .expect(201);

        await complete(ADULT, token).expect(409);
        expect(await prisma.oAuthAccount.count()).toBe(0);
      });
    });
  });

  // ===========================================================================
  describe('password login for a 42-only account', () => {
    it('is refused with the usual generic 401', async () => {
      await complete({ birthDate: '1990-01-01' }, await getPendingToken()).expect(201);

      const res = await http()
        .post('/api/auth/login')
        .send({ email: PROFILE.email, password: PASSWORD })
        .expect(401);
      expect(findCookie(res, COOKIE_NAME)).toBeUndefined();
    });
  });
});
