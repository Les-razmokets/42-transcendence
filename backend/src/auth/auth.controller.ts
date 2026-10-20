import { Controller, Get, Post, Body, SerializeOptions } from '@nestjs/common';
import { AuthService } from './auth.service';
import { myProfileUserSchema } from '../users/users-response.schemas';
import { UsersCreationDto } from '../users/dto/users.dto';
import { Public } from './public.decorator';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @SerializeOptions({ schema: myProfileUserSchema })
  @Post('register')
  register(@Body() dto: UsersCreationDto) {
    return this.auth.register(dto);
  }
}