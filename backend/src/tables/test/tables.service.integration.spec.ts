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
  TableStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTableDto } from '../dto/create-table.dto';
import { TablesService } from '../tables.service';

// Test d'intégration : utilise la vraie base de dev (DATABASE_URL), jamais la prod.
describe('TablesService (intégration)', () => {
  let moduleRef: TestingModule;
  let service: TablesService;
  let prisma: PrismaService;
  let casinoId: string;
  let userId: string;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Préfixe unique par exécution, pour ne nettoyer que nos propres données
  const prefix = `t-${Date.now().toString(36)}`;

  const makeDto = (
    name: string,
    overrides: Partial<CreateTableDto> = {},
  ): CreateTableDto => ({
    name: `${prefix}-${name}`,
    variant: PokerVariant.TEXAS_HOLDEM,
    smallBlind: 1,
    bigBlind: 2,
    maxSeats: 6,
    ...overrides,
  });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    service = moduleRef.get(TablesService, { strict: false });
    prisma = moduleRef.get(PrismaService, { strict: false });

    const casino = await prisma.casino.create({
      data: { name: `${prefix}-casino`, city: 'Test', address: 'Test' },
    });
    casinoId = casino.id;

    const user = await prisma.user.create({
      data: {
        email: `${prefix}-player@test.local`,
        pseudo: `${prefix}-player`,
        firstName: 'Test',
        lastName: 'Player',
        birthDate: new Date('1990-01-01'),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // onDelete: Restrict → réservations, sièges, tables, casino, puis joueur
    await prisma.reservation.deleteMany({
      where: { seat: { table: { casinoId } } },
    });
    await prisma.seat.deleteMany({ where: { table: { casinoId } } });
    await prisma.pokerTable.deleteMany({ where: { casinoId } });
    await prisma.casino.delete({ where: { id: casinoId } });
    await prisma.user.delete({ where: { id: userId } });
    await moduleRef.close();
  });

  // Chaque réservation reçoit sa propre journée casino : l'index unique
  // « une réservation active par place / par joueur et par journée » ne
  // peut pas faire échouer un test à cause d'un autre.
  let dayOffset = 2;
  const nextFutureDay = () => new Date(Date.now() + dayOffset++ * DAY_MS);
  const pastDay = () => new Date(Date.now() - dayOffset++ * DAY_MS);

  async function reserve(
    tableId: string,
    seatNumber: number,
    status: ReservationStatus,
    arrivalAt: Date,
  ) {
    const seat = await prisma.seat.findFirstOrThrow({
      where: { tableId, seatNumber },
    });
    return prisma.reservation.create({
      data: { userId, seatId: seat.id, status, arrivalAt },
    });
  }

  // Toutes les lignes en base, places supprimées comprises
  const allSeats = (tableId: string) =>
    prisma.seat.findMany({
      where: { tableId },
      orderBy: { seatNumber: 'asc' },
    });

  it('crée une table avec maxSeats sièges libres numérotés de 1 à N', async () => {
    const created = await service.create(
      casinoId,
      makeDto('create', { maxSeats: 4 }),
    );

    expect(created.id).toBeDefined();
    expect(created.casinoId).toBe(casinoId);
    expect(created.seats.map((seat) => seat.seatNumber)).toEqual([1, 2, 3, 4]);
    expect(created.seats.every((seat) => seat.status === 'FREE')).toBe(true);
  });

  it('rejette un casinoId inexistant avec un BadRequestException', async () => {
    await expect(
      service.create(
        '00000000-0000-4000-8000-000000000000',
        makeDto('nocasino'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette des blindes invalides sans rien écrire en base', async () => {
    await expect(
      service.create(
        casinoId,
        makeDto('blinds', { smallBlind: 10, bigBlind: 5 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      prisma.pokerTable.count({ where: { name: `${prefix}-blinds` } }),
    ).resolves.toBe(0);
  });

  it('findById renvoie la table sans ses sièges supprimés', async () => {
    const created = await service.create(
      casinoId,
      makeDto('find', { maxSeats: 3 }),
    );
    await prisma.seat.update({
      where: { tableId_seatNumber: { tableId: created.id, seatNumber: 2 } },
      data: { deletedAt: new Date() },
    });

    const found = await service.findById(casinoId, created.id);

    expect(found.id).toBe(created.id);
    expect(found.seats.map((seat) => seat.seatNumber)).toEqual([1, 3]);
  });

  it('findById lève NotFoundException pour une table supprimée', async () => {
    const created = await service.create(casinoId, makeDto('deleted'));
    await prisma.pokerTable.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });

    await expect(service.findById(casinoId, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findById lève NotFoundException pour un id inconnu', async () => {
    await expect(
      service.findById(casinoId, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findAll renvoie les tables non supprimées triées par nom', async () => {
    await service.create(casinoId, makeDto('list-b'));
    await service.create(casinoId, makeDto('list-a'));

    const names = (await service.findAll(casinoId))
      .map((table) => table.name)
      .filter((name) => name.startsWith(`${prefix}-list`));

    expect(names).toEqual([`${prefix}-list-a`, `${prefix}-list-b`]);
    await expect(service.findAll(casinoId)).resolves.not.toContainEqual(
      expect.objectContaining({ name: `${prefix}-deleted` }),
    );
  });

  it('updateTable remplace la config et conserve les sièges', async () => {
    const created = await service.create(
      casinoId,
      makeDto('update', { maxSeats: 3 }),
    );

    const updated = await service.updateTable(
      casinoId,
      created.id,
      makeDto('update-renamed', {
        variant: PokerVariant.OMAHA,
        smallBlind: 5,
        bigBlind: 10,
        maxSeats: 3,
      }),
    );

    expect(updated.name).toBe(`${prefix}-update-renamed`);
    expect(updated.variant).toBe(PokerVariant.OMAHA);
    expect(updated.smallBlind).toBe(5);
    expect(updated.bigBlind).toBe(10);
    expect(updated.maxSeats).toBe(3);
    expect(updated.seats.map((seat) => seat.seatNumber)).toEqual([1, 2, 3]);
  });

  describe('updateTable : changement de maxSeats', () => {
    it('en hausse, crée les places manquantes, libres', async () => {
      const created = await service.create(
        casinoId,
        makeDto('seats-up', { maxSeats: 3 }),
      );

      const updated = await service.updateTable(
        casinoId,
        created.id,
        makeDto('seats-up', { maxSeats: 5 }),
      );

      expect(updated.maxSeats).toBe(5);
      expect(updated.seats.map((s) => s.seatNumber)).toEqual([1, 2, 3, 4, 5]);
      expect(updated.seats.every((s) => s.status === SeatStatus.FREE)).toBe(
        true,
      );
    });

    it('en baisse, supprime logiquement les dernières places', async () => {
      const created = await service.create(
        casinoId,
        makeDto('seats-down', { maxSeats: 5 }),
      );

      const updated = await service.updateTable(
        casinoId,
        created.id,
        makeDto('seats-down', { maxSeats: 3 }),
      );

      expect(updated.maxSeats).toBe(3);
      expect(updated.seats.map((s) => s.seatNumber)).toEqual([1, 2, 3]);
      const rows = await allSeats(created.id);
      expect(rows).toHaveLength(5);
      expect(
        rows.filter((s) => s.deletedAt !== null).map((s) => s.seatNumber),
      ).toEqual([4, 5]);
    });

    it('en hausse après une baisse, fait revivre les places au lieu de les recréer', async () => {
      const created = await service.create(
        casinoId,
        makeDto('seats-revive', { maxSeats: 5 }),
      );
      const before = await allSeats(created.id);
      await service.updateTable(
        casinoId,
        created.id,
        makeDto('seats-revive', { maxSeats: 3 }),
      );

      const updated = await service.updateTable(
        casinoId,
        created.id,
        makeDto('seats-revive', { maxSeats: 6 }),
      );

      expect(updated.seats.map((s) => s.seatNumber)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
      expect(updated.seats.every((s) => s.status === SeatStatus.FREE)).toBe(
        true,
      );
      const rows = await allSeats(created.id);
      // 6 lignes, pas 8 : les places 4 et 5 sont les mêmes qu'avant
      expect(rows).toHaveLength(6);
      expect(rows.every((s) => s.deletedAt === null)).toBe(true);
      expect(rows.slice(3, 5).map((s) => s.id)).toEqual(
        before.slice(3, 5).map((s) => s.id),
      );
    });

    it('en baisse, 409 si une place retirée est OCCUPIED, sans rien modifier', async () => {
      const created = await service.create(
        casinoId,
        makeDto('seats-occupied', { maxSeats: 5 }),
      );
      await prisma.seat.updateMany({
        where: { tableId: created.id, seatNumber: 5 },
        data: { status: SeatStatus.OCCUPIED },
      });

      await expect(
        service.updateTable(
          casinoId,
          created.id,
          makeDto('seats-occupied-renamed', { maxSeats: 3 }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      const after = await service.findById(casinoId, created.id);
      expect(after.maxSeats).toBe(5);
      expect(after.name).toBe(`${prefix}-seats-occupied`);
      expect(after.seats).toHaveLength(5);
    });

    it.each([
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.CONFIRMED,
      ReservationStatus.SEATED,
    ])(
      'en baisse, 409 si une place retirée a une réservation %s à venir',
      async (status) => {
        const created = await service.create(
          casinoId,
          makeDto(`seats-resa-${status}`, { maxSeats: 5 }),
        );
        await reserve(created.id, 4, status, nextFutureDay());

        await expect(
          service.updateTable(
            casinoId,
            created.id,
            makeDto(`seats-resa-${status}`, { maxSeats: 3 }),
          ),
        ).rejects.toBeInstanceOf(ConflictException);

        const rows = await allSeats(created.id);
        expect(rows.every((s) => s.deletedAt === null)).toBe(true);
      },
    );

    it('en baisse, ignore les réservations passées ou inactives', async () => {
      const created = await service.create(
        casinoId,
        makeDto('seats-old-resa', { maxSeats: 5 }),
      );
      // CONFIRMED d'un jour passé : jamais passée en NO_SHOW (pas encore de cron)
      await reserve(created.id, 4, ReservationStatus.CONFIRMED, pastDay());
      await reserve(
        created.id,
        5,
        ReservationStatus.CANCELLED,
        nextFutureDay(),
      );
      await reserve(created.id, 5, ReservationStatus.COMPLETED, pastDay());

      const updated = await service.updateTable(
        casinoId,
        created.id,
        makeDto('seats-old-resa', { maxSeats: 3 }),
      );

      expect(updated.seats.map((s) => s.seatNumber)).toEqual([1, 2, 3]);
    });

    it('en baisse, une réservation active sur une place gardée ne bloque pas', async () => {
      const created = await service.create(
        casinoId,
        makeDto('seats-kept-resa', { maxSeats: 5 }),
      );
      await reserve(
        created.id,
        2,
        ReservationStatus.CONFIRMED,
        nextFutureDay(),
      );

      const updated = await service.updateTable(
        casinoId,
        created.id,
        makeDto('seats-kept-resa', { maxSeats: 3 }),
      );

      expect(updated.seats.map((s) => s.seatNumber)).toEqual([1, 2, 3]);
    });
  });

  describe('deleteTable : réservations actives', () => {
    it('409 si une place a une réservation active à venir, la table reste', async () => {
      const created = await service.create(casinoId, makeDto('delete-resa'));
      await reserve(
        created.id,
        1,
        ReservationStatus.PENDING_PAYMENT,
        nextFutureDay(),
      );

      await expect(
        service.deleteTable(casinoId, created.id),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        service.findById(casinoId, created.id),
      ).resolves.toMatchObject({ id: created.id });
    });

    it('supprime la table si ses réservations sont passées ou inactives', async () => {
      const created = await service.create(
        casinoId,
        makeDto('delete-old-resa'),
      );
      await reserve(created.id, 1, ReservationStatus.CONFIRMED, pastDay());
      await reserve(
        created.id,
        2,
        ReservationStatus.CANCELLED,
        nextFutureDay(),
      );

      await service.deleteTable(casinoId, created.id);

      await expect(
        service.findById(casinoId, created.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('updateTable lève NotFoundException pour une table supprimée', async () => {
    const created = await service.create(casinoId, makeDto('update-deleted'));
    await service.deleteTable(casinoId, created.id);

    await expect(
      service.updateTable(casinoId, created.id, makeDto('update-deleted')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateState horodate moneyUpdatedAt quand moneyOnTable est envoyé', async () => {
    const created = await service.create(casinoId, makeDto('state-money'));

    const updated = await service.updateState(casinoId, created.id, {
      moneyOnTable: 500,
    });

    expect(updated.moneyOnTable).toBe(500);
    expect(updated.moneyUpdatedAt).toBeInstanceOf(Date);
    expect(updated.status).toBe(created.status);
    expect(updated.seats).toHaveLength(created.maxSeats);
  });

  it('updateState change le statut sans horodater moneyUpdatedAt', async () => {
    const created = await service.create(casinoId, makeDto('state-status'));

    const updated = await service.updateState(casinoId, created.id, {
      status: TableStatus.PAUSED,
    });

    expect(updated.status).toBe(TableStatus.PAUSED);
    expect(updated.moneyOnTable).toBe(created.moneyOnTable);
    expect(updated.moneyUpdatedAt).toBeNull();
  });

  it('updateState lève NotFoundException pour une table d’un autre casino', async () => {
    const created = await service.create(casinoId, makeDto('state-other'));
    const otherCasino = await prisma.casino.create({
      data: {
        name: `${prefix}-state-casino`,
        city: 'Test',
        address: `${prefix}-state-address`,
      },
    });

    try {
      await expect(
        service.updateState(otherCasino.id, created.id, {
          status: TableStatus.PAUSED,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const row = await prisma.pokerTable.findUnique({
        where: { id: created.id },
      });
      expect(row?.status).toBe(TableStatus.OPEN);
    } finally {
      await prisma.casino.delete({ where: { id: otherCasino.id } });
    }
  });

  it('deleteTable fait un soft delete : la ligne reste en base avec un deletedAt', async () => {
    const created = await service.create(casinoId, makeDto('soft'));

    await service.deleteTable(casinoId, created.id);

    await expect(service.findById(casinoId, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const row = await prisma.pokerTable.findUnique({
      where: { id: created.id },
    });
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it('deleteTable lève NotFoundException pour une table déjà supprimée', async () => {
    const created = await service.create(casinoId, makeDto('twice'));
    await service.deleteTable(casinoId, created.id);

    await expect(
      service.deleteTable(casinoId, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deleteTable lève NotFoundException pour une table d'un autre casino, sans la supprimer", async () => {
    const created = await service.create(casinoId, makeDto('other-casino'));
    const otherCasino = await prisma.casino.create({
      data: {
        name: `${prefix}-other-casino`,
        city: 'Test',
        address: `${prefix}-other-address`,
      },
    });

    try {
      await expect(
        service.deleteTable(otherCasino.id, created.id),
      ).rejects.toBeInstanceOf(NotFoundException);

      const row = await prisma.pokerTable.findUnique({
        where: { id: created.id },
      });
      expect(row?.deletedAt).toBeNull();
    } finally {
      await prisma.casino.delete({ where: { id: otherCasino.id } });
    }
  });

  it('deleteTable lève NotFoundException pour un id inconnu', async () => {
    await expect(
      service.deleteTable(casinoId, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
