import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './utils/public.decorator';
import { ROLES_KEY } from './utils/roles.decorator';
import type { Role } from '../generated/prisma/client';
import { AuthenticatedRequest } from './utils/auth-request';

/**
 * Guard that implements Role-Based Access Control (RBAC) in NestJS.
 * It checks handlers and controllers for metadata set by `@Public()` and `@Roles()`
 * decorators to determine if the current request is authorized.
 *
 * Flow:
 * 1. Checks if the route is marked as public (`IS_PUBLIC_KEY`). If so, allows access immediately.
 * 2. Retrieves required roles (`ROLES_KEY`). If no roles are specified, allows access.
 * 3. Extracts the user from the HTTP request and checks if they are authenticated (`UnauthorizedException`).
 * 4. Verifies if the user's role is included in the allowed roles list (`ForbiddenException` if not).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // WS security lives in the handshake middleware in the gateway (../websockets/websockets.gateway.ts)
    if (context.getType() !== 'http') {
      if (roles) {
        throw new Error(
          '@Roles is for HTTP-only; for WebSocket handlers, check permissions in the handler',
        );
      }
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new UnauthorizedException();
    const allowed = roles.includes(req.user.role);
    if (!allowed) throw new ForbiddenException();
    return true;
  }
}
