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
    // Check if the route or controller is marked as public using the Reflector and custom public key
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true; // Bypass authentication for public routes
    // Switch to the HTTP context and retrieve the authentication token from cookies
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token !== 'string' || token === '')
      throw new UnauthorizedException(); // Reject if the token is missing or not a valid string
    let payload: JwtPayload;
    try {
      // Verify the JWT signature, expiration, and algorithm (restricted to HS256)
      payload = await this.jwt.verifyAsync(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(); // Reject if token verification fails (e.g., expired or tampered with)
    }
    let user: User;
    try {
      // Look up the user in the database using the subject ID stored in the token payload
      user = await this.users.findById(payload.sub);
    } catch (error) {
      if (error instanceof NotFoundException) throw new UnauthorizedException();
      throw error; // Re-throw unexpected system or database errors
    }
    // Check if the user account has been soft-deleted or deactivated
    if (user.deletedAt) throw new UnauthorizedException();
    // Attach the minimal user info (id and role) to the request object for downstream route handlers/guards
    req.user = { id: user.id, role: user.role };
    return true; // Allow the request to proceed
  }
}
