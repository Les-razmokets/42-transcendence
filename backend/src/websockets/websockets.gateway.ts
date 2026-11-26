/**
 * Real-time entry point of the backend (Socket.IO).
 *
 * How a client gets in:
 *  1. The browser opens wss://<host>/socket.io/ (nginx forwards it here, see infra/nginx/default.conf).
 *  2. The handshake middleware (afterInit) checks the Origin and the session cookie
 *     BEFORE the connection exists. Refused = the client gets a `connect_error`.
 *  3. Accepted: handleConnection joins the personal room `user:<id>` and schedules
 *     a disconnection for the moment the JWT expires.
 *
 * Security model: authentication is done ONCE, at the handshake. The HTTP guards
 * (AuthGuard, RolesGuard) let WebSocket messages through on purpose, so every
 * handler that needs a permission (e.g. casino membership) must check it itself
 * and throw a WsException when refused.
 *
 * Errors thrown in a handler are logged and turned into an 'exception' event
 * by WsLoggingExceptionFilter.
 */
import { Logger, UnauthorizedException, UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../auth/session.service';
import { parse } from 'cookie';
import { COOKIE_NAME } from '../auth/utils/cookie';
import type { AppServer, AppSocket } from './websockets.types';
import { userRoom } from './rooms';
import { WsLoggingExceptionFilter } from './websockets.logging-exception-filter';

// No options: default namespace "/" and default path "/socket.io/", which is what
// nginx routes here and what socket.io-client uses by default.
@UseFilters(WsLoggingExceptionFilter)
@WebSocketGateway()
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  // The Socket.IO server, injected by Nest. Use it to emit to rooms:
  // this.server.to(userRoom(id)).emit(...)
  @WebSocketServer() server: AppServer;
  private readonly logger: Logger = new Logger(WebsocketsGateway.name);
  // The only origin allowed to open a socket (exact match: scheme + host + port).
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly session: SessionService,
  ) {
    // Read once at startup: a missing FRONTEND_URL crashes the app at boot,
    // not at the first connection. Do not add computed values as constructor
    // parameters: Nest would try to inject them.
    this.frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
  }

  // Test handler: answers to the sender only (client.emit), never broadcasts.
  // Not @Public(): it is protected by the handshake like every other handler.
  @SubscribeMessage('ping')
  handleMessage(
    @MessageBody() _message: string,
    @ConnectedSocket() client: AppSocket,
  ): void {
    client.emit('pong', { message: 'pong' });
  }

  // Client IP for the logs ONLY, never for a security decision.
  // nginx overwrites X-Forwarded-For with the real client address; we still take
  // the first entry in case a proxy appends to it (list "client, proxy1") or the
  // header is repeated (array). Without the header (tests, direct access), we fall
  // back to the TCP address. Note: with rootless Docker it is the Docker gateway IP.
  private getClientIp(socket: AppSocket): string {
    const xff = socket.handshake.headers['x-forwarded-for'];

    const rawIp = Array.isArray(xff) ? xff[0] : xff?.split(',')[0];

    const cleaned = rawIp?.trim();
    return cleaned || socket.handshake.address;
  }

  // Logs WHY a handshake was refused (server side only) and returns the error
  // for next(). The client always gets the same generic 'unauthorized', so an
  // attacker cannot learn which check failed. Never log the token itself.
  private reject(
    socket: AppSocket,
    reason: 'bad origin' | 'missing cookie' | 'invalid session',
  ): Error {
    this.logger.warn(
      `WS refused (${reason}) socket=${socket.id} origin=${socket.handshake.headers.origin} ip=${this.getClientIp(socket)}`,
    );
    return new Error('unauthorized');
  }

  // Ends a session whose JWT has expired. disconnect(true) closes the underlying
  // connection, not only this namespace. The client then receives the reason
  // 'io server disconnect', after which socket.io-client does NOT reconnect by
  // itself: the frontend must refresh the session, then call socket.connect().
  // A normal expiry is ordinary information ('log'); a token already expired at
  // connection time is unusual ('warn').
  private expire(
    socket: AppSocket,
    reason: 'already expired' | 'expired',
  ): void {
    const level = reason === 'already expired' ? 'warn' : 'log';
    this.logger[level](
      `Session ${reason} socket=${socket.id} user=${socket.data.user.id}`,
    );
    socket.disconnect(true);
  }

  // Lifecycle hook, called once by Nest when the server is ready.
  // We register the handshake middleware here: it runs for every new socket
  // BEFORE the connection is accepted, so no message can be handled before the
  // user is authenticated (handleConnection would be too late: the socket is
  // already connected and Nest does not wait for an async handleConnection).
  afterInit(_server: AppServer) {
    this.logger.log('init');
    this.server.use(async (socket, next) => {
      // Every refusal must `return next(...)`: calling next() does not stop the
      // function, and a second next() would accept the socket anyway.

      // 1. Origin, first: it is free (string comparison), while the session check
      //    costs a JWT verification + a DB query. The browser sets Origin itself,
      //    so a malicious page cannot fake it (anti cross-site WebSocket hijacking:
      //    CORS does not apply to WebSockets and SameSite=lax ignores the port).
      //    A script can fake it, but a script has no victim's cookie.
      if (socket.handshake.headers.origin !== this.frontendUrl) {
        return next(this.reject(socket, 'bad origin'));
      }
      // 2. Session cookie. There is no cookie-parser on the WebSocket side, so we
      //    parse the raw Cookie header ourselves (undefined when there is none).
      const cookies = parse(socket.handshake.headers.cookie ?? '');
      const token = cookies[COOKIE_NAME];
      if (typeof token !== 'string' || token === '') {
        return next(this.reject(socket, 'missing cookie'));
      }
      // 3. Same verification as HTTP (SessionService): signature, expiry, user
      //    still exists and is not deleted. The result stays on the socket for
      //    its whole life: socket.data.user = { id, role, exp }.
      try {
        socket.data.user = await this.session.verify(token);
        return next();
      } catch (error) {
        // UnauthorizedException = a bad session (expected, warn).
        // Anything else = a real failure (DB down, bug): error + stack, but the
        // client still only gets the generic refusal.
        if (error instanceof UnauthorizedException) {
          return next(this.reject(socket, 'invalid session'));
        } else {
          this.logger.error(
            `WS session verification failed socket=${socket.id} ip=${this.getClientIp(socket)}`,
            error instanceof Error ? error.stack : String(error),
          );
          return next(new Error('unauthorized'));
        }
      }
    });
  }

  // Lifecycle hook, called by Nest for every socket the middleware accepted.
  // Nest does NOT await it: it must never throw or reject.
  async handleConnection(client: AppSocket) {
    this.logger.log(`Client connected: ${client.id}`);
    // Personal room: every tab of the same user joins user:<id>, so
    // this.server.to(userRoom(id)).emit(...) reaches all of them (notifications).
    // join() is synchronous with the default in-memory adapter but async with
    // others (e.g. Redis): we await it, and a failure must not stay silent.
    try {
      await client.join(userRoom(client.data.user.id));
    } catch (error) {
      // A socket without its personal room would silently miss its
      // notifications: better to fail visibly and let the client reconnect.
      this.logger.error(
        `WS join failed socket=${client.id} user=${client.data.user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      client.disconnect(true);
      return;
    }
    // The client may have left while we were awaiting join(): handleDisconnect
    // already ran, so a timer created now would never be cleared.
    if (!client.connected) return;
    // exp is in SECONDS (JWT standard), Date.now() in MILLISECONDS.
    const delay = client.data.user.exp * 1000 - Date.now();
    if (delay <= 0) {
      // Rare: the token expired between the middleware check and now.
      this.expire(client, 'already expired');
    } else {
      // Kept on the socket so handleDisconnect can cancel it.
      client.data.expiryTimer = setTimeout(() => {
        this.expire(client, 'expired');
      }, delay);
    }
  }

  // Lifecycle hook, called by Nest whenever a socket goes away, whatever the
  // reason ('transport close', 'client namespace disconnect', 'ping timeout',
  // 'server namespace disconnect' after our own disconnect(true)...).
  handleDisconnect(client: AppSocket, reason?: string) {
    this.logger.log(`Client disconnected: ${client.id}. Reason: ${reason}`);
    // Without this, every closed socket would leave a pending timer behind
    // (memory leak) that later disconnects a dead socket. clearTimeout(undefined)
    // is a no-op, so sockets without a timer are fine.
    clearTimeout(client.data.expiryTimer);
  }
}
