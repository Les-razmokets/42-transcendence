import { Injectable } from "@nestjs/common";
import { UsersCreationDto } from './dto/users.dto'

@Injectable() 
export class UsersService {
	create(dto: UsersCreationDto): string {
		return '{ received: dto, status: \'ok\' }'
	}
}