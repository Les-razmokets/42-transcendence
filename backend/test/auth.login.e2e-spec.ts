import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

/*
 * ASSUMPTIONS TO CHECK:
 *  - login returns 200 (@HttpCode(HttpStatus.OK)). If you keep the default 201, change LOGIN_STATUS.
 *  - the response uses the "my profile" schema (same keys as register).
 *  - User has nullable `passwordHash` and nullable `deletedAt`.
 *  - Run against a TEST database: beforeEach wipes the User table.
 */

describe('POST /api/auth/login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const LOGIN_STATUS = 200;
  const PASSWORD = 'Correct-Horse-9-Battery!';
  const EMAIL = 'login.user@example.com';
  const PSEUDO = 'loginuser';

  const MY_PROFILE_KEYS = [
    'birthDate',
    'createdAt',
    'email',
    'firstName',
    'id',
    'lastName',
    'phone',
    'pseudo',
    'role',
    'updatedAt',
  ];

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/auth/login').send(body);

  // go through the real register route so the stored hash is a real argon2id hash
  const registerUser = () =>
    request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Login',
        lastName: 'User',
        pseudo: PSEUDO,
        email: EMAIL,
        password: PASSWORD,
        birthDate: '1990-01-01',
      })
      .expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await registerUser();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('success', () => {
    it('logs in with the right credentials', async () => {
      const res = await login({ email: EMAIL, password: PASSWORD }).expect(
        LOGIN_STATUS,
      );
      expect(res.body).toMatchObject({ email: EMAIL, pseudo: PSEUDO });
    });

    it('returns exactly the "my profile" keys and never leaks the hash', async () => {
      const res = await login({ email: EMAIL, password: PASSWORD }).expect(
        LOGIN_STATUS,
      );

      expect(Object.keys(res.body).sort()).toEqual([...MY_PROFILE_KEYS].sort());
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
      expect(JSON.stringify(res.body)).not.toContain('$argon2');
    });

    it('ignores case and surrounding spaces in the email', async () => {
      await login({
        email: '  Login.User@EXAMPLE.com ',
        password: PASSWORD,
      }).expect(LOGIN_STATUS);
    });

    it('works several times in a row', async () => {
      await login({ email: EMAIL, password: PASSWORD }).expect(LOGIN_STATUS);
      await login({ email: EMAIL, password: PASSWORD }).expect(LOGIN_STATUS);
    });
  });

  describe('failures: one generic 401', () => {
    // each setup puts the account in a different "bad" state
    const scenarios: [string, () => Promise<Record<string, unknown>>][] = [
      [
        'wrong password',
        async () => ({ email: EMAIL, password: 'Wrong-Password-1!' }),
      ],
      [
        'unknown email',
        async () => ({ email: 'nobody@example.com', password: PASSWORD }),
      ],
      [
        'account without a passwordHash (future OAuth)',
        async () => {
          await prisma.user.update({
            where: { email: EMAIL },
            data: { passwordHash: null },
          });
          return { email: EMAIL, password: PASSWORD };
        },
      ],
      [
        'anonymized / deleted account',
        async () => {
          await prisma.user.update({
            where: { email: EMAIL },
            data: { deletedAt: new Date() },
          });
          return { email: EMAIL, password: PASSWORD };
        },
      ],
    ];

    it.each(scenarios)('%s returns 401', async (_name, setup) => {
      const body = await setup();
      await login(body).expect(401);
    });

    it('returns the exact same body for every failure (no way to tell them apart)', async () => {
      const bodies: unknown[] = [];

      for (const [, setup] of scenarios) {
        await prisma.user.deleteMany();
        await registerUser();
        const res = await login(await setup()).expect(401);
        bodies.push(res.body);
      }

      for (const body of bodies) expect(body).toEqual(bodies[0]);
      expect(JSON.stringify(bodies[0])).toMatch(/invalid credentials/i);
    });

    it('does not set any cookie on failure', async () => {
      const res = await login({
        email: EMAIL,
        password: 'Wrong-Password-1!',
      }).expect(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('does not leak anything about the account in the error body', async () => {
      const res = await login({
        email: EMAIL,
        password: 'Wrong-Password-1!',
      }).expect(401);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(EMAIL);
      expect(text).not.toContain('$argon2');
    });
  });

  describe('validation (400)', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['empty body', {}],
      ['missing password', { email: EMAIL }],
      ['missing email', { password: PASSWORD }],
      ['invalid email', { email: 'not-an-email', password: PASSWORD }],
      ['empty password', { email: EMAIL, password: '' }],
      ['password over 128 chars', { email: EMAIL, password: 'a'.repeat(129) }],
      ['non-string password', { email: EMAIL, password: 12345678 }],
      [
        'unknown extra field',
        { email: EMAIL, password: PASSWORD, role: 'ADMIN' },
      ],
    ];

    it.each(cases)('%s', async (_name, body) => {
      await login(body).expect(400);
    });
  });

  describe('password hash upgrade (needsRehash)', () => {
    const weakHash = () =>
      argon2.hash(PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 2 ** 10,
        timeCost: 1,
        parallelism: 1,
      });

    it('rehashes a weak stored hash after a successful login, and login keeps working', async () => {
      const weak = await weakHash();
      await prisma.user.update({
        where: { email: EMAIL },
        data: { passwordHash: weak },
      });

      await login({ email: EMAIL, password: PASSWORD }).expect(LOGIN_STATUS);

      const after = await prisma.user.findUniqueOrThrow({
        where: { email: EMAIL },
      });
      expect(after.passwordHash).not.toBe(weak);
      expect(after.passwordHash).toMatch(/^\$argon2id\$/);
      expect(after.passwordHash).toMatch(/m=65536/); // current memory cost

      // the new hash must be valid for the same password
      await login({ email: EMAIL, password: PASSWORD }).expect(LOGIN_STATUS);
    });

    it('does NOT touch the stored hash after a failed login', async () => {
      const weak = await weakHash();
      await prisma.user.update({
        where: { email: EMAIL },
        data: { passwordHash: weak },
      });

      await login({ email: EMAIL, password: 'Wrong-Password-1!' }).expect(401);

      const after = await prisma.user.findUniqueOrThrow({
        where: { email: EMAIL },
      });
      expect(after.passwordHash).toBe(weak);
    });

    it('does NOT upgrade the hash of a deleted account', async () => {
      const weak = await weakHash();
      await prisma.user.update({
        where: { email: EMAIL },
        data: { passwordHash: weak, deletedAt: new Date() },
      });

      await login({ email: EMAIL, password: PASSWORD }).expect(401);

      const after = await prisma.user.findUniqueOrThrow({
        where: { email: EMAIL },
      });
      expect(after.passwordHash).toBe(weak);
    });
  });
});
