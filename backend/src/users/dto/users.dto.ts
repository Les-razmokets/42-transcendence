import { Transform, Type } from 'class-transformer'
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
	maxDate
} from 'class-validator';

const trim = ({ value }: { value: unknown}) => typeof value === 'string' ? value.trim() : value;
const trimToLower = ({ value }: { value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value;
const eighteenYearsAgo = () => {
	const date = new Date();
	date.setFullYear(date.getFullYear() - 18);
	return date;
}

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
	@Matches(/^[a-z0-9_-]+/, {
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

	@Type(() => Date)
	@IsDate()
	@MaxDate(eighteenYearsAgo, {
		message: 'You must be eighteen to register.'
	})
	birthDate: Date;

	@IsOptional()
	@IsPhoneNumber('CH')
	phone?: number;
}