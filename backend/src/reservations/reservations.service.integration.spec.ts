import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import {
  PokerVariant,
  ReservationStatus,
  SeatStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from './reservations.service';

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
});
