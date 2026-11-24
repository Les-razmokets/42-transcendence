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

@UseFilters(WsLoggingExceptionFilter)
@WebSocketGateway()
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: AppServer;
  private readonly logger: Logger = new Logger(WebsocketsGateway.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly session: SessionService,
  ) {
    this.frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
  }

  @SubscribeMessage('ping')
  handleMessage(
    @MessageBody() _message: string,
    @ConnectedSocket() client: AppSocket,
  ): void {
    client.emit('pong', { message: 'pong' });
  }

  private getClientIp(socket: AppSocket): string {
    const xff = socket.handshake.headers['x-forwarded-for'];

    const rawIp = Array.isArray(xff) ? xff[0] : xff?.split(',')[0];

    const cleaned = rawIp?.trim();
    return cleaned || socket.handshake.address;
  }

  private reject(
    socket: AppSocket,
    reason: 'bad origin' | 'missing cookie' | 'invalid session',
  ): Error {
    this.logger.warn(
      `WS refused (${reason}) socket=${socket.id} origin=${socket.handshake.headers.origin} ip=${this.getClientIp(socket)}`,
    );
    return new Error('unauthorized');
  }

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

  afterInit(_server: AppServer) {
    this.logger.log('init');
    this.server.use(async (socket, next) => {
      if (socket.handshake.headers.origin !== this.frontendUrl) {
        return next(this.reject(socket, 'bad origin'));
      }
      const cookies = parse(socket.handshake.headers.cookie ?? '');
      const token = cookies[COOKIE_NAME];
      if (typeof token !== 'string' || token === '') {
        return next(this.reject(socket, 'missing cookie'));
      }
      try {
        socket.data.user = await this.session.verify(token);
        return next();
      } catch (error) {
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

  // await is correct with any adapter so try/catch so it doesnt fail silently
  async handleConnection(client: AppSocket) {
    this.logger.log(`Client connected: ${client.id}`);
    try {
      await client.join(userRoom(client.data.user.id));
    } catch (error) {
      this.logger.error(
        `WS join failed socket=${client.id} user=${client.data.user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      client.disconnect(true);
      return;
    }
    if (!client.connected) return;
    const delay = client.data.user.exp * 1000 - Date.now();
    if (delay <= 0) {
      this.expire(client, 'already expired');
    } else {
      client.data.expiryTimer = setTimeout(() => {
        this.expire(client, 'expired');
      }, delay);
    }
  }

  handleDisconnect(client: AppSocket, reason?: string) {
    this.logger.log(`Client disconnected: ${client.id}. Reason: ${reason}`);
    clearTimeout(client.data.expiryTimer);
  }
}
