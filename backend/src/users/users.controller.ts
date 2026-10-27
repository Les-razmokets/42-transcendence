import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  SerializeOptions,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { publicUserSchema, PublicUser } from './users-response.schemas';
import { Public } from '../auth/utils/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
