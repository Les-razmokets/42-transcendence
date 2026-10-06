import { Controller, Get, Post, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersCreationDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Post()
	create(@Body() dto: UsersCreationDto) {
		return this.usersService.create(dto);
	}
}