import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth.guard';
import { UsersService } from '../../users/users.service';
import { Public } from '../utils/public.decorator';
import { COOKIE_NAME } from '../utils/cookie';
import type { AuthenticatedRequest } from '../utils/auth-request';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.USER / Role.ADMIN

/*
 * Real JwtService (fake secret), real Reflector, real @Public() decorator,
 * stubbed UsersService. We build the guard by hand, we do not register it globally.
 */

const SECRET = 'test-secret-only-for-unit-tests-0123456789abcdef';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');
const fromB64url = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

// --- fake controllers, so the Reflector reads REAL metadata ---
class FakeController {
  @Public()
  open() {}

  closed() {}
}

@Public()
class FakePublicController {
  anything() {}
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwt: JwtService;
  let users: { findById: jest.Mock<UsersService['findById']> };

  const dbUser = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'u1',
      role: Role.USER,
      deletedAt: null,
      passwordHash: '$argon2id$should-never-reach-the-request',
      email: 'ada@example.com',
      ...overrides,
    }) as unknown as Awaited<ReturnType<UsersService['findById']>>;

  // fake request with an optional cookie value (anything: string, object, undefined...)
  const makeReq = (cookie?: unknown): AuthenticatedRequest =>
    ({
      cookies: cookie === undefined ? {} : { [COOKIE_NAME]: cookie },
    }) as unknown as AuthenticatedRequest;

  const makeContext = (
    req: AuthenticatedRequest,
    handler: (...args: any[]) => any = FakeController.prototype.closed,
    cls: new () => unknown = FakeController,
  ) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => cls,
    }) as unknown as ExecutionContext;

  const run = (cookie?: unknown) => {
    const req = makeReq(cookie);
    return { req, promise: guard.canActivate(makeContext(req)) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: SECRET,
          signOptions: { algorithm: 'HS256', expiresIn: 60 },
        }),
      ],
    }).compile();

    jwt = moduleRef.get(JwtService);
  });

  beforeEach(() => {
    users = { findById: jest.fn<UsersService['findById']>() };
    users.findById.mockResolvedValue(dbUser());

    guard = new AuthGuard(
      jwt,
      users as unknown as UsersService,
      new Reflector(),
    );
  });

  const validToken = () => jwt.signAsync({ sub: 'u1', role: Role.USER });

  describe('public routes', () => {
    it('lets a @Public() method through without a cookie, and never touches the database', async () => {
      const req = makeReq();
      const ctx = makeContext(req, FakeController.prototype.open);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(users.findById).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('lets a route of a @Public() controller through', async () => {
      const ctx = makeContext(
        makeReq(),
        FakePublicController.prototype.anything,
        FakePublicController,
      );

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('protects a route that is not marked public', async () => {
      await expect(run().promise).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('missing or malformed cookie -> 401', () => {
    it.each([
      ['no cookie at all', undefined],
      ['empty string', ''],
      [
        'an object (cookie-parser turns "j:..." cookies into objects)',
        { a: 1 },
      ],
      ['an array', ['x']],
      ['a number', 42],
    ])('%s', async (_name, cookie) => {
      await expect(run(cookie).promise).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('request without a cookies property (cookie-parser not registered)', async () => {
      const req = {} as unknown as AuthenticatedRequest;
      await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('bad tokens -> 401, and the database is never queried', () => {
    const badTokens: [string, () => Promise<string>][] = [
      ['garbage', async () => 'not.a.token'],
      [
        'signed with another secret',
        () =>
          new JwtService({
            secret: 'another-secret-entirely-0123456789abcdef',
          }).signAsync({ sub: 'u1', role: Role.USER }),
      ],
      [
        'expired',
        () => jwt.signAsync({ sub: 'u1', role: Role.USER }, { expiresIn: -10 }),
      ],
      [
        'signed with another algorithm (HS384): the algorithm is pinned',
        () =>
          jwt.signAsync({ sub: 'u1', role: Role.USER }, { algorithm: 'HS384' }),
      ],
      [
        'payload edited but not re-signed (role escalation)',
        async () => {
          const [h, b, s] = (await validToken()).split('.');
          return `${h}.${b64url({ ...fromB64url(b), role: Role.ADMIN })}.${s}`;
        },
      ],
      [
        'unsigned (alg: none)',
        async () => {
          const [, b] = (await validToken()).split('.');
          return `${b64url({ alg: 'none', typ: 'JWT' })}.${b}.`;
        },
      ],
    ];

    it.each(badTokens)('%s', async (_name, make) => {
      const token = await make();

      await expect(run(token).promise).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findById).not.toHaveBeenCalled();
    });
  });

  describe('valid token, but the user is not usable -> 401', () => {
    it('user does not exist: 401, not the 404 thrown by findById', async () => {
      users.findById.mockRejectedValue(new NotFoundException('User not found'));

      const promise = run(await validToken()).promise;

      await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(promise).rejects.not.toBeInstanceOf(NotFoundException);
    });

    it('user is deleted / anonymized (deletedAt set)', async () => {
      users.findById.mockResolvedValue(dbUser({ deletedAt: new Date() }));

      await expect(run(await validToken()).promise).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('a real failure (database down) is NOT hidden as a 401', async () => {
      const boom = new Error('db down');
      users.findById.mockRejectedValue(boom);

      const promise = run(await validToken()).promise;

      await expect(promise).rejects.toBe(boom);
      await expect(promise).rejects.not.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('valid token and usable user', () => {
    it('lets the request through and loads the user from the token subject', async () => {
      const { promise } = run(await validToken());

      await expect(promise).resolves.toBe(true);
      expect(users.findById).toHaveBeenCalledWith('u1');
    });

    it('attaches exactly { id, role } to the request, nothing else from the user', async () => {
      const { req, promise } = run(await validToken());
      await promise;

      expect(req.user).toEqual({ id: 'u1', role: Role.USER });
      expect(JSON.stringify(req.user)).not.toContain('argon2');
      expect(JSON.stringify(req.user)).not.toContain('ada@example.com');
    });

    it('takes the role from the DATABASE, not from the token (demoted/promoted since login)', async () => {
      const token = await jwt.signAsync({ sub: 'u1', role: Role.USER }); // token says USER
      users.findById.mockResolvedValue(dbUser({ role: Role.ADMIN })); // DB says ADMIN

      const { req, promise } = run(token);
      await promise;

      expect(req.user?.role).toBe(Role.ADMIN);
    });

    it('a token claiming ADMIN does not give ADMIN if the DB says USER', async () => {
      const token = await jwt.signAsync({ sub: 'u1', role: Role.ADMIN }); // token says ADMIN
      users.findById.mockResolvedValue(dbUser({ role: Role.USER })); // DB says USER

      const { req, promise } = run(token);
      await promise;

      expect(req.user?.role).toBe(Role.USER);
    });
  });

  describe('every failure looks the same to the client', () => {
    it('returns an identical 401 body for each failure case', async () => {
      const failures: Array<() => Promise<unknown>> = [
        async () => run().promise, // no cookie
        async () => run('not.a.token').promise, // garbage
        async () =>
          run(await jwt.signAsync({ sub: 'u1' }, { expiresIn: -10 })).promise, // expired
        async () => {
          users.findById.mockRejectedValue(new NotFoundException()); // unknown user
          return run(await validToken()).promise;
        },
        async () => {
          users.findById.mockResolvedValue(dbUser({ deletedAt: new Date() })); // deleted user
          return run(await validToken()).promise;
        },
      ];

      const bodies: unknown[] = [];
      for (const failure of failures) {
        try {
          await failure();
          throw new Error('expected the guard to reject');
        } catch (e) {
          expect(e).toBeInstanceOf(UnauthorizedException);
          bodies.push((e as UnauthorizedException).getResponse());
        }
      }

      for (const body of bodies) expect(body).toEqual(bodies[0]);
      // and it is the default bare 401, with no custom message that explains the cause
      expect(bodies[0]).toEqual(new UnauthorizedException().getResponse());
    });
  });
});
