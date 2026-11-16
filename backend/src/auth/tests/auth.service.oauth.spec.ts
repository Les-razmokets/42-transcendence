import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  jest,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Argon2Hasher } from '../argon2-hasher.service';
import { UsersService } from '../../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FortyTwoClientService } from '../oauth/forty-two/forty-two.service';
import { fortyTwoConfig } from '../oauth/forty-two/forty-two.config';
import { FortyTwoAuthException } from '../oauth/forty-two/utils/forty-two-auth.exception';
import type { FortyTwoProfile } from '../oauth/forty-two/utils/forty-two-response.schema';
import { FortyTwoCompleteDto } from '../oauth/forty-two/dto/forty-two-complete.dto';
import { Prisma, Role, OAuthProvider } from '../../generated/prisma/client';

/*
 * Real JwtModule (not a mocked JwtService): the pending token is really signed and verified,
 * so these tests prove that the two secrets are kept apart. 42 and the database are mocks.
 */

const SESSION_SECRET = 'session-secret-for-unit-tests-0123456789abcdef';
const PENDING_SECRET = 'pending-secret-for-unit-tests-0123456789abcdef';

const PROFILE: FortyTwoProfile = {
  providerAccountId: '123456',
  email: 'jdoe@student.42.fr',
  login: '42jdoe',
  firstName: 'John',
  lastName: 'Doe',
};

const USER = {
  id: 'user-1',
  email: PROFILE.email,
  pseudo: PROFILE.login,
  role: Role.USER,
  deletedAt: null as Date | null,
};

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('AuthService: 42 OAuth', () => {
  let service: AuthService;
  let jwt: JwtService;

  let fortyTwoClient: {
    exchangeCodeForToken: jest.Mock<FortyTwoClientService['exchangeCodeForToken']>;
    readProfile: jest.Mock<FortyTwoClientService['readProfile']>;
  };
  let users: { findByEmail: jest.Mock<UsersService['findByEmail']> };
  let prisma: {
    oAuthAccount: { findUnique: jest.Mock<(...args: any[]) => Promise<any>> };
    user: { create: jest.Mock<(...args: any[]) => Promise<any>> };
  };

  beforeAll(() => {
    // a standalone signer for forging tokens in the tests
    jwt = new JwtService({});
  });

  beforeEach(async () => {
    fortyTwoClient = {
      exchangeCodeForToken: jest.fn<FortyTwoClientService['exchangeCodeForToken']>(),
      readProfile: jest.fn<FortyTwoClientService['readProfile']>(),
    };
    users = { findByEmail: jest.fn<UsersService['findByEmail']>() };
    prisma = {
      oAuthAccount: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
      user: { create: jest.fn<(...args: any[]) => Promise<any>>() },
    };

    fortyTwoClient.exchangeCodeForToken.mockResolvedValue('42-access-token');
    fortyTwoClient.readProfile.mockResolvedValue(PROFILE);
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: SESSION_SECRET,
          signOptions: { algorithm: 'HS256', expiresIn: 3600 },
        }),
      ],
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: Argon2Hasher, useValue: {} },
        { provide: FortyTwoClientService, useValue: fortyTwoClient },
        { provide: PrismaService, useValue: prisma },
        {
          provide: fortyTwoConfig.KEY,
          useValue: { pendingSecret: PENDING_SECRET },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('handleFortyTwoCallback', () => {
    it('exchanges the code, then reads the profile with the 42 token', async () => {
      await service.handleFortyTwoCallback('the-code');

      expect(fortyTwoClient.exchangeCodeForToken).toHaveBeenCalledWith('the-code');
      expect(fortyTwoClient.readProfile).toHaveBeenCalledWith('42-access-token');
    });

    it('looks the account up by (FORTY_TWO, 42 id)', async () => {
      await service.handleFortyTwoCallback('code');

      expect(prisma.oAuthAccount.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            provider_providerAccountId: {
              provider: OAuthProvider.FORTY_TWO,
              providerAccountId: PROFILE.providerAccountId,
            },
          },
        }),
      );
    });

    it('lets a 42 failure through and touches nothing else', async () => {
      fortyTwoClient.exchangeCodeForToken.mockRejectedValue(
        new FortyTwoAuthException(),
      );

      await expect(service.handleFortyTwoCallback('code')).rejects.toThrow(
        FortyTwoAuthException,
      );
      expect(fortyTwoClient.readProfile).not.toHaveBeenCalled();
      expect(prisma.oAuthAccount.findUnique).not.toHaveBeenCalled();
    });

    describe('account already linked', () => {
      beforeEach(() => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({ user: USER });
      });

      it('returns a session token for that user', async () => {
        const result = await service.handleFortyTwoCallback('code');
        expect(result.kind).toBe('login');

        const payload = await jwt.verifyAsync(result.token, {
          secret: SESSION_SECRET,
        });
        expect(payload.sub).toBe(USER.id);
        expect(payload.role).toBe(USER.role);
      });

      it('does not look at the email (the link is by 42 id only)', async () => {
        await service.handleFortyTwoCallback('code');
        expect(users.findByEmail).not.toHaveBeenCalled();
      });

      it('refuses a soft-deleted user', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...USER, deletedAt: new Date() },
        });

        await expect(service.handleFortyTwoCallback('code')).rejects.toThrow(
          FortyTwoAuthException,
        );
      });
    });

    describe('unknown account', () => {
      it('returns a pending token and writes nothing to the database', async () => {
        const result = await service.handleFortyTwoCallback('code');

        expect(result.kind).toBe('pending');
        expect(prisma.user.create).not.toHaveBeenCalled();
      });

      it('the pending token is signed with the pending secret and carries the profile', async () => {
        const { token } = await service.handleFortyTwoCallback('code');
        const payload = await jwt.verifyAsync(token, { secret: PENDING_SECRET });

        expect(payload).toMatchObject({ typ: 'oauth_pending', ...PROFILE });
      });

      it('the pending token is NOT a valid session token', async () => {
        const { token } = await service.handleFortyTwoCallback('code');
        await expect(
          jwt.verifyAsync(token, { secret: SESSION_SECRET }),
        ).rejects.toThrow();
      });

      it('the pending token expires after 10 minutes', async () => {
        const { token } = await service.handleFortyTwoCallback('code');
        const { iat, exp } = await jwt.verifyAsync(token, {
          secret: PENDING_SECRET,
        });
        expect(exp - iat).toBe(600);
      });

      it('never puts the 42 access token in the pending token', async () => {
        const { token } = await service.handleFortyTwoCallback('code');
        const decoded = Buffer.from(token.split('.')[1], 'base64url').toString();
        expect(decoded).not.toContain('42-access-token');
      });

      it('refuses when the email already belongs to another account (no automatic linking)', async () => {
        users.findByEmail.mockResolvedValue({ id: 'someone-else' } as any);

        await expect(service.handleFortyTwoCallback('code')).rejects.toThrow(
          FortyTwoAuthException,
        );
        expect(users.findByEmail).toHaveBeenCalledWith(PROFILE.email);
        expect(prisma.user.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('completeFortyTwoSignup', () => {
    const dto = { birthDate: new Date('1990-01-01') } as FortyTwoCompleteDto;

    const pendingToken = (
      overrides: Record<string, unknown> = {},
      secret = PENDING_SECRET,
      expiresIn: number = 600,
    ) =>
      jwt.signAsync(
        { typ: 'oauth_pending', ...PROFILE, ...overrides },
        { secret, expiresIn },
      );

    beforeEach(() => {
      prisma.user.create.mockResolvedValue(USER);
    });

    it('creates the user and the 42 link in one query, identity from the token only', async () => {
      await service.completeFortyTwoSignup(await pendingToken(), dto);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: PROFILE.email,
          pseudo: PROFILE.login,
          firstName: PROFILE.firstName,
          lastName: PROFILE.lastName,
          birthDate: dto.birthDate,
          oauthAccounts: {
            create: {
              provider: OAuthProvider.FORTY_TWO,
              providerAccountId: PROFILE.providerAccountId,
            },
          },
        },
      });
    });

    it('never sets a password hash or a role', async () => {
      await service.completeFortyTwoSignup(await pendingToken(), dto);

      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.passwordHash ?? null).toBeNull();
      expect(data).not.toHaveProperty('role');
    });

    it('ignores extra claims a token might carry (role, id)', async () => {
      await service.completeFortyTwoSignup(
        await pendingToken({ role: 'ADMIN', id: 'forced-id' }),
        dto,
      );

      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('role');
      expect(data).not.toHaveProperty('id');
    });

    it('returns the user and a session token for them', async () => {
      const { user, token } = await service.completeFortyTwoSignup(
        await pendingToken(),
        dto,
      );

      expect(user).toBe(USER);
      const payload = await jwt.verifyAsync(token, { secret: SESSION_SECRET });
      expect(payload.sub).toBe(USER.id);
    });

    describe('rejects the pending token (401, nothing created)', () => {
      const cases: [string, () => Promise<string>][] = [
        ['garbage', async () => 'not.a.token'],
        ['signed with the session secret', () => pendingToken({}, SESSION_SECRET)],
        ['expired', () => pendingToken({}, PENDING_SECRET, -10)],
        ['without typ', () => pendingToken({ typ: undefined })],
        ['with another typ', () => pendingToken({ typ: 'access' })],
        ['with a missing field', () => pendingToken({ email: undefined })],
        [
          'a real session token',
          () => jwt.signAsync({ sub: 'u1', role: 'USER' }, { secret: SESSION_SECRET }),
        ],
      ];

      it.each(cases)('%s', async (_name, build) => {
        await expect(
          service.completeFortyTwoSignup(await build(), dto),
        ).rejects.toThrow(FortyTwoAuthException);
        expect(prisma.user.create).not.toHaveBeenCalled();
      });

      it('an edited payload that was not re-signed', async () => {
        const [header, , signature] = (await pendingToken()).split('.');
        const forged = Buffer.from(
          JSON.stringify({ typ: 'oauth_pending', ...PROFILE, email: 'victim@example.com' }),
        ).toString('base64url');

        await expect(
          service.completeFortyTwoSignup(`${header}.${forged}.${signature}`, dto),
        ).rejects.toThrow(FortyTwoAuthException);
        expect(prisma.user.create).not.toHaveBeenCalled();
      });
    });

    it('turns a unique conflict (double submit, race) into a 409', async () => {
      prisma.user.create.mockRejectedValue(p2002());

      await expect(
        service.completeFortyTwoSignup(await pendingToken(), dto),
      ).rejects.toThrow(ConflictException);
    });

    it('does not say which field conflicted', async () => {
      prisma.user.create.mockRejectedValue(p2002());

      const error = (await service
        .completeFortyTwoSignup(await pendingToken(), dto)
        .catch((e: unknown) => e)) as ConflictException;
      expect(error).toBeInstanceOf(ConflictException);
      expect(JSON.stringify(error.getResponse())).not.toMatch(/email|pseudo/i);
    });

    it('lets any other database error through unchanged', async () => {
      const dbDown = new Error('connection refused');
      prisma.user.create.mockRejectedValue(dbDown);

      await expect(
        service.completeFortyTwoSignup(await pendingToken(), dto),
      ).rejects.toBe(dbDown);
    });
  });
});
