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
import { isCasinoClosed, casinoDay } from './casino-day';
import {
  SeatStatus,
  ReservationStatus,
  TableStatus,
} from '@transcendence/shared';

const PAYMENT_DELAY_MS = 15 * 60 * 1000;
const NO_SHOW_DELAY_MS = 30 * 60 * 1000;
const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.PENDING_PAYMENT,
  ReservationStatus.CONFIRMED,
  ReservationStatus.SEATED,
];

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
    try {
      return await this.prismaService.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Seat" WHERE id = ${dto.seatId} FOR UPDATE`;
        await this.assertSeatAvailable(tx, dto.seatId, isToday);
        return tx.reservation.create({
          data: {
            userId: userId,
            seatId: dto.seatId,
            arrivalAt: dto.arrivalAt,
            status: ReservationStatus.PENDING_PAYMENT,
          },
        });
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

  async expireNoShows() {
    const { count } = await this.prismaService.reservation.updateMany({
      where: {
        status: ReservationStatus.CONFIRMED,
        arrivalAt: { lte: new Date(Date.now() - NO_SHOW_DELAY_MS) },
      },
      data: { status: ReservationStatus.NO_SHOW },
    });
    return count;
  }

  async closeCasinoDay(closedAt = new Date()) {
    const [reservationsResult, seatsResult] =
      await this.prismaService.$transaction([
        this.prismaService.reservation.updateMany({
          where: { status: ReservationStatus.SEATED },
          data: { status: ReservationStatus.COMPLETED, leftAt: closedAt },
        }),
        this.prismaService.seat.updateMany({
          where: { status: SeatStatus.OCCUPIED },
          data: { status: SeatStatus.FREE },
        }),
      ]);
    return { completed: reservationsResult.count, freed: seatsResult.count };
  }

  async findForFloor(casinoId: string, day?: string) {
    const target = day ?? casinoDay(new Date());
    const start = new Date(`${target}T00:00:00Z`);
    const end = new Date(start.getTime() + 30 * 60 * 60 * 1000);
    const reservations = await this.prismaService.reservation.findMany({
      where: {
        seat: { table: { casinoId } },
        status: { in: ACTIVE_RESERVATION_STATUSES },
        arrivalAt: { gte: start, lt: end },
      },
      include: {
        user: { select: { pseudo: true } },
        seat: {
          select: {
            seatNumber: true,
            table: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { arrivalAt: 'asc' },
    });
    const filtered = reservations.filter(
      (r) => casinoDay(r.arrivalAt) === target,
    );
    return filtered;
  }

  async updateLeavedForFloor(casinoId: string, id: string) {
    const reservation = await this.prismaService.reservation.findFirst({
      where: { seat: { table: { casinoId } }, id },
    });
    if (!reservation) throw new NotFoundException('No reservations found');
    if (reservation.status !== ReservationStatus.SEATED)
      throw new ConflictException(
        'The reservation is not currently active (expected status: SEATED)',
      );
    return await this.prismaService.$transaction(async (tx) => {
      const { count } = await tx.reservation.updateMany({
        where: { id, status: ReservationStatus.SEATED },
        data: { status: ReservationStatus.COMPLETED, leftAt: new Date() },
      });
      if (count === 0)
        throw new ConflictException(
          'The reservation has been changed in the meantime',
        );
      await tx.seat.update({
        where: { id: reservation.seatId },
        data: { status: SeatStatus.FREE },
      });
      return tx.reservation.findUniqueOrThrow({ where: { id } });
    });
  }

  async updateSeatedForFloor(casinoId: string, id: string) {
    const reservation = await this.prismaService.reservation.findFirst({
      where: { seat: { table: { casinoId } }, id },
      include: { seat: { include: { table: { select: { status: true } } } } },
    });
    if (!reservation) throw new NotFoundException('No reservations found');
    if (reservation.status !== ReservationStatus.CONFIRMED)
      throw new ConflictException(
        'The reservation is not currently confirmed (expected status: CONFIRMED)',
      );
    if (casinoDay(reservation.arrivalAt) !== casinoDay(new Date()))
      throw new ConflictException('The reservation is not confirmed for today');
    if (reservation.seat.table.status !== TableStatus.OPEN)
      throw new ConflictException('This table is not open');
    if (reservation.seat.status !== SeatStatus.FREE)
      throw new ConflictException('Seat already occupied');
    return await this.prismaService.$transaction(async (tx) => {
      const { count } = await tx.reservation.updateMany({
        where: { id, status: ReservationStatus.CONFIRMED },
        data: { status: ReservationStatus.SEATED, seatedAt: new Date() },
      });
      if (count === 0)
        throw new ConflictException(
          'The reservation has been changed in the meantime',
        );
      const { count: countSeat } = await tx.seat.updateMany({
        where: {
          id: reservation.seatId,
          status: SeatStatus.FREE,
          table: { status: TableStatus.OPEN },
        },
        data: { status: SeatStatus.OCCUPIED },
      });
      if (countSeat === 0)
        throw new ConflictException(
          'The seat status has been changed in the meantime',
        );
      return tx.reservation.findFirstOrThrow({ where: { id } });
    });
  }

  async updateNotShowedForFloor(casinoId: string, id: string) {
    const reservation = await this.prismaService.reservation.findFirst({
      where: { seat: { table: { casinoId } }, id },
    });
    if (!reservation) throw new NotFoundException('No reservations found');
    if (reservation.status !== ReservationStatus.CONFIRMED)
      throw new ConflictException(
        'The reservation is not currently confirmed (expected status: CONFIRMED)',
      );
    if (reservation.arrivalAt > new Date())
      throw new ConflictException('Arrival time not reached yet');
    return await this.prismaService.$transaction(async (tx) => {
      const { count } = await tx.reservation.updateMany({
        where: { id, status: ReservationStatus.CONFIRMED },
        data: { status: ReservationStatus.NO_SHOW },
      });
      if (count === 0)
        throw new ConflictException(
          'The reservation has been changed in the meantime',
        );
      return tx.reservation.findFirstOrThrow({ where: { id } });
    });
  }

  private async assertSeatAvailable(
    client: Prisma.TransactionClient,
    seatId: string,
    isToday: boolean,
  ) {
    const seat = await client.seat.findFirst({
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
