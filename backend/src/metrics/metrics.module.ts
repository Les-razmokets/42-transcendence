//Creat the Metrucs class and export it to metrics.controller
import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [MetricsController],
})
export class MetricsModule {}