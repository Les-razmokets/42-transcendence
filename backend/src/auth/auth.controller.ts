import {
  Controller,
  Post,
  Body,
  SerializeOptions,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { myProfileUserSchema } from '@transcendence/shared';
import { UsersCreationDto } from '../users/dto/users.dto';
import { Public } from './utils/public.decorator';
import { LoginDto } from './dto/login.dto';
import {
  COOKIE_NAME,
  OAUTH_COOKIE,
  OAUTH_PENDING_COOKIE,
  buildCookieOptions,
  buildOauthCookieOptions,
} from './utils/cookie';
import { getJwtLifetimeSeconds } from './utils/jwt.lifetime';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { FortyTwoClientService } from './oauth/forty-two/forty-two.service';
import * as crypto from 'crypto';
import { FortyTwoAuthException } from './oauth/forty-two/utils/forty-two-auth.exception';
import { User } from '../generated/prisma/client';
import { FortyTwoCompleteDto } from './oauth/forty-two/dto/forty-two-complete.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly fortyTwoClient: FortyTwoClientService,
  ) {}

  // Build the cookie options.
  private cookieOptions() {
    return buildCookieOptions(
      getJwtLifetimeSeconds(this.config),
      this.config.get('NODE_ENV') === 'production',
    );
  }

  private isProd(): boolean {
    return this.config.get('NODE_ENV') === 'production';
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
    const { maxAge: _maxAge, ...clearOptions } = this.cookieOptions(); // same name/path/sameSite/secure, no maxAge
    // Clear the authentication cookie from the client browser
    res.clearCookie(COOKIE_NAME, clearOptions);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get('42')
  redirectTo42(@Res() res: Response) {
    const state = crypto.randomBytes(32).toString('hex');
    res.cookie(OAUTH_COOKIE, state, buildOauthCookieOptions(600, this.isProd()));
    res.redirect(this.fortyTwoClient.buildAuthUrl(state));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get('42/callback')
  async callback42(
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const cookieState = req.cookies[OAUTH_COOKIE];
    const frontUrl = this.config.getOrThrow('FRONTEND_URL');
    const { maxAge: _maxAge, ...clearOauth } = buildOauthCookieOptions(0, this.isProd());
    res.clearCookie(OAUTH_COOKIE, clearOauth);
    const { code, state } = req.query;

    try {
      if (typeof code !== 'string' || typeof state !== 'string' || typeof cookieState !== 'string')
        throw new FortyTwoAuthException();

      const a = Buffer.from(state);
      const b = Buffer.from(cookieState);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) throw new FortyTwoAuthException();
      const result = await this.auth.handleFortyTwoCallback(code);
      if (result.kind === 'login') {
        res.cookie(COOKIE_NAME, result.token, this.cookieOptions());
        return res.redirect(frontUrl);
      }
      res.cookie(OAUTH_PENDING_COOKIE, result.token, buildOauthCookieOptions(600, this.isProd()))
      return res.redirect(`${frontUrl}/signup/42`);
    } catch {
      return res.redirect(`${frontUrl}/login?error=oauth`);
    }
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SerializeOptions({ schema: myProfileUserSchema })
  @Post('42/complete')
  async complete42signup(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Body() dto: FortyTwoCompleteDto,
  ): Promise<User> {
    const pendingToken = req.cookies[OAUTH_PENDING_COOKIE];
    if (typeof pendingToken !== 'string') throw new FortyTwoAuthException();
    const { user, token } = await this.auth.completeFortyTwoSignup(pendingToken, dto);
    const { maxAge: _maxAge, ...clearOauth } = buildOauthCookieOptions(0, this.isProd());
    res.clearCookie(OAUTH_PENDING_COOKIE, clearOauth);
    res.cookie(COOKIE_NAME, token, this.cookieOptions());
    return user;
  }
}
