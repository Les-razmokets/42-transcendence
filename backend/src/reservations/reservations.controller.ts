import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  SerializeOptions,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import {
  reservationSchema,
  type ReservationInput,
} from '@transcendence/shared';
import { CurrentUser } from '../auth/utils/current-user.decorator';
import type { AuthenticatedUser } from '../auth/utils/auth-request';
import { Roles } from '../auth/utils/roles.decorator';
import { Role } from '../generated/prisma/client';

@SerializeOptions({ schema: reservationSchema })
@Roles(Role.USER)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  createReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
  ): Promise<ReservationInput> {
    return this.reservationsService.create(user.id, dto);
  }

  @Get()
  getMyReservations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReservationInput[]> {
    return this.reservationsService.findAllForUser(user.id);
  }

  @Delete(':id')
  cancelMyReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReservationInput> {
    return this.reservationsService.cancel(user.id, id);
  }
}
