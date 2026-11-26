import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  jest,
} from '@jest/globals';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { SessionService } from '../session.service';
import { UsersService } from '../../users/users.service';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.USER / Role.ADMIN

/*
 * Real JwtService (fake secret), stubbed UsersService.
 * SessionService is transport-agnostic: it only receives a raw token string,
 * so these cases cover both HTTP (AuthGuard) and WebSocket (handshake) auth.
 */

const SECRET = 'test-secret-only-for-unit-tests-0123456789abcdef';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');
const fromB64url = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

describe('SessionService', () => {
  let session: SessionService;
  let jwt: JwtService;
  let users: { findById: jest.Mock<UsersService['findById']> };

  const dbUser = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'u1',
      role: Role.USER,
      deletedAt: null,
      passwordHash: '$argon2id$should-never-leave-the-service',
      email: 'ada@example.com',
      ...overrides,
    }) as unknown as Awaited<ReturnType<UsersService['findById']>>;

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

    session = new SessionService(jwt, users as unknown as UsersService);
  });

  const validToken = () => jwt.signAsync({ sub: 'u1', role: Role.USER });

  describe('bad tokens -> 401, and the database is never queried', () => {
    const badTokens: [string, () => Promise<string>][] = [
      ['empty string', async () => ''],
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
      [
        'validly signed but without exp (a session must always expire)',
        // a JwtService with no default expiresIn signs a token with no exp claim
        () =>
          new JwtService({ secret: SECRET }).signAsync({
            sub: 'u1',
            role: Role.USER,
          }),
      ],
    ];

    it.each(badTokens)('%s', async (_name, make) => {
      const token = await make();

      await expect(session.verify(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findById).not.toHaveBeenCalled();
    });
  });

  describe('valid token, but the user is not usable -> 401', () => {
    it('user does not exist: 401, not the 404 thrown by findById', async () => {
      users.findById.mockRejectedValue(new NotFoundException('User not found'));

      const promise = session.verify(await validToken());

      await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(promise).rejects.not.toBeInstanceOf(NotFoundException);
    });

    it('user is deleted / anonymized (deletedAt set)', async () => {
      users.findById.mockResolvedValue(dbUser({ deletedAt: new Date() }));

      await expect(session.verify(await validToken())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('a real failure (database down) is NOT hidden as a 401', async () => {
      const boom = new Error('db down');
      users.findById.mockRejectedValue(boom);

      const promise = session.verify(await validToken());

      await expect(promise).rejects.toBe(boom);
      await expect(promise).rejects.not.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('valid token and usable user', () => {
    it('loads the user from the token subject', async () => {
      await session.verify(await validToken());

      expect(users.findById).toHaveBeenCalledWith('u1');
    });

    it('returns exactly { id, role, exp }, nothing else from the user', async () => {
      const result = await session.verify(await validToken());

      expect(Object.keys(result).sort()).toEqual(['exp', 'id', 'role']);
      expect(result).toMatchObject({ id: 'u1', role: Role.USER });
      expect(JSON.stringify(result)).not.toContain('argon2');
      expect(JSON.stringify(result)).not.toContain('ada@example.com');
    });

    it('returns the exp claim of the token, in seconds', async () => {
      const token = await validToken();
      const { exp: tokenExp } = fromB64url(token.split('.')[1]) as {
        exp: number;
      };

      const { exp } = await session.verify(token);

      expect(exp).toBe(tokenExp);
      // seconds since epoch, not milliseconds: ~60s from now (signOptions above)
      const nowSeconds = Math.floor(Date.now() / 1000);
      expect(exp).toBeGreaterThan(nowSeconds);
      expect(exp).toBeLessThanOrEqual(nowSeconds + 60);
    });

    it('takes the role from the DATABASE, not from the token (demoted/promoted since login)', async () => {
      const token = await jwt.signAsync({ sub: 'u1', role: Role.USER }); // token says USER
      users.findById.mockResolvedValue(dbUser({ role: Role.ADMIN })); // DB says ADMIN

      const { role } = await session.verify(token);

      expect(role).toBe(Role.ADMIN);
    });

    it('a token claiming ADMIN does not give ADMIN if the DB says USER', async () => {
      const token = await jwt.signAsync({ sub: 'u1', role: Role.ADMIN }); // token says ADMIN
      users.findById.mockResolvedValue(dbUser({ role: Role.USER })); // DB says USER

      const { role } = await session.verify(token);

      expect(role).toBe(Role.USER);
    });
  });

  describe('every failure looks the same to the caller', () => {
    it('throws an identical bare 401 for each failure case', async () => {
      const failures: Array<() => Promise<unknown>> = [
        async () => session.verify('not.a.token'), // garbage
        async () =>
          session.verify(
            await jwt.signAsync({ sub: 'u1' }, { expiresIn: -10 }),
          ), // expired
        async () =>
          session.verify(
            await new JwtService({ secret: SECRET }).signAsync({ sub: 'u1' }),
          ), // no exp
        async () => {
          users.findById.mockRejectedValue(new NotFoundException()); // unknown user
          return session.verify(await validToken());
        },
        async () => {
          users.findById.mockResolvedValue(dbUser({ deletedAt: new Date() })); // deleted user
          return session.verify(await validToken());
        },
      ];

      const bodies: unknown[] = [];
      for (const failure of failures) {
        try {
          await failure();
          throw new Error('expected verify() to reject');
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
