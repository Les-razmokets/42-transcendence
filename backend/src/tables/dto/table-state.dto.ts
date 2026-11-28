import { IsEnum, IsInt, Min, ValidateIf } from 'class-validator';
import { TableStatus } from '../../generated/prisma/enums';

export class TableStateDto {
  @ValidateIf((o) => o.moneyOnTable === undefined || o.status !== undefined)
  @IsEnum(TableStatus)
  status?: TableStatus;

  @ValidateIf((o) => o.status === undefined || o.moneyOnTable !== undefined)
  @IsInt()
  @Min(0)
  moneyOnTable?: number;
}
