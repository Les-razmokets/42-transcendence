import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import {
  BaseWsExceptionFilter,
  ErrorPayload,
  WsException,
} from '@nestjs/websockets';
import type { AppSocket } from './websockets.types';
import { MESSAGES } from '@nestjs/core/constants';

@Catch()
export class WsLoggingExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsLoggingExceptionFilter.name);
  constructor() {
    super({ includeCause: false });
  }

  override catch(exception: unknown, host: ArgumentsHost) {
    const socket = host.switchToWs().getClient<AppSocket>();
    const eventName = host.switchToWs().getPattern();
    if (exception instanceof WsException) {
      this.logger.warn(
        `EventName=${eventName} socket=${socket.id} user=${socket.data.user.id} exception=${exception.message}`,
      );
    } else {
      this.logger.error(
        `EventName=${eventName} socket=${socket.id} user=${socket.data.user.id}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    super.catch(exception, host);
  }

  override handleUnknownError<
    TClient extends { emit?: Function; send?: Function },
  >(_exception: unknown, client: TClient, _data: ErrorPayload['cause']): void {
    this.emitMessage(client, 'exception', {
      status: 'error',
      message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
    });
  }
}
