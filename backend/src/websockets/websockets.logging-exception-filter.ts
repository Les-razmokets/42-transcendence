import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Logger,
  ExceptionFilter,
} from '@nestjs/common';
import type { AppSocket } from './utils/websockets.types';
import { WebSocketsException } from './utils/websockets.exception';
import { WsAck, WsErrorCode } from '@transcendence/shared';
import { extractLogReason } from './utils/websocket.filter-utils';

/**
 * Catches every error thrown in a WebSocket handler (applied with @UseFilters on
 * the gateway, not globally: a global filter would also catch HTTP errors, which
 * Nest already handles in its own way).
 *
 * Why it exists: Nest's default WebSocket handling logs nothing for an
 * HttpException (e.g. an UnauthorizedException thrown in a handler) and only sends
 * "Internal server error" to the client. Errors were invisible on the server.
 *
 * What it does:
 *  - turns what was thrown into ONE error code (see WsErrorCode in @transcendence/shared):
 *      WebSocketsException  -> its own code         (expected refusal, warn)
 *      BadRequestException  -> INVALID              (ValidationPipe, warn)
 *      anything else        -> INTERNAL             (bug, DB down..., error + stack)
 *  - logs every error exactly ONCE, with the event name, the socket and the user;
 *  - THEN replies through the client's ack callback with { ok: false, code }, and
 *    nothing else: never a message or a reason (they could reveal whether a casino
 *    exists). No ack callback (client emitted without one) -> logged, no reply.
 *  - never emits an 'exception' event: the ack is the only channel for errors.
 *
 * In handlers: succeed by RETURNING the ack, fail by THROWING. For an expected
 * refusal throw `new WebSocketsException(code, reason)`: the code goes to the
 * client, the reason only to the log. Never return { ok: false } yourself (this
 * filter would not see it, so nothing would be logged), and never throw a plain
 * WsException (it is treated as a bug: INTERNAL).
 */
@Catch() // no argument: catches everything, not only WsException
export class WsLoggingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsLoggingExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const socket = host.switchToWs().getClient<AppSocket>();
    const eventName = host.switchToWs().getPattern();

    let code: WsErrorCode;
    // socket.data.user is always set here: a handler only runs on a socket the
    // handshake middleware accepted. Never log host.switchToWs().getData(): it is
    // whatever the client sent.
    if (exception instanceof WebSocketsException) {
      // Expected refusal (bad input, no permission...): warning, no stack.
      const reasonPart = exception.reason
        ? ` exception_reason=${exception.reason}`
        : '';
      code = exception.code;
      this.logger.warn(
        `event_name=${eventName} socket=${socket.id} user=${socket.data.user.id} exception_code=${code}${reasonPart}`,
      );
    } else if (exception instanceof BadRequestException) {
      code = 'INVALID';
      const safeReason = extractLogReason(exception);
      this.logger.warn(
        `event_name=${eventName} socket=${socket.id} user=${socket.data.user.id} exception_code=${code} exception_message=${safeReason}`,
      );
    } else {
      // Unexpected (bug, DB down, HttpException in a WS handler, @Roles misuse...):
      // error WITH the stack trace.
      code = 'INTERNAL';
      this.logger.error(
        `event_name=${eventName} socket=${socket.id} user=${socket.data.user.id} exception_code=${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    // Reply AFTER logging: if the ack throws, the log line is already written.
    // WS handler arguments are [client, data, ack, pattern]: the ack is index 2
    // (undefined when the client did not pass a callback). Not the last one:
    // that is the pattern (event name).
    const arg = host.getArgByIndex<unknown>(2);
    const ack =
      typeof arg === 'function' ? (arg as (res: WsAck) => void) : undefined;
    ack?.({ ok: false, code });
  }
}
