import { AuthenticatedUser } from './auth-request';

/**
 * What SessionService.verify() returns: the authenticated user plus the token expiry.
 *
 * Each transport keeps what it needs:
 *  - HTTP (AuthGuard) keeps only { id, role } in req.user: every request is
 *    verified again, so nobody needs to know when the token expires;
 *  - WebSocket keeps all of it in socket.data.user: the socket stays open and is
 *    verified only once, so exp is needed to disconnect it on time.
 */
export interface VerifiedSession extends AuthenticatedUser {
  // JWT "exp" claim: expiry time in SECONDS since 1970 (not milliseconds).
  exp: number;
}
