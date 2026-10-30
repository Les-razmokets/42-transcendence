import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import {
  ReservationStatus,
  SeatStatus,
  TableStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

// Test unitaire : PrismaService est remplacé par un mock, aucune base n'est touchée.
// Il vérifie la traduction des erreurs Prisma, pas les index partiels eux-mêmes :
// ça, c'est le rôle du test d'intégration.
describe('ReservationsService', () => {
  let service: ReservationsService;
  const prismaMock = {
    user: { findFirst: jest.fn() },
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
    // Par défaut : user actif
    prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
    // Par défaut : place libre sur une table ouverte
    prismaMock.seat.findFirst.mockResolvedValue({
      id: 'seat-1',
      status: SeatStatus.FREE,
      table: { status: TableStatus.OPEN },
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
    // Horloge figée sur la journée casino du DTO par défaut (13h à Paris le 2030-01-01) :
    // les contrôles table OPEN / place FREE ne s'appliquent qu'aux arrivées du jour
    jest.useFakeTimers({ now: new Date('2030-01-01T12:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
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

    it('lève BadRequestException sans toucher à la base si l’arrivée tombe pendant la fermeture (5h-8h Paris)', async () => {
      // 05:30 UTC = 06:30 à Paris en hiver
      const dto = makeDto({ arrivalAt: new Date('2030-01-01T05:30:00Z') });

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.seat.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('cherche un user non supprimé', async () => {
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });
      const dto = makeDto();

      await service.create(dto);

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: dto.userId, deletedAt: null },
        select: { id: true },
      });
    });

    it('lève BadRequestException sans créer de réservation si le user est introuvable ou anonymisé', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.create(makeDto())).rejects.toThrow(
        new BadRequestException('userId does not match any user'),
      );
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('cherche une place non supprimée sur une table et un casino non supprimés', async () => {
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });
      const dto = makeDto();

      await service.create(dto);

      expect(prismaMock.seat.findFirst).toHaveBeenCalledWith({
        where: {
          id: dto.seatId,
          deletedAt: null,
          table: { deletedAt: null, casino: { deletedAt: null } },
        },
        select: { table: { select: { status: true } }, status: true },
      });
    });

    it('lève BadRequestException sans créer de réservation si la place est introuvable', async () => {
      prismaMock.seat.findFirst.mockResolvedValue(null);

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('lève ConflictException sans créer de réservation si la table est en pause', async () => {
      prismaMock.seat.findFirst.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.FREE,
        table: { status: TableStatus.PAUSED },
      });

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('lève ConflictException sans créer de réservation si la place est occupée', async () => {
      prismaMock.seat.findFirst.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.OCCUPIED,
        table: { status: TableStatus.OPEN },
      });

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('crée la réservation pour un autre jour même si la place est occupée aujourd’hui', async () => {
      prismaMock.seat.findFirst.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.OCCUPIED,
        table: { status: TableStatus.OPEN },
      });
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });
      const dto = makeDto({ arrivalAt: new Date('2030-01-04T20:00:00Z') });

      await expect(service.create(dto)).resolves.toEqual({
        id: 'reservation-1',
      });
      expect(prismaMock.reservation.create).toHaveBeenCalled();
    });

    it('crée la réservation pour un autre jour même si la table est en pause aujourd’hui', async () => {
      prismaMock.seat.findFirst.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.FREE,
        table: { status: TableStatus.PAUSED },
      });
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });
      const dto = makeDto({ arrivalAt: new Date('2030-01-04T20:00:00Z') });

      await expect(service.create(dto)).resolves.toEqual({
        id: 'reservation-1',
      });
      expect(prismaMock.reservation.create).toHaveBeenCalled();
    });

    it('applique les contrôles du jour à une arrivée après minuit de la même journée casino', async () => {
      // 23:30 UTC = 00:30 le 2 à Paris, 01:00 UTC = 02:00 le 2 : journée casino du 1er dans les deux cas
      jest.setSystemTime(new Date('2030-01-01T23:30:00Z'));
      prismaMock.seat.findFirst.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.OCCUPIED,
        table: { status: TableStatus.OPEN },
      });
      const dto = makeDto({ arrivalAt: new Date('2030-01-02T01:00:00Z') });

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('ignore les statuts restés de la nuit si la demande arrive pendant la fermeture', async () => {
      // 05:30 UTC = 06:30 à Paris : casino fermé, journée casino du 1er déjà commencée
      jest.setSystemTime(new Date('2030-01-01T05:30:00Z'));
      prismaMock.seat.findFirst.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.OCCUPIED,
        table: { status: TableStatus.PAUSED },
      });
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });

      await expect(service.create(makeDto())).resolves.toEqual({
        id: 'reservation-1',
      });
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

    it('convertit un P2002 sur un autre index en ConflictException générique', async () => {
      prismaMock.reservation.create.mockRejectedValue(
        makePrismaError('P2002', 'Reservation_other_key'),
      );

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('convertit un P2002 sans meta (forme inattendue) en ConflictException générique', async () => {
      prismaMock.reservation.create.mockRejectedValue(makePrismaError('P2002'));

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('convertit P2003 (user ou place supprimé entre-temps) en BadRequestException', async () => {
      prismaMock.reservation.create.mockRejectedValue(makePrismaError('P2003'));

      await expect(service.create(makeDto())).rejects.toThrow(
        new BadRequestException('userId or seatId no longer exists'),
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
