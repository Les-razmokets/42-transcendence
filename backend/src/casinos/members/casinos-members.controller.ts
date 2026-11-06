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
import { publicMemberSchema } from './utils/members-response.schema';
import { MembersAddDto, MembersUpdateDto } from './dto/members.dto';
import { CurrentUser } from '../../auth/utils/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/utils/auth-request';
import { Role } from '@transcendence/shared';

@Controller('casinos/:casinoId/members')
export class CasinosMembersController {
  constructor (private readonly casinosMembers: CasinosMembersService) {}

  @SerializeOptions({ schema: publicMemberSchema })
  @RequireCasinoRole('FLOOR')
  @Get()
  async listMembers(@Param('casinoId') casinoId: string): Promise<MemberInfo[]> {
    return await this.casinosMembers.listMembers(casinoId);
  }

  @SerializeOptions({ schema: publicMemberSchema })
  @RequireCasinoRole('OWNER')
  @HttpCode(201)
  @Post()
  async addMember(
    @Param('casinoId') casinoId: string,
    @Body() dto: MembersAddDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MemberInfo> {
    return await this.casinosMembers.addMember(dto, casinoId, user);
  }

  @SerializeOptions({ schema: publicMemberSchema })
  @Roles(Role.ADMIN)
  @Patch('/:pseudo')
  async updateMember(
    @Param('casinoId') casinoId: string,
    @Param('pseudo') pseudo: string,
    @Body() dto: MembersUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MemberInfo> {
    return await this.casinosMembers.updateMemberRole(dto, casinoId, user, pseudo);
  }

  @RequireCasinoRole('OWNER')
  @HttpCode(204)
  @Delete('/:pseudo')
  async removeMember(
    @Param('casinoId') casinoId: string,
    @Param('pseudo') pseudo: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return await this.casinosMembers.removeMember(casinoId, user, pseudo);
  }
}