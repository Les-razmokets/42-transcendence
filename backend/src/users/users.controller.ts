import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  SerializeOptions,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../auth/utils/public.decorator';
import { CurrentUser } from '../auth/utils/current-user.decorator';
import type { AuthenticatedUser } from '../auth/utils/auth-request';
import { publicUserSchema, myProfileWithMembershipsSchema, PublicUser } from '@transcendence/shared';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @SerializeOptions({ schema: myProfileWithMembershipsSchema })
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const currentUser = this.usersService.me(user.id);
    return currentUser;
  }

  // basic response when we try GET /api/users/:id
  @SerializeOptions({ schema: publicUserSchema })
  @Public()
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PublicUser> {
    const user = await this.usersService.findById(id);
    if (user.deletedAt) throw new NotFoundException();
    return user;
  }
}
