import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ReservationStatus } from '../generated/prisma/enums';

@Injectable()
export class ReservationsService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(dto: CreateReservationDto) {
    await this.assertSeatAvailable(dto.seatId);
    try {
      return await this.prismaService.reservation.create({
        data: {
          ...dto,
          status: ReservationStatus.PENDING_PAYMENT,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        console.log(JSON.stringify(error.meta, null, 2));
      }
      throw error;
    }
  }

  private async assertSeatAvailable(seatId: string) {
    const seat = await this.prismaService.seat.findFirst({
      where: { id: seatId, deletedAt: null, table: { deletedAt: null } },
    });
    if (!seat) {
      throw new NotFoundException(`Seat with ID ${seatId} not found`);
    }
  }
}
