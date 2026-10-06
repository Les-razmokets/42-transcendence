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
	IsOptional
} from 'class-validator';

export class UserCreationDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	firstName: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	lastName: string;

	@IsString()
	@MinLength(1)
	@MaxLength(20)
	pseudo: string;

	@IsEmail()
	@MaxLength(254)
	email: string;

	@IsString()
	@IsStrongPassword()
	@MaxLength(128)
	password: string;

	@Type(() => Date)
	@IsDate()
	birthDate: Date;

	@IsOptional()
	@IsPhoneNumber('CH')
	phone: number;
}