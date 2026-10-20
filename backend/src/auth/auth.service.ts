import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UsersCreationDto } from '../users/dto/users.dto';
import { Argon2Hasher } from './argon2-hasher.service';

@Injectable()
export class AuthService {
	constructor(
		private readonly users: UsersService,
		private readonly hasher: Argon2Hasher,
	) {}

	async register(dto: UsersCreationDto) {
		const passwordHash = await this.hasher.hash(dto.password);
		return this.users.create({
			firstName: dto.firstName,
			lastName: dto.lastName,
			pseudo: dto.pseudo,
			email: dto.email,
			birthDate: dto.birthDate,
			phone: dto.phone,
			passwordHash,
		});
	}
}