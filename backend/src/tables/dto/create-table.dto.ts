import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PokerVariant } from '../../generated/prisma/enums';

export class CreateTableDto {
  @IsUUID()
  casinoId: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEnum(PokerVariant)
  variant: PokerVariant;

  @IsInt()
  @Min(1)
  smallBlind: number;

  @IsInt()
  @Min(1)
  bigBlind: number;

  @IsInt()
  @Min(2)
  @Max(9)
  maxSeats: number;
}
