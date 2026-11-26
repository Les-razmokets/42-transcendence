import { Module } from '@nestjs/common';
import { WebsocketsGateway } from './websockets.gateway';
import { AuthModule } from '../auth/auth.module';

// Real-time module (Socket.IO). The gateway is a provider: Nest instantiates it and
// starts the Socket.IO server on the same HTTP server as the REST API.
// AuthModule is imported for SessionService (handshake authentication).
// ConfigService needs no import: ConfigModule is global (see app.module.ts).
@Module({
  providers: [WebsocketsGateway],
  imports: [AuthModule],
})
export class WebsocketsModule {}
