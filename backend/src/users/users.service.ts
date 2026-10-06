import { Injectable } from "@nestjs/common";
import { UsersCreationDto } from './dto/users.dto';
import { UserInfo, StoredUser, Role } from './users.struct';

@Injectable() 
export class UsersService {
	createDto(dto: UsersCreationDto): string {
		return '{ received: dto, status: \'ok\' }'
	}
}