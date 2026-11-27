import { WsException } from '@nestjs/websockets';
import { WsErrorCode } from '@transcendence/shared';

export type ClientWsErrorCode = Exclude<WsErrorCode, 'INTERNAL'>;

export class WebSocketsException extends WsException {
  constructor(
    public readonly code: ClientWsErrorCode,
    public readonly reason?: string,
  ) {
    super(code);
  }
}
