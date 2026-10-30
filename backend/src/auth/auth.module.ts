import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { Argon2Hasher } from './argon2-hasher.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    UsersModule,
    // Asynchronously configure the JwtModule using environment variables from ConfigService
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Retrieve and parse the token expiration time in seconds from environment variables
        const expiresIn = Number(
          config.getOrThrow<string>('JWT_EXPIRES_IN_SECONDS'),
        );
        // Validate that the expiration is a valid positive integer
        if (!Number.isInteger(expiresIn) || expiresIn <= 0)
          throw new Error('JWT_EXPIRES_IN_SECONDS must be a positive integer');
        return {
          // Load the secret key used to sign and verify JWTs securely
          secret: config.getOrThrow<string>('JWT_SECRET'),
          // Enforce the HS256 algorithm and apply the validated expiration duration
          signOptions: { algorithm: 'HS256', expiresIn },
        };
      },
    }),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    Argon2Hasher,
    AuthGuard,
  { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [JwtModule, UsersModule, AuthGuard],
})
export class AuthModule {}
