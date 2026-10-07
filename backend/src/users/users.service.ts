import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../generated/prisma/client';

@Injectable() 
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}
	async findByEmail(email: string): Promise<User | null> {
		const normalizedEmail = email.trim().toLowerCase();
		const user = await this.prisma.user.findUnique({
			where: { email: normalizedEmail }
		});
		return user;
	}
	async findById(id: string): Promise<User> {
		const user = await  this.prisma.user.findUnique({
			where: { id }
		})
		if (!user)
			throw new NotFoundException(`User with ID ${id} not found`);
		return user;
	}
}