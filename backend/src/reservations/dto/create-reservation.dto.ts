import { Type } from 'class-transformer';
import { IsUUID, IsDate, MinDate, MaxDate } from 'class-validator';

const MAX_DAYS_AHEAD = 7;

export class CreateReservationDto {

  @IsUUID()
  seatId: string;

  @IsDate()
  @MinDate(() => new Date(), { message: 'The date must be in the future.' })
  @MaxDate(() => new Date(Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000), {
    message: `The date must be within ${MAX_DAYS_AHEAD} days.`,
  })
  @Type(() => Date)
  arrivalAt: Date;
}
