import {
  Controller,
  Post,
  Body,
  SerializeOptions,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { myProfileUserSchema } from '../users/users-response.schemas';
import { UsersCreationDto } from '../users/dto/users.dto';
import { Public } from './utils/public.decorator';
import { LoginDto } from './dto/login.dto';
import { COOKIE_NAME, buildCookieOptions } from './utils/cookie';
import { getJwtLifetimeSeconds } from './utils/jwt.lifetime';
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Build the cookie options.
  private cookieOptions() {
    return buildCookieOptions(
      getJwtLifetimeSeconds(this.config),
      this.config.get('NODE_ENV') === 'production',
    );
  }

  // Register endpoint with custom response schema.
  @Public()
  @SerializeOptions({ schema: myProfileUserSchema })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: UsersCreationDto) {
    return this.auth.register(dto);
  }

  // Login endpoint with custom response schema.
  @Public()
  @SerializeOptions({ schema: myProfileUserSchema })
  @HttpCode(HttpStatus.OK)
  // Rate limiting decorator: allows a maximum of 5 requests per 60 seconds (60000ms) to prevent brute-force attacks
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    // passthrough: true allows NestJS to handle standard returns while still granting raw Response access for cookies
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.login(dto);
    // Generates a JWT containing user ID and role.
    const token = await this.auth.issueToken({ sub: user.id, role: user.role });
    // Set the authentication token securely inside an HTTP-only cookie
    res.cookie(COOKIE_NAME, token, this.cookieOptions());
    return user;
  }

  // Logout endpoint
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Destructure out maxAge to retain matching cookie options (path, domain, secure flags) required to successfully clear it
    const { maxAge, ...clearOptions } = this.cookieOptions(); // same name/path/sameSite/secure, no maxAge
    // Clear the authentication cookie from the client browser
    res.clearCookie(COOKIE_NAME, clearOptions);
  }
}
