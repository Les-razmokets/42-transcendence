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
import { Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(dto);
    const token = await this.auth.issueToken({ sub: user.id, role: user.role });
    return user;
  }
}
