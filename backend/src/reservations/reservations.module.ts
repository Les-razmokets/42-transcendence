import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './utils/reservations.scheduler';
import { CasinoReservationsController } from './casino-reservations.controller';
import { CasinosModule } from '../casinos/casinos.module';

@Module({
  imports: [CasinosModule],
  controllers: [ReservationsController, CasinoReservationsController],
  providers: [ReservationsService, ReservationsScheduler],
})
export class ReservationsModule {}
