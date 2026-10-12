import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  SerializeOptions,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { publicUserSchema, PublicUser } from './users-response.schemas';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // basic response when we try GET /api/users/:id
  @SerializeOptions({ schema: publicUserSchema })
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PublicUser> {
    return await this.usersService.findById(id);
  }
}
