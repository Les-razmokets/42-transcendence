import {
  Body,
  Controller,
  ParseUUIDPipe,
  Post,
  Get,
  Param,
  SerializeOptions,
  Put,
  Delete,
  HttpCode,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { PutTableDto } from './dto/put-table.dto';
import { tableSchema, type Table } from '@transcendence/shared';
import { RequireCasinoRole } from '../casinos/utils/casinos-role.decorator';

@SerializeOptions({ schema: tableSchema })
@Controller('casinos/:casinoId/tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @RequireCasinoRole('OWNER')
  @Post()
  createTable(
    @Body() dto: CreateTableDto,
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
  ): Promise<Table> {
    return this.tablesService.create(casinoId, dto);
  }

  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
  ): Promise<Table> {
    return await this.tablesService.findById(casinoId, id);
  }

  @Get()
  async findAll(
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
  ): Promise<Table[]> {
    return await this.tablesService.findAll(casinoId);
  }

  @RequireCasinoRole('OWNER')
  @Delete(':id')
  @HttpCode(204)
  async deleteTable(
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.tablesService.deleteTable(casinoId, id);
  }

  @RequireCasinoRole('OWNER')
  @Put(':id')
  async updateTable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
    @Body() dto: PutTableDto,
  ): Promise<Table> {
    return await this.tablesService.updateTable(casinoId, id, dto);
  }
}
