import { Body, Controller, Post, SerializeOptions } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import {
  reservationSchema,
  Reservation,
} from './reservations-response.schemas';

@SerializeOptions({ schema: reservationSchema })
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly ReservationsService: ReservationsService) {}

  @Post()
  createReservation(@Body() dto: CreateReservationDto): Promise<Reservation> {
    return this.ReservationsService.create(dto);
  }
}
