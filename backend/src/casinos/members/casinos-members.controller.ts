import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import { Roles } from '../../auth/utils/roles.decorator';
import { MemberInfo } from './utils/members.struct';
import { RequireCasinoRole } from '../utils/casinos-role.decorator';
import { CasinosMembersService } from './casinos-members.service';
import { publicMemberSchema } from '@transcendence/shared';
import { AddMemberDto, ChangeMemberRoleDto } from './dto/members.dto';
import { CurrentUser } from '../../auth/utils/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/utils/auth-request';
import { Role } from '@transcendence/shared';

@Controller('casinos/:casinoId/members')
export class CasinosMembersController {
  constructor(private readonly members: CasinosMembersService) {}

  @SerializeOptions({ schema: publicMemberSchema })
  @RequireCasinoRole('FLOOR')
  @Get()
  async listMembers(
    @Param('casinoId') casinoId: string,
  ): Promise<MemberInfo[]> {
    return await this.members.listMembers(casinoId);
  }

  @SerializeOptions({ schema: publicMemberSchema })
  @RequireCasinoRole('OWNER')
  @HttpCode(201)
  @Post()
  async addMember(
    @Param('casinoId') casinoId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MemberInfo> {
    return await this.members.addMember(user, casinoId, dto);
  }

  @SerializeOptions({ schema: publicMemberSchema })
  @Roles(Role.ADMIN)
  @Patch('/:pseudo')
  async updateMember(
    @Param('casinoId') casinoId: string,
    @Param('pseudo') pseudo: string,
    @Body() dto: ChangeMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MemberInfo> {
    return await this.members.changeRole(user, casinoId, pseudo, dto);
  }

  @RequireCasinoRole('OWNER')
  @HttpCode(204)
  @Delete('/:pseudo')
  async removeMember(
    @Param('casinoId') casinoId: string,
    @Param('pseudo') pseudo: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return await this.members.removeMember(user, casinoId, pseudo);
  }
}
