import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  ReservationStatus,
  TableStatus,
  SeatStatus,
} from '../generated/prisma/enums';
import { isCasinoClosed, casinoDay } from './casino-day';

@Injectable()
export class ReservationsService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(userId: string,dto: CreateReservationDto) {
    if (isCasinoClosed(dto.arrivalAt)) {
      throw new BadRequestException(
        'Casinos are closed between 5:00 and 8:00 (Paris time)',
      );
    }
    // Pendant la fermeture (5h-8h), les statuts table/place datent encore de la nuit :
    // ils ne disent rien de la journée qui commence
    const now = new Date();
    const isToday =
      !isCasinoClosed(now) && casinoDay(dto.arrivalAt) === casinoDay(now);
    const userActivePromise = this.assertUserActive(userId);
    const seatAvailablePromise = this.assertSeatAvailable(dto.seatId, isToday);
    await Promise.all([userActivePromise, seatAvailablePromise]);
    try {
      return await this.prismaService.reservation.create({
        data: {
          userId: userId,
          seatId: dto.seatId,
          arrivalAt: dto.arrivalAt,
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
          throw new ConflictException(
            'This reservation conflicts with an existing one',
          );
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('userId or seatId no longer exists');
        }
      }
      throw error;
    }
  }

  private async assertSeatAvailable(seatId: string, isToday: boolean) {
    const seat = await this.prismaService.seat.findFirst({
      where: {
        id: seatId,
        deletedAt: null,
        table: { deletedAt: null, casino: { deletedAt: null } },
      },
      select: { table: { select: { status: true } }, status: true },
    });
    if (!seat) {
      throw new BadRequestException(`Seat with ID ${seatId} not found`);
    }
    if (seat.table.status !== TableStatus.OPEN && isToday) {
      throw new ConflictException('This table is not open');
    }
    if (seat.status !== SeatStatus.FREE && isToday) {
      throw new ConflictException('This seat is already occupied');
    }
  }

  private async assertUserActive(userId: string) {
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('userId does not match any user');
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
