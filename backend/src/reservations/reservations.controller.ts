import { Body, Controller, Post, SerializeOptions } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import {
  reservationSchema,
  Reservation,
} from './reservations-response.schemas';
import { CurrentUser } from '../auth/utils/current-user.decorator';
import type { AuthenticatedUser } from '../auth/utils/auth-request';

@SerializeOptions({ schema: reservationSchema })
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  createReservation(@CurrentUser() user:AuthenticatedUser, @Body() dto: CreateReservationDto): Promise<Reservation> {
    return this.reservationsService.create(user.id, dto);
  }
}
