import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../generated/prisma/client';
import { JwtPayload } from './utils/jwt.payload';
import { VerifiedSession } from './utils/verified.session';

/**
 * Verifies a session token, whatever transport it came from.
 *
 * Used by AuthGuard (HTTP, token from cookie-parser) and by the WebSocket handshake
 * (token parsed from the raw Cookie header). It takes a plain string on purpose:
 * each transport extracts the token its own way, the validation is the same.
 *
 * Contract:
 *  - every authentication failure throws a bare UnauthorizedException, whatever
 *    the cause, so callers cannot (and must not) tell the causes apart;
 *  - any other error (e.g. DB down) is rethrown as is, never hidden as a 401.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async verify(token: string): Promise<VerifiedSession> {
    let payload: JwtPayload;
    try {
      // Checks the signature and the expiry; the algorithm is pinned to HS256 so a
      // token signed with another algorithm (or "none") is refused.
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    // A session must always expire (the WebSocket side schedules its disconnection
    // from exp). Checked before the DB query: such a token costs nothing.
    if (typeof payload.exp !== 'number') throw new UnauthorizedException();
    let user: User;
    try {
      user = await this.users.findById(payload.sub);
    } catch (error) {
      if (error instanceof NotFoundException) throw new UnauthorizedException();
      throw error;
    }
    if (user.deletedAt) throw new UnauthorizedException();
    // The role comes from the DB, not from the token: a promotion or demotion
    // since login is taken into account.
    return { id: user.id, role: user.role, exp: payload.exp };
  }
}
