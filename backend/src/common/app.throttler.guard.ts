import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate limiter (registered as APP_GUARD in app.module.ts), HTTP only.
 *
 * APP_GUARD guards run on EVERY handler, WebSocket messages included. The stock
 * ThrottlerGuard reads the HTTP request (switchToHttp().getRequest().ip); in a
 * WebSocket context that "request" is the Socket, which has no ip, and the guard
 * crashed every message (the client only saw "Internal server error").
 *
 * So we skip non-HTTP contexts. WebSocket messages are not rate limited for now.
 * If needed later, limit them per user (socket.data.user.id), not per IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // Hook provided by ThrottlerGuard: called at the start of canActivate().
  // `override` makes the compiler fail if the library ever renames it.
  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    return context.getType() !== 'http' || super.shouldSkip(context);
  }
}
