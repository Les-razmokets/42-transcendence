import {
  Body,
  Controller,
  ParseUUIDPipe,
  Post,
  Get,
  Param,
  SerializeOptions,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import {
  tableSchema,
  Table,
} from './tables-response.schemas';

@SerializeOptions({ schema: tableSchema })
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  createTable(@Body() dto: CreateTableDto): Promise<Table> {
    return this.tablesService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Table> {
    return await this.tablesService.findById(id);
  }

  @Get()
  async findAll(): Promise<Table[]> {
    return await this.tablesService.findAll();
  }
}
