import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import {
  PokerVariant,
  ReservationStatus,
  SeatStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ReservationsService } from '../reservations.service';

// Test d'intégration : utilise la vraie base de dev (DATABASE_URL), jamais la prod.
// C'est ici qu'on prouve que les index partiels de la migration empêchent
// vraiment la double réservation.
describe('ReservationsService (intégration)', () => {
  let moduleRef: TestingModule;
  let service: ReservationsService;
  let prisma: PrismaService;
  let casinoId: string;
  // seatIds[n] = id du siège numéro n de la table de test
  const seatIds: Record<number, string> = {};
  let seatOnDeletedTableId: string;

  // Préfixe unique par exécution, pour ne nettoyer que nos propres données
  const prefix = `r-${Date.now().toString(36)}`;
  // Demain 18h UTC, soit J+1. Dans ce fichier, « J+n » compte depuis aujourd'hui :
  // addHours(arrivalAt, 24 * k) tombe donc sur J+(k+1).
  const arrivalAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  arrivalAt.setUTCHours(18, 0, 0, 0);
  const addHours = (date: Date, hours: number) =>
    new Date(date.getTime() + hours * 60 * 60 * 1000);

  // Un joueur par test : un joueur ne peut avoir qu'une réservation active
  const createUser = async (name: string) =>
    prisma.user.create({
      data: {
        email: `${prefix}-${name}@test.local`,
        pseudo: `${prefix}-${name}`,
        firstName: 'Test',
        lastName: name,
        birthDate: new Date('1990-01-01'),
      },
    });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    service = moduleRef.get(ReservationsService, { strict: false });
    prisma = moduleRef.get(PrismaService, { strict: false });

    const casino = await prisma.casino.create({
      data: { name: `${prefix}-casino`, city: 'Test', address: 'Test' },
    });
    casinoId = casino.id;

    const table = await prisma.pokerTable.create({
      data: {
        casinoId,
        name: `${prefix}-table`,
        variant: PokerVariant.TEXAS_HOLDEM,
        smallBlind: 1,
        bigBlind: 2,
        maxSeats: 10,
        seats: {
          createMany: {
            data: Array.from({ length: 10 }, (_, i) => ({
              seatNumber: i + 1,
            })),
          },
        },
      },
      include: { seats: true },
    });
    for (const seat of table.seats) {
      seatIds[seat.seatNumber] = seat.id;
    }

    // Table supprimée dont le siège, lui, n'est pas supprimé
    const deletedTable = await prisma.pokerTable.create({
      data: {
        casinoId,
        name: `${prefix}-deleted-table`,
        variant: PokerVariant.TEXAS_HOLDEM,
        smallBlind: 1,
        bigBlind: 2,
        maxSeats: 2,
        deletedAt: new Date(),
        seats: { create: { seatNumber: 1 } },
      },
      include: { seats: true },
    });
    seatOnDeletedTableId = deletedTable.seats[0].id;
  });

  afterAll(async () => {
    // onDelete: Restrict → réservations, puis sièges, tables, casino et users
    await prisma.reservation.deleteMany({
      where: { seat: { table: { casinoId } } },
    });
    await prisma.seat.deleteMany({ where: { table: { casinoId } } });
    await prisma.pokerTable.deleteMany({ where: { casinoId } });
    await prisma.casino.delete({ where: { id: casinoId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: `${prefix}-` } },
    });
    await moduleRef.close();
  });

  it('crée une réservation PENDING_PAYMENT sur une place libre', async () => {
    const user = await createUser('ok');

    const created = await service.create(user.id, {
      seatId: seatIds[1],
      arrivalAt,
    });

    expect(created.id).toBeDefined();
    expect(created.userId).toBe(user.id);
    expect(created.seatId).toBe(seatIds[1]);
    expect(created.status).toBe(ReservationStatus.PENDING_PAYMENT);
    expect(created.arrivalAt).toEqual(arrivalAt);
  });

  it('refuse une 2ᵉ réservation active sur la même place (409 place)', async () => {
    const first = await createUser('seat-a');
    const second = await createUser('seat-b');
    await service.create(first.id, { seatId: seatIds[2], arrivalAt });

    await expect(
      service.create(second.id, { seatId: seatIds[2], arrivalAt }),
    ).rejects.toThrow(
      new ConflictException('This seat already has an active reservation'),
    );
    await expect(
      prisma.reservation.count({ where: { seatId: seatIds[2] } }),
    ).resolves.toBe(1);
  });

  it('refuse une 2ᵉ réservation active pour le même joueur (409 joueur)', async () => {
    const user = await createUser('user');
    await service.create(user.id, { seatId: seatIds[3], arrivalAt });

    await expect(
      service.create(user.id, { seatId: seatIds[4], arrivalAt }),
    ).rejects.toThrow(
      new ConflictException('This user already has an active reservation'),
    );
  });

  it('même place et même joueur sur deux journées casino différentes : les deux passent', async () => {
    const user = await createUser('two-days');
    // la place est occupée maintenant : sans effet sur une arrivée un autre jour
    await prisma.seat.update({
      where: { id: seatIds[10] },
      data: { status: SeatStatus.OCCUPIED },
    });

    await expect(
      service.create(user.id, { seatId: seatIds[10], arrivalAt }),
    ).resolves.toBeDefined();
    await expect(
      service.create(user.id, {
        seatId: seatIds[10],
        arrivalAt: addHours(arrivalAt, 24),
      }),
    ).resolves.toBeDefined();
  });

  it('une arrivée après minuit compte pour la journée casino de la veille (409 place)', async () => {
    const first = await createUser('night-a');
    const second = await createUser('night-b');
    // J+3 18:00 UTC (soirée) et J+4 01:00 UTC (2h ou 3h à Paris) : même journée casino.
    // Jours distincts de ceux du test précédent, qui utilise la même place.
    const evening = addHours(arrivalAt, 48);
    await service.create(first.id, { seatId: seatIds[10], arrivalAt: evening });

    await expect(
      service.create(second.id, {
        seatId: seatIds[10],
        arrivalAt: addHours(evening, 7),
      }),
    ).rejects.toThrow(
      new ConflictException('This seat already has an active reservation'),
    );
  });

  it('une réservation annulée ne bloque ni la place ni le joueur', async () => {
    const first = await createUser('cancel-a');
    const second = await createUser('cancel-b');
    const cancelled = await service.create(first.id, {
      seatId: seatIds[5],
      arrivalAt,
    });
    await prisma.reservation.update({
      where: { id: cancelled.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    // la place est de nouveau réservable par un autre joueur
    await expect(
      service.create(second.id, { seatId: seatIds[5], arrivalAt }),
    ).resolves.toBeDefined();
    // et le joueur peut réserver une autre place
    await expect(
      service.create(first.id, { seatId: seatIds[6], arrivalAt }),
    ).resolves.toBeDefined();
  });

  it('deux réservations simultanées sur la même place : une seule réussit', async () => {
    const first = await createUser('race-a');
    const second = await createUser('race-b');

    const results = await Promise.allSettled([
      service.create(first.id, { seatId: seatIds[7], arrivalAt }),
      service.create(second.id, { seatId: seatIds[7], arrivalAt }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    await expect(
      prisma.reservation.count({ where: { seatId: seatIds[7] } }),
    ).resolves.toBe(1);
  });

  it('lève BadRequestException pour une place supprimée', async () => {
    const user = await createUser('seat-deleted');
    await prisma.seat.update({
      where: { id: seatIds[8] },
      data: { deletedAt: new Date() },
    });

    await expect(
      service.create(user.id, { seatId: seatIds[8], arrivalAt }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lève BadRequestException pour une place dont la table est supprimée', async () => {
    const user = await createUser('table-deleted');

    await expect(
      service.create(user.id, { seatId: seatOnDeletedTableId, arrivalAt }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lève BadRequestException pour un seatId inconnu', async () => {
    const user = await createUser('seat-unknown');

    await expect(
      service.create(user.id, {
        seatId: '00000000-0000-4000-8000-000000000000',
        arrivalAt,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('findAllForUser', () => {
    it('ne renvoie que les réservations du joueur, annulées comprises, la plus lointaine en premier', async () => {
      const owner = await createUser('list-owner');
      const other = await createUser('list-other');
      // Insertion directe : on teste la lecture, pas les règles de création.
      // Place 9 réservée par personne d'autre, sur trois journées casino distinctes.
      const soon = await prisma.reservation.create({
        data: {
          userId: owner.id,
          seatId: seatIds[9],
          arrivalAt,
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      const later = await prisma.reservation.create({
        data: {
          userId: owner.id,
          seatId: seatIds[9],
          arrivalAt: addHours(arrivalAt, 48),
          status: ReservationStatus.PENDING_PAYMENT,
        },
      });
      await prisma.reservation.create({
        data: {
          userId: other.id,
          seatId: seatIds[9],
          arrivalAt: addHours(arrivalAt, 24),
          status: ReservationStatus.PENDING_PAYMENT,
        },
      });

      const reservations = await service.findAllForUser(owner.id);

      expect(reservations.map((r) => r.id)).toEqual([later.id, soon.id]);
      expect(reservations.every((r) => r.userId === owner.id)).toBe(true);
    });

    it('renvoie un tableau vide pour un joueur sans réservation', async () => {
      const user = await createUser('list-empty');

      await expect(service.findAllForUser(user.id)).resolves.toEqual([]);
    });
  });

  describe('cancel', () => {
    // Insertion directe en CONFIRMED : le paiement n'existe pas encore,
    // service.create ne produit que des PENDING_PAYMENT.
    const createConfirmed = (userId: string, seatId: string, at: Date) =>
      prisma.reservation.create({
        data: {
          userId,
          seatId,
          arrivalAt: at,
          status: ReservationStatus.CONFIRMED,
        },
      });

    it('annule une réservation CONFIRMED, libère la place, et refuse une 2ᵉ annulation', async () => {
      const owner = await createUser('cancel-owner');
      const next = await createUser('cancel-next');
      // place 4 : libre ce jour-là (le test « 409 joueur » n'a rien pu y créer)
      const reservation = await createConfirmed(
        owner.id,
        seatIds[4],
        arrivalAt,
      );

      const cancelled = await service.cancel(owner.id, reservation.id);

      expect(cancelled.status).toBe(ReservationStatus.CANCELLED);
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
      // la place est de nouveau réservable par un autre joueur, le même jour
      await expect(
        service.create(next.id, { seatId: seatIds[4], arrivalAt }),
      ).resolves.toBeDefined();
      // une réservation déjà annulée ne peut pas l'être une 2ᵉ fois
      await expect(
        service.cancel(owner.id, reservation.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("un joueur ne peut pas annuler la réservation d'un autre (404, rien ne change)", async () => {
      const owner = await createUser('cancel-victim');
      const intruder = await createUser('cancel-intruder');
      // place 9, J+5 (arrivalAt + 4 jours) : journée que les tests de liste n'utilisent pas
      const reservation = await createConfirmed(
        owner.id,
        seatIds[9],
        addHours(arrivalAt, 96),
      );

      await expect(
        service.cancel(intruder.id, reservation.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } }),
      ).resolves.toMatchObject({
        status: ReservationStatus.CONFIRMED,
        cancelledAt: null,
      });
    });

    it('lève NotFoundException pour un id inconnu', async () => {
      const user = await createUser('cancel-unknown');

      await expect(
        service.cancel(user.id, '00000000-0000-4000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('expirePendingPayments', () => {
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60 * 1000);

    // place 1, journées J+2 à J+4 (dayOffset 1 à 3) : jamais utilisées par les autres tests
    const insert = (
      userId: string,
      status: ReservationStatus,
      createdAt: Date,
      dayOffset: number,
    ) =>
      prisma.reservation.create({
        data: {
          userId,
          seatId: seatIds[1],
          arrivalAt: addHours(arrivalAt, 24 * dayOffset),
          status,
          createdAt,
        },
      });

    const statusOf = async (id: string) =>
      (await prisma.reservation.findUniqueOrThrow({ where: { id } })).status;

    it('expire les PENDING_PAYMENT de plus de 15 min, et seulement elles', async () => {
      const stalePlayer = await createUser('expire-stale');
      const freshPlayer = await createUser('expire-fresh');
      const confirmedPlayer = await createUser('expire-confirmed');
      const stale = await insert(
        stalePlayer.id,
        ReservationStatus.PENDING_PAYMENT,
        minutesAgo(20),
        1,
      );
      const fresh = await insert(
        freshPlayer.id,
        ReservationStatus.PENDING_PAYMENT,
        minutesAgo(5),
        2,
      );
      const confirmed = await insert(
        confirmedPlayer.id,
        ReservationStatus.CONFIRMED,
        minutesAgo(20),
        3,
      );

      // Pas d'assertion sur le nombre renvoyé : le cron du conteneur backend tourne
      // sur la même base et peut avoir déjà expiré `stale` (et d'autres lignes).
      // Le nombre est vérifié par le test unitaire ; ici on vérifie les statuts.
      await service.expirePendingPayments();

      await expect(statusOf(stale.id)).resolves.toBe(ReservationStatus.EXPIRED);
      await expect(statusOf(fresh.id)).resolves.toBe(
        ReservationStatus.PENDING_PAYMENT,
      );
      await expect(statusOf(confirmed.id)).resolves.toBe(
        ReservationStatus.CONFIRMED,
      );
    });

    it('libère la place et le joueur après l’expiration', async () => {
      const late = await createUser('expire-late');
      const next = await createUser('expire-next');
      // place 1, J+5 (arrivalAt + 4 jours) : libre (le test précédent s'arrête à J+4)
      const day = addHours(arrivalAt, 24 * 4);
      // Créée « fraîche » : aucun cron (celui du conteneur backend tourne sur la
      // même base) ne peut l'expirer avant qu'on vérifie qu'elle bloque la place.
      const pending = await prisma.reservation.create({
        data: {
          userId: late.id,
          seatId: seatIds[1],
          arrivalAt: day,
          status: ReservationStatus.PENDING_PAYMENT,
        },
      });
      // tant qu'elle n'a pas expiré, la réservation bloque la place
      await expect(
        service.create(next.id, { seatId: seatIds[1], arrivalAt: day }),
      ).rejects.toBeInstanceOf(ConflictException);

      // on la vieillit au-delà du délai de paiement, puis on expire
      await prisma.reservation.update({
        where: { id: pending.id },
        data: { createdAt: minutesAgo(16) },
      });
      await service.expirePendingPayments();
      await expect(statusOf(pending.id)).resolves.toBe(
        ReservationStatus.EXPIRED,
      );

      // la place est réservable par un autre joueur, le même jour
      await expect(
        service.create(next.id, { seatId: seatIds[1], arrivalAt: day }),
      ).resolves.toBeDefined();
      // et le joueur peut réserver une autre place le même jour
      await expect(
        service.create(late.id, { seatId: seatIds[7], arrivalAt: day }),
      ).resolves.toBeDefined();
    });
  });

  describe('findForFloor : réservations actives d’une journée casino', () => {
    // Journée casino fixe et lointaine, en heure d'hiver (Paris = UTC+1) :
    // elle va du 12/03/2030 5 h au 13/03/2030 5 h, heure de Paris.
    const DAY = '2030-03-12';
    const paris = (iso: string) => new Date(`${iso}+01:00`);

    let floorTableId: string;
    let floorTableName: string;
    const floorSeatIds: Record<number, string> = {};
    let otherCasinoId: string;
    let otherCasinoSeatId: string;

    const book = async (
      name: string,
      seatId: string,
      arrival: Date,
      status: ReservationStatus = ReservationStatus.CONFIRMED,
    ) => {
      const user = await createUser(`floor-${name}`);
      return prisma.reservation.create({
        data: { userId: user.id, seatId, status, arrivalAt: arrival },
      });
    };

    beforeAll(async () => {
      floorTableName = `${prefix}-floor-table`;
      const table = await prisma.pokerTable.create({
        data: {
          casinoId,
          name: floorTableName,
          variant: PokerVariant.TEXAS_HOLDEM,
          smallBlind: 1,
          bigBlind: 2,
          maxSeats: 10,
          seats: {
            createMany: {
              data: Array.from({ length: 10 }, (_, i) => ({
                seatNumber: i + 1,
              })),
            },
          },
        },
        include: { seats: true },
      });
      floorTableId = table.id;
      for (const seat of table.seats) {
        floorSeatIds[seat.seatNumber] = seat.id;
      }

      const otherCasino = await prisma.casino.create({
        data: {
          name: `${prefix}-floor-other-casino`,
          city: 'Test',
          address: `${prefix}-floor-other-address`,
        },
      });
      otherCasinoId = otherCasino.id;
      const otherTable = await prisma.pokerTable.create({
        data: {
          casinoId: otherCasinoId,
          name: `${prefix}-floor-other-table`,
          variant: PokerVariant.TEXAS_HOLDEM,
          smallBlind: 1,
          bigBlind: 2,
          maxSeats: 2,
          seats: { create: { seatNumber: 1 } },
        },
        include: { seats: true },
      });
      otherCasinoSeatId = otherTable.seats[0].id;
    });

    afterAll(async () => {
      await prisma.reservation.deleteMany({
        where: { seat: { table: { casinoId: otherCasinoId } } },
      });
      await prisma.seat.deleteMany({
        where: { table: { casinoId: otherCasinoId } },
      });
      await prisma.pokerTable.deleteMany({
        where: { casinoId: otherCasinoId },
      });
      await prisma.casino.delete({ where: { id: otherCasinoId } });
    });

    afterEach(async () => {
      await prisma.reservation.deleteMany({
        where: {
          seat: {
            table: { id: floorTableId },
          },
        },
      });
      await prisma.reservation.deleteMany({
        where: { seatId: otherCasinoSeatId },
      });
    });

    it('renvoie les réservations actives du jour, triées par arrivalAt, avec joueur, place et table', async () => {
      const late = await book(
        'late',
        floorSeatIds[1],
        paris('2030-03-12T22:00'),
      );
      const early = await book(
        'early',
        floorSeatIds[2],
        paris('2030-03-12T19:00'),
        ReservationStatus.PENDING_PAYMENT,
      );
      const seated = await book(
        'seated',
        floorSeatIds[3],
        paris('2030-03-12T20:00'),
        ReservationStatus.SEATED,
      );

      const result = await service.findForFloor(casinoId, DAY);

      expect(result.map((r) => r.id)).toEqual([early.id, seated.id, late.id]);
      expect(result[0]).toMatchObject({
        user: { pseudo: `${prefix}-floor-early` },
        seat: {
          seatNumber: 2,
          table: { id: floorTableId, name: floorTableName },
        },
      });
    });

    it('utilise la journée casino : 4 h 30 le lendemain en fait partie, 4 h 30 le jour même non', async () => {
      const afterMidnight = await book(
        'after-midnight',
        floorSeatIds[1],
        paris('2030-03-13T04:30'),
      );
      await book('previous-night', floorSeatIds[2], paris('2030-03-12T04:30'));
      await book('next-day', floorSeatIds[3], paris('2030-03-13T05:30'));

      const result = await service.findForFloor(casinoId, DAY);

      expect(result.map((r) => r.id)).toEqual([afterMidnight.id]);
    });

    it.each([
      ReservationStatus.COMPLETED,
      ReservationStatus.CANCELLED,
      ReservationStatus.NO_SHOW,
      ReservationStatus.EXPIRED,
    ])('ignore une réservation %s', async (status) => {
      await book(
        `inactive-${status}`,
        floorSeatIds[1],
        paris('2030-03-12T20:00'),
        status,
      );

      await expect(service.findForFloor(casinoId, DAY)).resolves.toEqual([]);
    });

    it('ignore les réservations d’un autre casino', async () => {
      await book('other-casino', otherCasinoSeatId, paris('2030-03-12T20:00'));

      await expect(service.findForFloor(casinoId, DAY)).resolves.toEqual([]);
    });

    it('sans day, prend la journée casino en cours', async () => {
      // D'autres tests de ce fichier peuvent laisser des réservations du jour
      // dans ce casino : on vérifie l'appartenance, pas la liste exacte.
      const now = await book('now', floorSeatIds[1], new Date());
      const future = await book(
        'future',
        floorSeatIds[2],
        paris('2030-03-12T20:00'),
      );

      const ids = (await service.findForFloor(casinoId)).map((r) => r.id);

      expect(ids).toContain(now.id);
      expect(ids).not.toContain(future.id);
    });
  });

  describe('transitions floor : seat, leave, no-show', () => {
    let tTableId: string;
    const tSeatIds: Record<number, string> = {};
    let otherCasinoId: string;
    let otherCasinoSeatId: string;
    const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

    const book = async (
      name: string,
      seatId: string,
      arrival: Date,
      status: ReservationStatus = ReservationStatus.CONFIRMED,
    ) => {
      const user = await createUser(`tr-${name}`);
      return prisma.reservation.create({
        data: { userId: user.id, seatId, status, arrivalAt: arrival },
      });
    };
    const seatStatus = async (seatId: string) =>
      (await prisma.seat.findUniqueOrThrow({ where: { id: seatId } })).status;
    const reservationOf = (id: string) =>
      prisma.reservation.findUniqueOrThrow({ where: { id } });

    beforeAll(async () => {
      const table = await prisma.pokerTable.create({
        data: {
          casinoId,
          name: `${prefix}-transitions-table`,
          variant: PokerVariant.TEXAS_HOLDEM,
          smallBlind: 1,
          bigBlind: 2,
          maxSeats: 10,
          seats: {
            createMany: {
              data: Array.from({ length: 10 }, (_, i) => ({
                seatNumber: i + 1,
              })),
            },
          },
        },
        include: { seats: true },
      });
      tTableId = table.id;
      for (const seat of table.seats) {
        tSeatIds[seat.seatNumber] = seat.id;
      }

      const otherCasino = await prisma.casino.create({
        data: {
          name: `${prefix}-tr-other-casino`,
          city: 'Test',
          address: `${prefix}-tr-other-address`,
        },
      });
      otherCasinoId = otherCasino.id;
      const otherTable = await prisma.pokerTable.create({
        data: {
          casinoId: otherCasinoId,
          name: `${prefix}-tr-other-table`,
          variant: PokerVariant.TEXAS_HOLDEM,
          smallBlind: 1,
          bigBlind: 2,
          maxSeats: 2,
          seats: { create: { seatNumber: 1 } },
        },
        include: { seats: true },
      });
      otherCasinoSeatId = otherTable.seats[0].id;
    });

    afterAll(async () => {
      await prisma.reservation.deleteMany({
        where: { seat: { table: { casinoId: otherCasinoId } } },
      });
      await prisma.seat.deleteMany({
        where: { table: { casinoId: otherCasinoId } },
      });
      await prisma.pokerTable.deleteMany({
        where: { casinoId: otherCasinoId },
      });
      await prisma.casino.delete({ where: { id: otherCasinoId } });
    });

    afterEach(async () => {
      await prisma.reservation.deleteMany({
        where: { seat: { tableId: tTableId } },
      });
      await prisma.reservation.deleteMany({
        where: { seatId: otherCasinoSeatId },
      });
      await prisma.seat.updateMany({
        where: { tableId: tTableId },
        data: { status: SeatStatus.FREE },
      });
    });

    describe('seat (check-in)', () => {
      it('CONFIRMED du jour -> SEATED, seatedAt posé, place OCCUPIED', async () => {
        const booked = await book('seat-ok', tSeatIds[1], new Date());
        const before = Date.now();

        const result = await service.updateSeatedForFloor(casinoId, booked.id);

        expect(result).toMatchObject({
          id: booked.id,
          status: ReservationStatus.SEATED,
        });
        expect(result.seatedAt).toBeInstanceOf(Date);
        expect(result.seatedAt!.getTime()).toBeGreaterThanOrEqual(
          before - 1000,
        );
        expect((await reservationOf(booked.id)).status).toBe(
          ReservationStatus.SEATED,
        );
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.OCCUPIED);
      });

      it('hors de la journée casino de arrivalAt -> 409, rien ne change', async () => {
        const booked = await book(
          'seat-other-day',
          tSeatIds[1],
          new Date('2030-03-12T20:00+01:00'),
        );

        await expect(
          service.updateSeatedForFloor(casinoId, booked.id),
        ).rejects.toThrow(ConflictException);
        expect((await reservationOf(booked.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.FREE);
      });

      it('place déjà OCCUPIED (walk-in) -> 409, la réservation reste CONFIRMED', async () => {
        const booked = await book('seat-occupied', tSeatIds[1], new Date());
        await prisma.seat.update({
          where: { id: tSeatIds[1] },
          data: { status: SeatStatus.OCCUPIED },
        });

        await expect(
          service.updateSeatedForFloor(casinoId, booked.id),
        ).rejects.toThrow(ConflictException);
        expect((await reservationOf(booked.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
      });

      it.each([
        ReservationStatus.PENDING_PAYMENT,
        ReservationStatus.SEATED,
        ReservationStatus.COMPLETED,
        ReservationStatus.CANCELLED,
        ReservationStatus.NO_SHOW,
        ReservationStatus.EXPIRED,
      ])('réservation %s -> 409', async (status) => {
        const booked = await book(
          `seat-${status}`,
          tSeatIds[1],
          new Date(),
          status,
        );

        await expect(
          service.updateSeatedForFloor(casinoId, booked.id),
        ).rejects.toThrow(ConflictException);
        expect((await reservationOf(booked.id)).status).toBe(status);
      });

      it('deux check-in en parallèle : un seul passe, l’autre prend 409', async () => {
        const booked = await book('seat-race', tSeatIds[1], new Date());

        const results = await Promise.allSettled([
          service.updateSeatedForFloor(casinoId, booked.id),
          service.updateSeatedForFloor(casinoId, booked.id),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(ConflictException);
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.OCCUPIED);
      });

      it('réservation d’un autre casino -> 404', async () => {
        const booked = await book(
          'seat-other-casino',
          otherCasinoSeatId,
          new Date(),
        );

        await expect(
          service.updateSeatedForFloor(casinoId, booked.id),
        ).rejects.toThrow(NotFoundException);
        expect((await reservationOf(booked.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
      });

      it('réservation inconnue -> 404', async () => {
        await expect(
          service.updateSeatedForFloor(casinoId, UNKNOWN_ID),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('leave (départ)', () => {
      it('SEATED -> COMPLETED, leftAt posé, place FREE', async () => {
        const booked = await book(
          'leave-ok',
          tSeatIds[1],
          new Date(),
          ReservationStatus.SEATED,
        );
        await prisma.seat.update({
          where: { id: tSeatIds[1] },
          data: { status: SeatStatus.OCCUPIED },
        });

        const result = await service.updateLeavedForFloor(casinoId, booked.id);

        expect(result).toMatchObject({
          id: booked.id,
          status: ReservationStatus.COMPLETED,
        });
        expect(result.leftAt).toBeInstanceOf(Date);
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.FREE);
      });

      it.each([
        ReservationStatus.PENDING_PAYMENT,
        ReservationStatus.CONFIRMED,
        ReservationStatus.COMPLETED,
        ReservationStatus.CANCELLED,
        ReservationStatus.NO_SHOW,
        ReservationStatus.EXPIRED,
      ])('réservation %s -> 409', async (status) => {
        const booked = await book(
          `leave-${status}`,
          tSeatIds[1],
          new Date(),
          status,
        );

        await expect(
          service.updateLeavedForFloor(casinoId, booked.id),
        ).rejects.toThrow(ConflictException);
        expect((await reservationOf(booked.id)).status).toBe(status);
      });

      it('deux départs en parallèle : un seul passe, l’autre prend 409', async () => {
        const booked = await book(
          'leave-race',
          tSeatIds[1],
          new Date(),
          ReservationStatus.SEATED,
        );
        await prisma.seat.update({
          where: { id: tSeatIds[1] },
          data: { status: SeatStatus.OCCUPIED },
        });

        const results = await Promise.allSettled([
          service.updateLeavedForFloor(casinoId, booked.id),
          service.updateLeavedForFloor(casinoId, booked.id),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      });

      it('réservation d’un autre casino -> 404', async () => {
        const booked = await book(
          'leave-other-casino',
          otherCasinoSeatId,
          new Date(),
          ReservationStatus.SEATED,
        );

        await expect(
          service.updateLeavedForFloor(casinoId, booked.id),
        ).rejects.toThrow(NotFoundException);
      });

      it('réservation inconnue -> 404', async () => {
        await expect(
          service.updateLeavedForFloor(casinoId, UNKNOWN_ID),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('noShow', () => {
      it('CONFIRMED dont arrivalAt est passé -> NO_SHOW, place inchangée', async () => {
        const booked = await book(
          'noshow-ok',
          tSeatIds[1],
          addHours(new Date(), -1),
        );

        const result = await service.updateNotShowedForFloor(
          casinoId,
          booked.id,
        );

        expect(result).toMatchObject({
          id: booked.id,
          status: ReservationStatus.NO_SHOW,
        });
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.FREE);
      });

      it('CONFIRMED de la veille -> NO_SHOW aussi', async () => {
        const booked = await book(
          'noshow-yesterday',
          tSeatIds[1],
          addHours(new Date(), -30),
        );

        await expect(
          service.updateNotShowedForFloor(casinoId, booked.id),
        ).resolves.toMatchObject({
          status: ReservationStatus.NO_SHOW,
        });
      });

      it('arrivalAt pas encore atteint -> 409, reste CONFIRMED', async () => {
        const booked = await book(
          'noshow-future',
          tSeatIds[1],
          addHours(new Date(), 1),
        );

        await expect(
          service.updateNotShowedForFloor(casinoId, booked.id),
        ).rejects.toThrow(ConflictException);
        expect((await reservationOf(booked.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
      });

      it.each([
        ReservationStatus.PENDING_PAYMENT,
        ReservationStatus.SEATED,
        ReservationStatus.COMPLETED,
        ReservationStatus.CANCELLED,
        ReservationStatus.NO_SHOW,
        ReservationStatus.EXPIRED,
      ])('réservation %s -> 409', async (status) => {
        const booked = await book(
          `noshow-${status}`,
          tSeatIds[1],
          addHours(new Date(), -1),
          status,
        );

        await expect(
          service.updateNotShowedForFloor(casinoId, booked.id),
        ).rejects.toThrow(ConflictException);
        expect((await reservationOf(booked.id)).status).toBe(status);
      });

      it('réservation d’un autre casino -> 404', async () => {
        const booked = await book(
          'noshow-other-casino',
          otherCasinoSeatId,
          addHours(new Date(), -1),
        );

        await expect(
          service.updateNotShowedForFloor(casinoId, booked.id),
        ).rejects.toThrow(NotFoundException);
      });

      it('réservation inconnue -> 404', async () => {
        await expect(
          service.updateNotShowedForFloor(casinoId, UNKNOWN_ID),
        ).rejects.toThrow(NotFoundException);
      });
    });

    // Étape 8 : méthodes appelées par les crons (ReservationsScheduler).
    // Elles sont globales (tous les casinos) : on ne vérifie que nos propres
    // lignes, et les compteurs renvoyés avec « au moins ».
    describe('expireNoShows (cron)', () => {
      const minutesAgo = (minutes: number) =>
        new Date(Date.now() - minutes * 60 * 1000);

      it('CONFIRMED arrivé depuis plus de 30 min -> NO_SHOW, place inchangée', async () => {
        const late = await book('cron-ns-late', tSeatIds[1], minutesAgo(31));

        const count = await service.expireNoShows();

        expect(count).toBeGreaterThanOrEqual(1);
        expect((await reservationOf(late.id)).status).toBe(
          ReservationStatus.NO_SHOW,
        );
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.FREE);
      });

      it('CONFIRMED de la veille -> NO_SHOW aussi', async () => {
        const yesterday = await book(
          'cron-ns-yesterday',
          tSeatIds[2],
          addHours(new Date(), -24),
        );

        await service.expireNoShows();

        expect((await reservationOf(yesterday.id)).status).toBe(
          ReservationStatus.NO_SHOW,
        );
      });

      it('CONFIRMED en retard de moins de 30 min -> reste CONFIRMED', async () => {
        const slightlyLate = await book(
          'cron-ns-grace',
          tSeatIds[3],
          minutesAgo(20),
        );
        const upcoming = await book(
          'cron-ns-upcoming',
          tSeatIds[4],
          addHours(new Date(), 2),
        );

        await service.expireNoShows();

        expect((await reservationOf(slightlyLate.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
        expect((await reservationOf(upcoming.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
      });

      it.each([
        ReservationStatus.PENDING_PAYMENT,
        ReservationStatus.SEATED,
        ReservationStatus.COMPLETED,
        ReservationStatus.CANCELLED,
      ])('ne touche pas une réservation %s, même en retard', async (status) => {
        const booked = await book(
          `cron-ns-${status}`,
          tSeatIds[5],
          addHours(new Date(), -2),
          status,
        );

        await service.expireNoShows();

        expect((await reservationOf(booked.id)).status).toBe(status);
      });
    });

    describe('closeCasinoDay (cron)', () => {
      // Instant de fermeture passé explicitement : le cron l'appelle sans
      // argument (maintenant, soit 5 h à Paris).
      const closedAt = new Date('2026-11-26T04:00:00.000Z');

      it('SEATED -> COMPLETED, leftAt = instant de fermeture, place FREE', async () => {
        const seated = await book(
          'cron-close-seated',
          tSeatIds[1],
          addHours(new Date(), -3),
          ReservationStatus.SEATED,
        );
        await prisma.seat.update({
          where: { id: tSeatIds[1] },
          data: { status: SeatStatus.OCCUPIED },
        });

        const result = await service.closeCasinoDay(closedAt);

        const after = await reservationOf(seated.id);
        expect(after.status).toBe(ReservationStatus.COMPLETED);
        expect(after.leftAt).toEqual(closedAt);
        expect(await seatStatus(tSeatIds[1])).toBe(SeatStatus.FREE);
        expect(result.completed).toBeGreaterThanOrEqual(1);
        expect(result.freed).toBeGreaterThanOrEqual(1);
      });

      it('libère aussi les places walk-in (OCCUPIED sans réservation)', async () => {
        await prisma.seat.updateMany({
          where: { id: { in: [tSeatIds[6], tSeatIds[7]] } },
          data: { status: SeatStatus.OCCUPIED },
        });

        const result = await service.closeCasinoDay(closedAt);

        expect(await seatStatus(tSeatIds[6])).toBe(SeatStatus.FREE);
        expect(await seatStatus(tSeatIds[7])).toBe(SeatStatus.FREE);
        expect(result.freed).toBeGreaterThanOrEqual(2);
      });

      it('ne touche ni les CONFIRMED à venir ni les COMPLETED déjà partis', async () => {
        const upcoming = await book(
          'cron-close-upcoming',
          tSeatIds[2],
          addHours(new Date(), 4),
        );
        const earlierLeave = new Date('2026-11-25T22:00:00.000Z');
        const user = await createUser('tr-cron-close-done');
        const done = await prisma.reservation.create({
          data: {
            userId: user.id,
            seatId: tSeatIds[3],
            arrivalAt: addHours(new Date(), -5),
            status: ReservationStatus.COMPLETED,
            seatedAt: addHours(new Date(), -5),
            leftAt: earlierLeave,
          },
        });

        await service.closeCasinoDay(closedAt);

        expect((await reservationOf(upcoming.id)).status).toBe(
          ReservationStatus.CONFIRMED,
        );
        const doneAfter = await reservationOf(done.id);
        expect(doneAfter.status).toBe(ReservationStatus.COMPLETED);
        expect(doneAfter.leftAt).toEqual(earlierLeave);
      });

      it('sans argument, pose leftAt à maintenant', async () => {
        const seated = await book(
          'cron-close-now',
          tSeatIds[4],
          addHours(new Date(), -2),
          ReservationStatus.SEATED,
        );
        const before = Date.now();

        await service.closeCasinoDay();

        const leftAt = (await reservationOf(seated.id)).leftAt;
        expect(leftAt).toBeInstanceOf(Date);
        expect(leftAt?.getTime()).toBeGreaterThanOrEqual(before);
        expect(leftAt?.getTime()).toBeLessThanOrEqual(Date.now());
      });
    });
  });
});
