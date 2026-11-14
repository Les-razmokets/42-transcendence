import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PokerVariant } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTableDto } from '../dto/create-table.dto';
import { TablesService } from '../tables.service';

// Test d'intégration : utilise la vraie base de dev (DATABASE_URL), jamais la prod.
describe('TablesService (intégration)', () => {
  let moduleRef: TestingModule;
  let service: TablesService;
  let prisma: PrismaService;
  let casinoId: string;

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
  });

  afterAll(async () => {
    // onDelete: Restrict → sièges, puis tables, puis casino
    await prisma.seat.deleteMany({ where: { table: { casinoId } } });
    await prisma.pokerTable.deleteMany({ where: { casinoId } });
    await prisma.casino.delete({ where: { id: casinoId } });
    await moduleRef.close();
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

  it('updateTable ne modifie que les champs envoyés et renvoie les sièges', async () => {
    const created = await service.create(
      casinoId,
      makeDto('update', { maxSeats: 3 }),
    );

    const updated = await service.updateTable(casinoId, created.id, {
      bigBlind: 4,
    });

    expect(updated.bigBlind).toBe(4);
    expect(updated.smallBlind).toBe(created.smallBlind);
    expect(updated.variant).toBe(created.variant);
    expect(updated.moneyUpdatedAt).toBeNull();
    expect(updated.seats.map((seat) => seat.seatNumber)).toEqual([1, 2, 3]);
  });

  it('updateTable horodate moneyUpdatedAt quand moneyOnTable change', async () => {
    const created = await service.create(casinoId, makeDto('money'));

    const updated = await service.updateTable(casinoId, created.id, {
      moneyOnTable: 500,
    });

    expect(updated.moneyOnTable).toBe(500);
    expect(updated.moneyUpdatedAt).toBeInstanceOf(Date);
  });

  it('updateTable lève NotFoundException pour une table supprimée', async () => {
    const created = await service.create(casinoId, makeDto('update-deleted'));
    await service.deleteTable(casinoId, created.id);

    await expect(
      service.updateTable(casinoId, created.id, { smallBlind: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
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
