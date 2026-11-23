import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateTableDto } from './dto/create-table.dto';
import { TableStateDto } from './dto/table-state.dto';
import { PutTableDto } from './dto/put-table.dto';
import { SeatStatusDto } from './dto/seat-status.dto';
import {
  PokerVariant,
  SeatStatus,
  ReservationStatus,
} from '../generated/prisma/enums';
import { casinoDay } from '../reservations/casino-day';

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

    return this.prismaService.$transaction(async (tx) => {
      if (dto.maxSeats < table.maxSeats) {
        const removed = {
          tableId: id,
          deletedAt: null,
          seatNumber: { gt: dto.maxSeats },
        };
        const occupied = await tx.seat.count({
          where: { ...removed, status: SeatStatus.OCCUPIED },
        });
        if (occupied > 0) {
          throw new ConflictException('A removed seat is occupied');
        }
        const reservations = await tx.reservation.findMany({
          where: {
            seat: { tableId: id, seatNumber: { gt: dto.maxSeats } },
            status: {
              in: [
                ReservationStatus.PENDING_PAYMENT,
                ReservationStatus.CONFIRMED,
                ReservationStatus.SEATED,
              ],
            },
          },
        });
        const today = casinoDay(new Date());
        const upcoming = reservations.filter(
          (r) => casinoDay(r.arrivalAt) >= today,
        );
        if (upcoming.length > 0)
          throw new ConflictException(
            'A removed seat has an upcoming reservation',
          );
        await tx.seat.updateMany({
          where: removed,
          data: { deletedAt: new Date() },
        });
      } else if (dto.maxSeats > table.maxSeats) {
        await tx.seat.updateMany({
          where: {
            tableId: id,
            seatNumber: { gt: table.maxSeats, lte: dto.maxSeats },
          },
          data: { deletedAt: null, status: SeatStatus.FREE },
        });
        await tx.seat.createMany({
          data: Array.from(
            { length: dto.maxSeats - table.maxSeats },
            (_, i) => ({
              tableId: id,
              seatNumber: table.maxSeats + 1 + i,
            }),
          ),
          skipDuplicates: true,
        });
      }
      return tx.pokerTable.update({
        where: { id },
        data: dto,
        include: tableWithSeats,
      });
    });
  }

  async deleteTable(casinoId: string, id: string) {
    await this.findById(casinoId, id);
    const reservations = await this.prismaService.reservation.findMany({
      where: {
        seat: { tableId: id },
        status: {
          in: [
            ReservationStatus.PENDING_PAYMENT,
            ReservationStatus.CONFIRMED,
            ReservationStatus.SEATED,
          ],
        },
      },
    });
    const today = casinoDay(new Date());
    const upcoming = reservations.filter(
      (r) => casinoDay(r.arrivalAt) >= today,
    );
    if (upcoming.length > 0)
      throw new ConflictException(
        'You can not delete tables with active reservations',
      );
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

  async updateSeat(
    casinoId: string,
    tableId: string,
    seatNumber: number,
    dto: SeatStatusDto,
  ) {
    await this.findById(casinoId, tableId);
    return this.prismaService.$transaction(async (tx) => {
      const seat = await tx.seat.findUnique({
        where: { tableId_seatNumber: { tableId, seatNumber } },
      });
      if (!seat || seat.deletedAt !== null)
        throw new NotFoundException(`Seat ${seatNumber} not found`);
      await tx.seat.update({
        where: { id: seat.id },
        data: { status: dto.status },
      });
      return tx.pokerTable.findUniqueOrThrow({
        where: { id: tableId },
        include: tableWithSeats,
      });
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
