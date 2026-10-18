import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PokerVariant, TableStatus } from '../../generated/prisma/enums';

export class UpdateTableDto {
  @IsOptional()
  @IsEnum(PokerVariant)
  variant?: PokerVariant;

  @IsOptional()
  @IsInt()
  @Min(1)
  smallBlind?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  bigBlind?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  moneyOnTable?: number;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;
}
