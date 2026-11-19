import { Logger } from '@nestjs/common';
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

@WebSocketGateway()
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger: Logger = new Logger(WebsocketsGateway.name);

  @Public()
  @SubscribeMessage('ping')
  handleMessage(
    @MessageBody() _message: string,
    @ConnectedSocket() client: Socket
  ): void {
    client.emit('pong', { message: 'pong' });
  }

  afterInit(_server: Server) {
    this.logger.log('init');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket, reason?: string) {
    this.logger.log(`Client disconnected: ${client.id}. Reason: ${reason}`);
  }
}
