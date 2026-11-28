import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { CasinosModule } from '../casinos/casinos.module';

@Module({
  controllers: [TablesController],
  providers: [TablesService],
  imports: [CasinosModule],
})
export class TablesModule {}
