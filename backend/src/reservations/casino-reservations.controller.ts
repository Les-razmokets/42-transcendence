import {
  Get,
  Post,
  HttpCode,
  SerializeOptions,
  Param,
  Query,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FloorDayQueryDto } from '../tables/dto/floor-day-query.dto';
import { RequireCasinoRole } from '../casinos/utils/casinos-role.decorator';
import { ReservationsService } from './reservations.service';
import {
  floorReservationSchema,
  FloorReservationInput,
  reservationSchema,
  ReservationInput,
} from '@transcendence/shared';

@SerializeOptions({ schema: floorReservationSchema })
@Controller('casinos/:casinoId/reservations')
export class CasinoReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @RequireCasinoRole('FLOOR')
  @Get()
  findForFloor(
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
    @Query() query: FloorDayQueryDto,
  ): Promise<FloorReservationInput[]> {
    return this.reservationsService.findForFloor(casinoId, query.day);
  }

  @SerializeOptions({ schema: reservationSchema })
  @RequireCasinoRole('FLOOR')
  @Post(':id/seat')
  @HttpCode(200)
  markAsSeated(
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReservationInput> {
    return this.reservationsService.updateSeatedForFloor(casinoId, id);
  }

  @SerializeOptions({ schema: reservationSchema })
  @RequireCasinoRole('FLOOR')
  @Post(':id/leave')
  @HttpCode(200)
  markAsLeft(
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReservationInput> {
    return this.reservationsService.updateLeavedForFloor(casinoId, id);
  }

  @SerializeOptions({ schema: reservationSchema })
  @RequireCasinoRole('FLOOR')
  @Post(':id/no-show')
  @HttpCode(200)
  markAsNotShowed(
    @Param('casinoId', new ParseUUIDPipe()) casinoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReservationInput> {
    return this.reservationsService.updateNotShowedForFloor(casinoId, id);
  }
}
