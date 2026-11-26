import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class FloorDayQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/)
  @IsISO8601({ strict: true })
  day?: string;
}
