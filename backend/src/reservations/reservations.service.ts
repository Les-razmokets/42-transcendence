import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
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

const PAYMENT_DELAY_MS = 15 * 60 * 1000;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly prismaService: PrismaService) {}
  async create(userId: string, dto: CreateReservationDto) {
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
    await this.assertSeatAvailable(dto.seatId, isToday);
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
          this.logger.warn(
            `Reservation foreign key violation (userId=${userId}, seatId=${dto.seatId})`,
          );
          throw new BadRequestException(
            'The selected seat or your account is no longer available',
          );
        }
      }
      throw error;
    }
  }

  findAllForUser(userId: string) {
    return this.prismaService.reservation.findMany({
      where: { userId },
      orderBy: { arrivalAt: 'desc' },
    });
  }

  async cancel(userId: string, reservationId: string) {
    const reservation = await this.prismaService.reservation.findFirst({
      where: { id: reservationId, userId },
    });
    const now = new Date();
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status !== ReservationStatus.CONFIRMED)
      throw new ConflictException(
        'Only a confirmed reservation can be cancelled',
      );
    if (now >= reservation.arrivalAt)
      throw new ConflictException('The arrival time has passed');
    try {
      return await this.prismaService.reservation.update({
        // status and arrival time re-checked atomically: the row may have
        // changed, or arrival time passed, since the findFirst above
        where: {
          id: reservationId,
          status: ReservationStatus.CONFIRMED,
          arrivalAt: { gt: now },
        },
        data: { status: ReservationStatus.CANCELLED, cancelledAt: now },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new ConflictException(
          'The reservation changed and can no longer be cancelled',
        );
      throw error;
    }
  }

  async expirePendingPayments() {
    const { count } = await this.prismaService.reservation.updateMany({
      where: {
        status: ReservationStatus.PENDING_PAYMENT,
        createdAt: { lte: new Date(Date.now() - PAYMENT_DELAY_MS) },
      },
      data: { status: ReservationStatus.EXPIRED },
    });
    return count;
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
