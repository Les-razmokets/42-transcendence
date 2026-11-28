import { IsEnum } from 'class-validator';
import { SeatStatus } from '../../generated/prisma/enums';

export class SeatStatusDto {
  @IsEnum(SeatStatus)
  status: SeatStatus;
}
