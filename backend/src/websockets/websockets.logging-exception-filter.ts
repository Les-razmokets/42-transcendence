import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import {
  BaseWsExceptionFilter,
  ErrorPayload,
  WsException,
} from '@nestjs/websockets';
import type { AppSocket } from './websockets.types';
import { MESSAGES } from '@nestjs/core/constants';

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
 *  - logs every error exactly ONCE, with the event name, the socket and the user;
 *  - replies to the client with an 'exception' event, through the parent class.
 *
 * In handlers, throw `new WsException('message')` for an expected refusal (the
 * client receives the message). Anything else is treated as a bug: the client
 * only receives "Internal server error".
 */
@Catch() // no argument: catches everything, not only WsException
export class WsLoggingExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsLoggingExceptionFilter.name);
  constructor() {
    // includeCause: false: by default Nest echoes the event name and the client's
    // own data back in the error ("cause"). Useless to the client, so we drop it.
    super({ includeCause: false });
  }

  override catch(exception: unknown, host: ArgumentsHost) {
    const socket = host.switchToWs().getClient<AppSocket>();
    const eventName = host.switchToWs().getPattern();
    // socket.data.user is always set here: a handler only runs on a socket the
    // handshake middleware accepted. Never log host.switchToWs().getData(): it is
    // whatever the client sent.
    //
    // Known limit: a WsException wrapping an Error (new WsException(err)) is logged
    // as a warning without the original stack. We never wrap errors this way:
    // throw the Error itself, or a WsException with a message.
    if (exception instanceof WsException) {
      // Expected refusal (bad input, no permission...): warning, no stack.
      this.logger.warn(
        `EventName=${eventName} socket=${socket.id} user=${socket.data.user.id} exception=${exception.message}`,
      );
    } else {
      // Unexpected (bug, DB down, HttpException in a WS handler, @Roles misuse...):
      // error WITH the stack trace.
      this.logger.error(
        `EventName=${eventName} socket=${socket.id} user=${socket.data.user.id}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    // The parent builds and sends the reply: a WsException's message as is,
    // anything else goes to handleUnknownError below.
    super.catch(exception, host);
  }

  // Override of the parent's method (the parent calls this.handleUnknownError,
  // so this version runs). The parent's version also logs the error, without
  // any context: since catch() above already logged it, that would be a second
  // log for the same incident. Same reply, no log.
  override handleUnknownError<
    TClient extends { emit?: Function; send?: Function },
  >(_exception: unknown, client: TClient, _data: ErrorPayload['cause']): void {
    this.emitMessage(client, 'exception', {
      status: 'error',
      // "Internal server error", the same text Nest uses everywhere
      message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
    });
  }
}
