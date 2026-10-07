import { IsString } from 'class-validator';

export class HealthDto {
  @IsString()
  name: string;
}
