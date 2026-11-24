import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import type { AppSocket } from './websockets.types';

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
}
