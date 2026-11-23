import { Module } from '@nestjs/common';
import { WebsocketsGateway } from './websockets.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  providers: [WebsocketsGateway],
  imports: [AuthModule],
})
export class WebsocketsModule {}
