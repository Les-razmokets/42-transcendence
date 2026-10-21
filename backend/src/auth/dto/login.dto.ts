import { Transform } from 'class-transformer';
import { IsEmail, MaxLength, IsString } from 'class-validator';
import { trimToLower } from '../../users/dto/users.dto';

export class LoginDto {
  @Transform(trimToLower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
