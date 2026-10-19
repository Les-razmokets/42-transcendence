import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
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
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const indexName = this.getConstraintIndex(error);
          if (indexName === 'Reservation_active_seat_key')
            throw new ConflictException(
              'This seat already has an active reservation',
            );
          if (indexName === 'Reservation_active_user_key')
            throw new ConflictException(
              'This user already has an active reservation',
            );
          throw error;
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('userId does not match any user');
        }
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

  private getConstraintIndex(
    error: Prisma.PrismaClientKnownRequestError,
  ): string | undefined {
    const meta = error.meta as {
      driverAdapterError?: {
        cause?: {
          constraint?: {
            index?: string;
          };
        };
      };
    };

    return meta?.driverAdapterError?.cause?.constraint?.index;
  }
}
