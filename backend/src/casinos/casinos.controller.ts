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
import { CasinosCreationDto, CasinosUpdateDto } from './dto/casinos.dto';
import { Roles } from '../auth/utils/roles.decorator';
import { Casino, CasinoRole, Role } from '../generated/prisma/client';
import { CasinosService } from './casinos.service';
import {
  adminCasinoSchema,
  publicCasinoSchema,
} from './utils/casinos-response.schemas';
import { CasinoInfo } from './utils/casinos.struct';
import { RequireCasinoRole } from './utils/casinos-role.decorator';
import { CasinosMembersService } from './members/casinos-members.service';
import { publicMemberSchema } from './members/utils/members-response.schema';

@Controller('casinos')
export class CasinosController {
  constructor(private readonly casinos: CasinosService) {}

  @Roles(Role.ADMIN)
  @SerializeOptions({ schema: adminCasinoSchema })
  @Post()
  async create(@Body() dto: CasinosCreationDto): Promise<Casino> {
    return await this.casinos.createCasino(dto);
  }

  @SerializeOptions({ schema: publicCasinoSchema })
  @Get()
  async getActiveCasinos(): Promise<CasinoInfo[]> {
    return await this.casinos.listActiveCasinos();
  }

  @SerializeOptions({ schema: publicCasinoSchema })
  @Get(':casinoId')
  async findOneActiveCasino(
    @Param('casinoId') casinoId: string,
  ): Promise<CasinoInfo> {
    return await this.casinos.findActiveCasino(casinoId);
  }

  @SerializeOptions({ schema: publicCasinoSchema })
  @RequireCasinoRole(CasinoRole.OWNER)
  @Patch(':casinoId')
  async updateCasino(
    @Param('casinoId') casinoId: string,
    @Body() dto: CasinosUpdateDto,
  ) {
    return await this.casinos.updateCasino(casinoId, dto);
  }
}
