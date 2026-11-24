import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './utils/public.decorator';
import { COOKIE_NAME } from './utils/cookie';
import { AuthenticatedRequest } from './utils/auth-request';
import { SessionService } from './session.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly session: SessionService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WS security lives in the handshake middleware in the gateway (../websockets/websockets.gateway.ts)
    // APP_GUARD guards also run on every WebSocket message. Outside HTTP there is no
    // request and no cookie to read (switchToHttp() would return the Socket), and
    // the socket was already authenticated once at the handshake: nothing to do here.
    if (context.getType() !== 'http') return true;
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
    const { id, role } = await this.session.verify(token);
    req.user = { id, role };
    return true; // Allow the request to proceed
  }
}
