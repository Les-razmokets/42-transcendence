import { Injectable } from "@nestjs/common";
import { UsersCreationDto } from './dto/users.dto';
import { UserInfo, StoredUser, Role } from './users.struct';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { User } from '../generated/prisma/client';

@Injectable() 
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}
	createDto(dto: UsersCreationDto): string {
		return '{ received: dto, status: \'ok\' }'
	}
}