import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { Argon2Hasher } from './argon2-hasher.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, Argon2Hasher],
})
export class AuthModule {}
