import { IsOptional, Matches } from 'class-validator';

export class FloorDayQueryDto {
  @IsOptional()
  @Matches(/^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/)
  day?: string;
}
