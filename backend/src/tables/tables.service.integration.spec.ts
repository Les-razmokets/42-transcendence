import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PokerVariant } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { TablesService } from './tables.service';

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
    casinoId,
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
    const created = await service.create(makeDto('create', { maxSeats: 4 }));

    expect(created.id).toBeDefined();
    expect(created.casinoId).toBe(casinoId);
    expect(created.seats.map((seat) => seat.seatNumber)).toEqual([1, 2, 3, 4]);
    expect(created.seats.every((seat) => seat.status === 'FREE')).toBe(true);
  });

  it('rejette un casinoId inexistant avec un BadRequestException', async () => {
    await expect(
      service.create(
        makeDto('nocasino', {
          casinoId: '00000000-0000-4000-8000-000000000000',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette des blindes invalides sans rien écrire en base', async () => {
    await expect(
      service.create(makeDto('blinds', { smallBlind: 10, bigBlind: 5 })),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      prisma.pokerTable.count({ where: { name: `${prefix}-blinds` } }),
    ).resolves.toBe(0);
  });

  it('findById renvoie la table sans ses sièges supprimés', async () => {
    const created = await service.create(makeDto('find', { maxSeats: 3 }));
    await prisma.seat.update({
      where: { tableId_seatNumber: { tableId: created.id, seatNumber: 2 } },
      data: { deletedAt: new Date() },
    });

    const found = await service.findById(created.id);

    expect(found.id).toBe(created.id);
    expect(found.seats.map((seat) => seat.seatNumber)).toEqual([1, 3]);
  });

  it('findById lève NotFoundException pour une table supprimée', async () => {
    const created = await service.create(makeDto('deleted'));
    await prisma.pokerTable.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });

    await expect(service.findById(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findById lève NotFoundException pour un id inconnu', async () => {
    await expect(
      service.findById('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findAll renvoie les tables non supprimées triées par nom', async () => {
    await service.create(makeDto('list-b'));
    await service.create(makeDto('list-a'));

    const names = (await service.findAll())
      .map((table) => table.name)
      .filter((name) => name.startsWith(`${prefix}-list`));

    expect(names).toEqual([`${prefix}-list-a`, `${prefix}-list-b`]);
    await expect(service.findAll()).resolves.not.toContainEqual(
      expect.objectContaining({ name: `${prefix}-deleted` }),
    );
  });
});
