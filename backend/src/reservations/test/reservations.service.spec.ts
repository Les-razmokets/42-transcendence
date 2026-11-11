import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import {
  ReservationStatus,
  SeatStatus,
  TableStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReservationDto } from '../dto/create-reservation.dto';
import { ReservationsService } from '../reservations.service';

// Test unitaire : PrismaService est remplacé par un mock, aucune base n'est touchée.
// Il vérifie la traduction des erreurs Prisma, pas les index partiels eux-mêmes :
// ça, c'est le rôle du test d'intégration.
describe('ReservationsService', () => {
  let service: ReservationsService;
  const prismaMock = {
    seat: { findFirst: jest.fn() },
    reservation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const USER_ID = 'b0000000-0000-4000-8000-000000000001';

  const makeDto = (
    overrides: Partial<CreateReservationDto> = {},
  ): CreateReservationDto => ({
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

      await expect(service.create(USER_ID, dto)).resolves.toBe(fakeReservation);
      expect(prismaMock.reservation.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          seatId: dto.seatId,
          arrivalAt: dto.arrivalAt,
          status: ReservationStatus.PENDING_PAYMENT,
        },
      });
    });

    it('lève BadRequestException sans toucher à la base si l’arrivée tombe pendant la fermeture (5h-8h Paris)', async () => {
      // 05:30 UTC = 06:30 à Paris en hiver
      const dto = makeDto({ arrivalAt: new Date('2030-01-01T05:30:00Z') });

      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.seat.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('cherche une place non supprimée sur une table et un casino non supprimés', async () => {
      prismaMock.reservation.create.mockResolvedValue({ id: 'reservation-1' });
      const dto = makeDto();

      await service.create(USER_ID, dto);

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

      await expect(service.create(USER_ID, makeDto())).rejects.toBeInstanceOf(
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

      await expect(service.create(USER_ID, makeDto())).rejects.toBeInstanceOf(
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

      await expect(service.create(USER_ID, makeDto())).rejects.toBeInstanceOf(
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

      await expect(service.create(USER_ID, dto)).resolves.toEqual({
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

      await expect(service.create(USER_ID, dto)).resolves.toEqual({
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

      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
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

      await expect(service.create(USER_ID, makeDto())).resolves.toEqual({
        id: 'reservation-1',
      });
    });

    it('convertit P2002 sur Reservation_active_seat_key en ConflictException « place »', async () => {
      prismaMock.reservation.create.mockRejectedValue(
        makePrismaError('P2002', 'Reservation_active_seat_key'),
      );

      await expect(service.create(USER_ID, makeDto())).rejects.toThrow(
        new ConflictException('This seat already has an active reservation'),
      );
    });

    it('convertit P2002 sur Reservation_active_user_key en ConflictException « joueur »', async () => {
      prismaMock.reservation.create.mockRejectedValue(
        makePrismaError('P2002', 'Reservation_active_user_key'),
      );

      await expect(service.create(USER_ID, makeDto())).rejects.toThrow(
        new ConflictException('This user already has an active reservation'),
      );
    });

    it('convertit un P2002 sur un autre index en ConflictException générique', async () => {
      prismaMock.reservation.create.mockRejectedValue(
        makePrismaError('P2002', 'Reservation_other_key'),
      );

      await expect(service.create(USER_ID, makeDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('convertit un P2002 sans meta (forme inattendue) en ConflictException générique', async () => {
      prismaMock.reservation.create.mockRejectedValue(makePrismaError('P2002'));

      await expect(service.create(USER_ID, makeDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('convertit P2003 (user ou place supprimé entre-temps) en BadRequestException', async () => {
      prismaMock.reservation.create.mockRejectedValue(makePrismaError('P2003'));

      await expect(service.create(USER_ID, makeDto())).rejects.toThrow(
        new BadRequestException(
          'The selected seat or your account is no longer available',
        ),
      );
    });

    it('laisse passer telles quelles les autres erreurs Prisma', async () => {
      const error = makePrismaError('P2025');
      prismaMock.reservation.create.mockRejectedValue(error);

      await expect(service.create(USER_ID, makeDto())).rejects.toBe(error);
    });

    it('laisse passer telles quelles les erreurs qui ne viennent pas de Prisma', async () => {
      const error = new Error('connexion perdue');
      prismaMock.reservation.create.mockRejectedValue(error);

      await expect(service.create(USER_ID, makeDto())).rejects.toBe(error);
    });
  });

  describe('findAllForUser', () => {
    it('ne demande à la base que les réservations du joueur, les plus lointaines en premier', async () => {
      prismaMock.reservation.findMany.mockResolvedValue([]);

      await service.findAllForUser(USER_ID);

      expect(prismaMock.reservation.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { arrivalAt: 'desc' },
      });
    });

    it('renvoie les réservations telles que la base les donne', async () => {
      const fakeReservations = [
        { id: 'reservation-2' },
        { id: 'reservation-1' },
      ];
      prismaMock.reservation.findMany.mockResolvedValue(fakeReservations);

      await expect(service.findAllForUser(USER_ID)).resolves.toBe(
        fakeReservations,
      );
    });

    it('renvoie un tableau vide si le joueur n’a aucune réservation', async () => {
      prismaMock.reservation.findMany.mockResolvedValue([]);

      await expect(service.findAllForUser(USER_ID)).resolves.toEqual([]);
    });
  });

  // Règles : seule une réservation CONFIRMED est annulable, et seulement
  // avant l'heure d'arrivée. Horloge figée à 2030-01-01T12:00:00Z (beforeEach).
  describe('cancel', () => {
    const RESERVATION_ID = 'c0000000-0000-4000-8000-000000000001';

    const makeReservation = (
      overrides: Partial<{
        status: ReservationStatus;
        arrivalAt: Date;
      }> = {},
    ) => ({
      id: RESERVATION_ID,
      userId: USER_ID,
      status: ReservationStatus.CONFIRMED,
      arrivalAt: new Date('2030-01-01T20:00:00Z'),
      ...overrides,
    });

    it('cherche la réservation par id ET par joueur', async () => {
      prismaMock.reservation.findFirst.mockResolvedValue(makeReservation());
      prismaMock.reservation.update.mockResolvedValue({});

      await service.cancel(USER_ID, RESERVATION_ID);

      expect(prismaMock.reservation.findFirst).toHaveBeenCalledWith({
        where: { id: RESERVATION_ID, userId: USER_ID },
      });
    });

    it('passe la réservation en CANCELLED avec cancelledAt = maintenant, et la renvoie', async () => {
      const cancelled = {
        ...makeReservation(),
        status: ReservationStatus.CANCELLED,
      };
      prismaMock.reservation.findFirst.mockResolvedValue(makeReservation());
      prismaMock.reservation.update.mockResolvedValue(cancelled);

      await expect(service.cancel(USER_ID, RESERVATION_ID)).resolves.toBe(
        cancelled,
      );
      // statut et heure d'arrivée sont répétés dans le where : si la réservation
      // a changé (ex. SEATED) ou si l'heure d'arrivée est passée entre la lecture
      // et l'écriture, l'update ne trouve rien (P2025 -> 409)
      expect(prismaMock.reservation.update).toHaveBeenCalledWith({
        where: {
          id: RESERVATION_ID,
          status: ReservationStatus.CONFIRMED,
          arrivalAt: { gt: new Date('2030-01-01T12:00:00Z') },
        },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date('2030-01-01T12:00:00Z'),
        },
      });
    });

    it('lève NotFoundException sans rien modifier si la réservation est introuvable ou appartient à un autre joueur', async () => {
      prismaMock.reservation.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel(USER_ID, RESERVATION_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
    });

    it.each([
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.SEATED,
      ReservationStatus.COMPLETED,
      ReservationStatus.CANCELLED,
      ReservationStatus.NO_SHOW,
      ReservationStatus.EXPIRED,
    ])(
      'lève ConflictException sans rien modifier pour une réservation %s',
      async (status) => {
        prismaMock.reservation.findFirst.mockResolvedValue(
          makeReservation({ status }),
        );

        await expect(
          service.cancel(USER_ID, RESERVATION_ID),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prismaMock.reservation.update).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['pile à l’heure d’arrivée', '2030-01-01T12:00:00Z'],
      ['après l’heure d’arrivée', '2030-01-01T11:00:00Z'],
    ])(
      'lève ConflictException sans rien modifier %s',
      async (_label, arrivalAt) => {
        prismaMock.reservation.findFirst.mockResolvedValue(
          makeReservation({ arrivalAt: new Date(arrivalAt) }),
        );

        await expect(
          service.cancel(USER_ID, RESERVATION_ID),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prismaMock.reservation.update).not.toHaveBeenCalled();
      },
    );

    it('convertit P2025 (statut changé ou heure d’arrivée passée entre la lecture et l’écriture) en ConflictException', async () => {
      prismaMock.reservation.findFirst.mockResolvedValue(makeReservation());
      prismaMock.reservation.update.mockRejectedValue(makePrismaError('P2025'));

      await expect(
        service.cancel(USER_ID, RESERVATION_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('laisse passer telles quelles les autres erreurs', async () => {
      const error = new Error('connexion perdue');
      prismaMock.reservation.findFirst.mockResolvedValue(makeReservation());
      prismaMock.reservation.update.mockRejectedValue(error);

      await expect(service.cancel(USER_ID, RESERVATION_ID)).rejects.toBe(error);
    });
  });

  // Une réservation PENDING_PAYMENT non payée 15 min après sa création expire
  // (docs/db-schema.md). Horloge figée à 2030-01-01T12:00:00Z (beforeEach).
  describe('expirePendingPayments', () => {
    it('expire en une requête les PENDING_PAYMENT créées il y a 15 min ou plus', async () => {
      prismaMock.reservation.updateMany.mockResolvedValue({ count: 0 });

      await service.expirePendingPayments();

      // le statut dans le where protège un paiement confirmé au même moment
      expect(prismaMock.reservation.updateMany).toHaveBeenCalledWith({
        where: {
          status: ReservationStatus.PENDING_PAYMENT,
          createdAt: { lte: new Date('2030-01-01T11:45:00Z') },
        },
        data: { status: ReservationStatus.EXPIRED },
      });
    });

    it('renvoie le nombre de réservations expirées', async () => {
      prismaMock.reservation.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.expirePendingPayments()).resolves.toBe(3);
    });

    it('ne touche à aucune autre table que les réservations', async () => {
      prismaMock.reservation.updateMany.mockResolvedValue({ count: 1 });

      await service.expirePendingPayments();

      // le statut de la place (FREE/OCCUPIED) décrit la salle, pas les
      // réservations : expirer ne doit pas le modifier
      expect(prismaMock.seat.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
    });
  });
});
