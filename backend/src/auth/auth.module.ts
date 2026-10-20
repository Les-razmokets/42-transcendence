import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { Argon2Hasher } from './argon2-hasher.service';

@Module({
	imports: [UsersModule, Argon2Hasher ],
	controllers: [AuthController],
	providers: [AuthService],
})
export class AuthModule {}
