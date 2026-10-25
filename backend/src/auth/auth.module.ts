import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { Argon2Hasher } from './argon2-hasher.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
          const expiresIn = Number(config.getOrThrow<string>('JWT_EXPIRES_IN_SECONDS'));
          if (!Number.isInteger(expiresIn) || expiresIn <= 0)
            throw new Error('JWT_EXPIRES_IN_SECONDS must be a positive integer');
          return {
            secret: config.getOrThrow<string>('JWT_SECRET'),
            signOptions: { algorithm: 'HS256', expiresIn },
        }
      }
    }),
    PassportModule
  ],
  controllers: [AuthController],
  providers: [AuthService, Argon2Hasher],
})
export class AuthModule {}
