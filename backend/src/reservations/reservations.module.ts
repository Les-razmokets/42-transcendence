import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './utils/reservations.scheduler';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsScheduler],
})
export class ReservationsModule {}
