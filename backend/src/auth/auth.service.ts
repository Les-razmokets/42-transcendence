import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UsersCreationDto } from '../users/dto/users.dto';
import { Argon2Hasher } from './argon2-hasher.service';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './utils/jwt.payload';
import { FortyTwoClientService } from './oauth/forty-two/forty-two.service';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthProvider } from '@transcendence/shared';
import { FortyTwoAuthException } from './oauth/forty-two/utils/forty-two-auth.exception';
import { fortyTwoConfig } from './oauth/forty-two/forty-two.config';
import type { ConfigType } from '@nestjs/config';
import { FortyTwoCompleteDto } from './oauth/forty-two/dto/forty-two-complete.dto';
import { Prisma, User } from '../generated/prisma/client';
import { pendingSignupSchema } from './oauth/forty-two/utils/forty-two-response.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly hasher: Argon2Hasher,
    private readonly jwt: JwtService,
    private readonly fortyTwoClient: FortyTwoClientService,
    private readonly prisma: PrismaService,
    @Inject(fortyTwoConfig.KEY)
    private readonly fortyTwo: ConfigType<typeof fortyTwoConfig>,
  ) {}

  // registers a new user
  async register(dto: UsersCreationDto) {
    const passwordHash = await this.hasher.hash(dto.password);
    return this.users.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      pseudo: dto.pseudo,
      email: dto.email,
      birthDate: dto.birthDate,
      phone: dto.phone,
      passwordHash,
    });
  }

  // logs in a new user
  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    const ok = await this.hasher.verify(dto.password, user?.passwordHash);
    if (!user || !user.passwordHash || user.deletedAt || !ok)
      throw new UnauthorizedException('Invalid credentials');
    if (this.hasher.needsRehash(user.passwordHash)) {
      const newHash = await this.hasher.hash(dto.password);
      await this.users.updatePasswordHash(user.id, newHash);
    }
    return user;
  }

  // signs the session JWT (sub + role only, nothing else readable)
  async issueToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync({ sub: payload.sub, role: payload.role });
  }

  // 42 OAuth callback logic: turns a 42 code into either a session token ('login')
  // or a pending signup token ('pending'). Never touches cookies: the controller does that.
  // Any failure throws, and the controller turns it into the generic error redirect.
  async handleFortyTwoCallback(code: string): Promise<{kind: 'login' | 'pending', token: string}> {
    const fortyTwoToken = await this.fortyTwoClient.exchangeCodeForToken(code);
    const profile = await this.fortyTwoClient.readProfile(fortyTwoToken);
    // The link is found by 42 id only, never by email.
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { 
        provider_providerAccountId: {
          provider: OAuthProvider.FORTY_TWO,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (!account) {
      // Email already used by another account: refuse, no automatic linking (option A, see docs/api.md).
      const existing = await this.users.findByEmail(profile.email);
      if (existing) throw new FortyTwoAuthException();

      // No database write yet: the profile waits in a token signed with its own secret,
      // so it can never be used as a session token. typ is checked again in completeFortyTwoSignup.
      const pendingToken = await this.jwt.signAsync(
        { typ: 'oauth_pending', ...profile },
        { secret: this.fortyTwo.pendingSecret, expiresIn: '10m' },
      )
      return { kind: 'pending', token: pendingToken } as const;
    }
    // A soft-deleted (GDPR) user keeps their OAuthAccount row: refuse, otherwise 42 would bring the account back.
    if (account.user.deletedAt)
      throw new FortyTwoAuthException();
    const token = await this.issueToken({
      sub: account.user.id,
      role: account.user.role,
    });
    return { kind: 'login', token } as const;
  }

  // Creates the account of a new 42 user once they gave their birth date.
  // Identity fields come from the signed pending token only; the dto brings just birthDate.
  async completeFortyTwoSignup(pendingToken: string, dto: FortyTwoCompleteDto): Promise<{ user: User, token: string}> {
    // Expired, forged or signed with another secret: verifyAsync throws, and we answer the generic 401.
    let raw: unknown;
    try {
      raw = await this.jwt.verifyAsync(pendingToken, { secret: this.fortyTwo.pendingSecret });
    } catch {
      throw new FortyTwoAuthException();
    }
    // A valid signature is not enough: the payload must be a pending signup (typ), with every field.
    const parsed = pendingSignupSchema.safeParse(raw);
    if (!parsed.success) throw new FortyTwoAuthException();
    const payload = parsed.data;
    let user: User;
    try {
      // Nested create: the user and the 42 link are written in one atomic query. No password.
      user = await this.prisma.user.create({
        data: {
          email: payload.email,
          pseudo: payload.login,
          firstName: payload.firstName,
          lastName: payload.lastName,
          birthDate: dto.birthDate,
          oauthAccounts: { create: { provider: OAuthProvider.FORTY_TWO, providerAccountId: payload.providerAccountId } },
        },
      });
    } catch (error) {
      // Unique conflict (double submit, race, email or pseudo taken meanwhile): plain 409,
      // without naming the field. Any other error goes up unchanged.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException();
      }
      throw error;
    }
    const token = await this.issueToken({ sub: user.id, role: user.role });
    return { user, token };
  }
}
