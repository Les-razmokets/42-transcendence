import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../generated/prisma/client';
import { JwtPayload } from './utils/jwt.payload';
import { AuthenticatedUser } from './utils/auth-request';

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async verify(token: string): Promise<AuthenticatedUser & { exp: number }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload.exp !== 'number') throw new UnauthorizedException();
    let user: User;
    try {
      user = await this.users.findById(payload.sub);
    } catch (error) {
      if (error instanceof NotFoundException) throw new UnauthorizedException();
      throw error;
    }
    if (user.deletedAt) throw new UnauthorizedException();
    return { id: user.id, role: user.role, exp: payload.exp };
  }
}
