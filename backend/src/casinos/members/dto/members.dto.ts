import { Transform } from "class-transformer";
import { trimToLower } from "../../../users/dto/users.dto";
import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { CasinoRole } from "@transcendence/shared";

export class MembersAddDto {
  @Transform(trimToLower)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'pseudo: letters, numbers, "_" and "-" only',
  })
  pseudo: string;

  role: CasinoRole;
}

export class MembersUpdateDto {
  role: CasinoRole;
}