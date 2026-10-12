import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(dto: CreateTableDto) {
    return await this.prismaService.pokerTable.create({
      data: { 
        ...dto,
        seats: { createMany: { data : Array.from({ length: dto.maxSeats }, (i: number) => ({seatNumber: i + 1}))
      }, include: {seats: true} }
	  }
	})
  }
}