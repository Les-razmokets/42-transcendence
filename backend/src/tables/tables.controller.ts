import { Body, Controller, Post } from '@nestjs/common';
import { TablesService } from './tables.service';
import { PokerTable } from '../generated/prisma/client';
import { CreateTableDto } from './dto/create-table.dto';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  createTable(@Body() dto: CreateTableDto): Promise<PokerTable> {
    return this.tablesService.create(dto);
  }
}
