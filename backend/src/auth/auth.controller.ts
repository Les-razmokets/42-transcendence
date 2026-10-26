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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions() {
    return buildCookieOptions(
      getJwtLifetimeSeconds(this.config),
      this.config.get('NODE_ENV') === 'production',
    );
  }

  @Public()
  @SerializeOptions({ schema: myProfileUserSchema })
  @Post('register')
  register(@Body() dto: UsersCreationDto) {
    return this.auth.register(dto);
  }

  @Public()
  @SerializeOptions({ schema: myProfileUserSchema })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.login(dto);
    const token = await this.auth.issueToken({ sub: user.id, role: user.role });
    res.cookie(COOKIE_NAME, token, this.cookieOptions());
    return user;
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge, ...clearOptions } = this.cookieOptions(); // same name/path/sameSite/secure, no maxAge
    res.clearCookie(COOKIE_NAME, clearOptions);
  }
}
