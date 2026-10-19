import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { ReservationStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

// Test unitaire : PrismaService est remplacé par un mock, aucune base n'est touchée.
// Il vérifie la traduction des erreurs Prisma, pas les index partiels eux-mêmes :
// ça, c'est le rôle du test d'intégration.
describe('ReservationsService', () => {
  let service: ReservationsService;
  const prismaMock = {
    seat: { findFirst: jest.fn() },
    reservation: { create: jest.fn() },
  };

  const makeDto = (
    overrides: Partial<CreateReservationDto> = {},
  ): CreateReservationDto => ({
    userId: 'b0000000-0000-4000-8000-000000000001',
    seatId: 'd1288a92-100e-4abe-8271-f8c19abe4998',
    arrivalAt: new Date('2030-01-01T20:00:00Z'),
    ...overrides,
  });

  // Reproduit la forme de meta renvoyée par Prisma 7 + adapter-pg
  const makePrismaError = (code: string, index?: string) =>
    new Prisma.PrismaClientKnownRequestError('prisma error', {
      code,
      clientVersion: 'test',
      meta: index
        ? { driverAdapterError: { cause: { constraint: { index } } } }
        : undefined,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.seat.findFirst.mockResolvedValue({ id: 'seat-1' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  describe('create', () => {
    it('crée la réservation en PENDING_PAYMENT avec les champs du DTO', async () => {
      const fakeReservation = { id: 'reservation-1' };
      prismaMock.reservation.create.mockResolvedValue(fakeReservation);
      const dto = makeDto();

      await expect(service.create(dto)).resolves.toBe(fakeReservation);
      expect(prismaMock.reservation.create).toHaveBeenCalledWith({
        data: {
          userId: dto.userId,
          seatId: dto.seatId,
          arrivalAt: dto.arrivalAt,
          status: ReservationStatus.PENDING_PAYMENT,
        },
      });
    });

    it('cherche une place non supprimée sur une table non supprimée', async () => {
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });
      const dto = makeDto();

      await service.create(dto);

      expect(prismaMock.seat.findFirst).toHaveBeenCalledWith({
        where: { id: dto.seatId, deletedAt: null, table: { deletedAt: null } },
      });
    });

    it('lève NotFoundException sans créer de réservation si la place est introuvable', async () => {
      prismaMock.seat.findFirst.mockResolvedValue(null);

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('convertit P2002 sur Reservation_active_seat_key en ConflictException « place »', async () => {
      prismaMock.reservation.create.mockRejectedValue(
        makePrismaError('P2002', 'Reservation_active_seat_key'),
      );

      await expect(service.create(makeDto())).rejects.toThrow(
        new ConflictException('This seat already has an active reservation'),
      );
    });

    it('convertit P2002 sur Reservation_active_user_key en ConflictException « joueur »', async () => {
      prismaMock.reservation.create.mockRejectedValue(
        makePrismaError('P2002', 'Reservation_active_user_key'),
      );

      await expect(service.create(makeDto())).rejects.toThrow(
        new ConflictException('This user already has an active reservation'),
      );
    });

    it('laisse passer un P2002 sur un autre index', async () => {
      const error = makePrismaError('P2002', 'Reservation_other_key');
      prismaMock.reservation.create.mockRejectedValue(error);

      await expect(service.create(makeDto())).rejects.toBe(error);
    });

    it('laisse passer un P2002 sans meta (forme inattendue)', async () => {
      const error = makePrismaError('P2002');
      prismaMock.reservation.create.mockRejectedValue(error);

      await expect(service.create(makeDto())).rejects.toBe(error);
    });

    it('convertit P2003 (userId inconnu) en BadRequestException', async () => {
      prismaMock.reservation.create.mockRejectedValue(makePrismaError('P2003'));

      await expect(service.create(makeDto())).rejects.toThrow(
        new BadRequestException('userId does not match any user'),
      );
    });

    it('laisse passer telles quelles les autres erreurs Prisma', async () => {
      const error = makePrismaError('P2025');
      prismaMock.reservation.create.mockRejectedValue(error);

      await expect(service.create(makeDto())).rejects.toBe(error);
    });

    it('laisse passer telles quelles les erreurs qui ne viennent pas de Prisma', async () => {
      const error = new Error('connexion perdue');
      prismaMock.reservation.create.mockRejectedValue(error);

      await expect(service.create(makeDto())).rejects.toBe(error);
    });
  });
});
