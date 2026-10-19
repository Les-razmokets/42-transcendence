import { Type } from 'class-transformer';
import { IsUUID, IsDate, MinDate } from 'class-validator';

export class CreateReservationDto {
  //TODO (auth): replace with the user id taken from the JWT once auth is merged
  @IsUUID()
  userId: string;

  @IsUUID()
  seatId: string;

  @IsDate()
  @MinDate(() => new Date(), { message: 'The date must be in the future.' })
  @Type(() => Date)
  arrivalAt: Date;
}
