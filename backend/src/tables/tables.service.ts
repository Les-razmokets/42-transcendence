import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { PokerVariant } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

const tableWithSeats = {
  seats: { where: { deletedAt: null }, orderBy: { seatNumber: 'asc' } },
} satisfies Prisma.PokerTableInclude;

@Injectable()
export class TablesService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(dto: CreateTableDto) {
    this.assertValidBlinds(dto.smallBlind, dto.bigBlind);
    this.assertValidSeats(dto.variant, dto.maxSeats);

    try {
      return await this.prismaService.pokerTable.create({
        data: {
          ...dto,
          seats: {
            createMany: {
              data: Array.from({ length: dto.maxSeats }, (_, i) => ({
                seatNumber: i + 1,
              })),
            },
          },
        },
        include: tableWithSeats,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException('casinoId does not match any casino');
      }
      throw error;
    }
  }

  async findById(id: string) {
    const table = await this.prismaService.pokerTable.findUnique({
      where: { id, deletedAt: null },
      include: tableWithSeats,
    });
    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }
    return table;
  }

  async findAll() {
    const tables = await this.prismaService.pokerTable.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: tableWithSeats,
    });
    return tables;
  }

  async deleteTable(id: string) {
    const { count } = await this.prismaService.pokerTable.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }
  }

  private assertValidBlinds(smallBlind: number, bigBlind: number) {
    if (bigBlind < smallBlind) {
      throw new BadRequestException(
        'bigBlind must be greater than or equal to smallBlind',
      );
    }
  }

  private assertValidSeats(variant: PokerVariant, maxSeats: number) {
    if (variant === PokerVariant.OMAHA && maxSeats > 8) {
      throw new BadRequestException(
        'invalid number of seats for OMAHA poker variant (max = 8)',
      );
    }
  }
}
