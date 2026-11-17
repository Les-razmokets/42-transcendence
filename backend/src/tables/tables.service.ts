import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateTableDto } from './dto/create-table.dto';
import { TableStateDto } from './dto/table-state.dto';
import { PutTableDto } from './dto/put-table.dto';
import { PokerVariant } from '../generated/prisma/enums';

const tableWithSeats = {
  seats: { where: { deletedAt: null }, orderBy: { seatNumber: 'asc' } },
} satisfies Prisma.PokerTableInclude;

@Injectable()
export class TablesService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(casinoId: string, dto: CreateTableDto) {
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
          casinoId,
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

  async findById(casinoId: string, id: string) {
    const table = await this.prismaService.pokerTable.findUnique({
      where: { id, deletedAt: null, casinoId },
      include: tableWithSeats,
    });
    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }
    return table;
  }

  async findAll(casinoId: string) {
    const tables = await this.prismaService.pokerTable.findMany({
      where: { deletedAt: null, casinoId },
      orderBy: { name: 'asc' },
      include: tableWithSeats,
    });
    return tables;
  }

  async updateTable(casinoId: string, id: string, dto: PutTableDto) {
    const table = await this.findById(casinoId, id);
    this.assertValidBlinds(dto.smallBlind, dto.bigBlind);
    this.assertValidSeats(dto.variant, dto.maxSeats);

	// TODO étape 4 : ajout / retrait des places
    if (table.maxSeats !== dto.maxSeats)
      throw new BadRequestException('maxSeats cannot be changed yet');
    return await this.prismaService.pokerTable.update({
      where: { id },
      data: {
        ...dto,
      },
      include: tableWithSeats,
    });
  }

  async deleteTable(casinoId: string, id: string) {
    const { count } = await this.prismaService.pokerTable.updateMany({
      where: { id, deletedAt: null, casinoId },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }
  }

  async updateState(casinoId: string, id: string, dto: TableStateDto) {
    await this.findById(casinoId, id);
    return await this.prismaService.pokerTable.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.moneyOnTable !== undefined && { moneyUpdatedAt: new Date() }),
      },
      include: tableWithSeats,
    });
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
