import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './utils/public.decorator';
import { COOKIE_NAME } from './utils/cookie';
import { AuthenticatedRequest } from './utils/auth-request';
import { JwtPayload } from './utils/jwt.payload';
import { User } from '../generated/prisma/client';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token !== 'string' || token === '')
      throw new UnauthorizedException();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    let user: User;
    try {
      user = await this.users.findById(payload.sub);
    } catch (error) {
      if (error instanceof NotFoundException) throw new UnauthorizedException();
      throw error;
    }
    if (user.deletedAt) throw new UnauthorizedException();
    req.user = { id: user.id, role: user.role };
    return true;
  }
}
