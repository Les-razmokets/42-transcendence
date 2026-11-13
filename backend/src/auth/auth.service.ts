import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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

  async issueToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync({ sub: payload.sub, role: payload.role });
  }

  async handleFortyTwoCallback(code: string): Promise<{kind: 'login' | 'pending', token: string}> {
    const fortyTwoToken = await this.fortyTwoClient.exchangeCodeForToken(code);
    const profile = await this.fortyTwoClient.readProfile(fortyTwoToken);
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
      const existing = await this.users.findByEmail(profile.email);
      if (existing) throw new FortyTwoAuthException();

      const pendingToken = await this.jwt.signAsync(
        { typ: 'oauth_pending', ...profile },
        { secret: this.fortyTwo.pendingSecret, expiresIn: '10m' },
      )
      return { kind: 'pending', token: pendingToken } as const;
    }
    if (account.user.deletedAt)
      throw new FortyTwoAuthException();
    const token = await this.issueToken({
      sub: account.user.id,
      role: account.user.role,
    });
    return { kind: 'login', token } as const;
  }
}
