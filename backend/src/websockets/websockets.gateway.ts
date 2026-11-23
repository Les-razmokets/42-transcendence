import { Logger, UnauthorizedException } from '@nestjs/common';
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
import { Server, Socket } from 'socket.io';
import { Public } from '../auth/utils/public.decorator';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../auth/session.service';
import { parse } from 'cookie';
import { COOKIE_NAME } from '../auth/utils/cookie';

@WebSocketGateway()
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
  {
  @WebSocketServer() server: Server;
  private readonly logger: Logger = new Logger(WebsocketsGateway.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly session: SessionService,
  ) {
    this.frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
  }

  @Public()
  @SubscribeMessage('ping')
  handleMessage(
    @MessageBody() _message: string,
    @ConnectedSocket() client: Socket
  ): void {
    client.emit('pong', { message: 'pong' });
  }

  private reject(socket: Socket, reason: 'bad origin' | 'missing cookie' | 'invalid session'): Error {
    this.logger.warn(`WS refused (${reason}) socket=${socket.id} origin=${socket.handshake.headers.origin} ip=${socket.handshake.headers['x-forwarded-for']}`);
    return new Error('unauthorized');
  }

  afterInit(_server: Server) {
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
            `WS session verification failed socket=${socket.id}`,
            error instanceof Error ? error.stack : String(error),
          );
          return next(new Error('unauthorized'));
        }
      }
    })
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket, reason?: string) {
    this.logger.log(`Client disconnected: ${client.id}. Reason: ${reason}`);
  }
}
