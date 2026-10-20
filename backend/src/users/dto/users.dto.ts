import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsEmail,
  IsStrongPassword,
  IsDate,
  IsPhoneNumber,
  MinLength,
  MaxLength,
  MaxDate,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsISO8601,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimToLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const eighteenYearsAgo = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date;
};
const toDate = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? date : value;
};

export class UsersCreationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName: string;

  @Transform(trimToLower)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'pseudo: letters, numbers, "_" and "-" only',
  })
  pseudo: string;

  @Transform(trimToLower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsStrongPassword()
  @MaxLength(128)
  password: string;

  @Transform(toDate)
  @IsDate()
  @MaxDate(eighteenYearsAgo, {
    message: 'You must be eighteen to register.',
  })
  birthDate: Date;

  @IsOptional()
  @IsString()
  @IsPhoneNumber('CH')
  phone?: string;
}
