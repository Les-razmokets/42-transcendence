import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PokerVariant } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { TablesService } from './tables.service';

// Test unitaire : PrismaService est remplacé par un mock, aucune base n'est touchée.
describe('TablesService', () => {
  let service: TablesService;
  const prismaMock = {
    pokerTable: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const makeDto = (
    overrides: Partial<CreateTableDto> = {},
  ): CreateTableDto => ({
    casinoId: 'f79900e4-ed42-4236-8e93-3bf2ab820f01',
    name: 'Table test',
    variant: PokerVariant.TEXAS_HOLDEM,
    smallBlind: 1,
    bigBlind: 2,
    maxSeats: 6,
    ...overrides,
  });

  const makePrismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('prisma error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(TablesService);
  });

  describe('create', () => {
    it('renvoie la table créée par Prisma avec maxSeats sièges numérotés à partir de 1', async () => {
      const fakeTable = { id: 'table-1' };
      prismaMock.pokerTable.create.mockResolvedValue(fakeTable);

      const created = await service.create(makeDto({ maxSeats: 3 }));

      expect(created).toBe(fakeTable);
      expect(prismaMock.pokerTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Table test',
            seats: {
              createMany: {
                data: [{ seatNumber: 1 }, { seatNumber: 2 }, { seatNumber: 3 }],
              },
            },
          }),
        }),
      );
    });

    it('rejette bigBlind < smallBlind sans appeler Prisma', async () => {
      await expect(
        service.create(makeDto({ smallBlind: 10, bigBlind: 5 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.pokerTable.create).not.toHaveBeenCalled();
    });

    it('accepte bigBlind === smallBlind', async () => {
      prismaMock.pokerTable.create.mockResolvedValue({ id: 'table-1' });

      await expect(
        service.create(makeDto({ smallBlind: 5, bigBlind: 5 })),
      ).resolves.toBeDefined();
    });

    it('rejette OMAHA avec plus de 8 sièges sans appeler Prisma', async () => {
      await expect(
        service.create(makeDto({ variant: PokerVariant.OMAHA, maxSeats: 9 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.pokerTable.create).not.toHaveBeenCalled();
    });

    it('accepte OMAHA avec 8 sièges', async () => {
      prismaMock.pokerTable.create.mockResolvedValue({ id: 'table-1' });

      await expect(
        service.create(makeDto({ variant: PokerVariant.OMAHA, maxSeats: 8 })),
      ).resolves.toBeDefined();
    });

    it('accepte TEXAS_HOLDEM avec 10 sièges', async () => {
      prismaMock.pokerTable.create.mockResolvedValue({ id: 'table-1' });

      await expect(
        service.create(makeDto({ maxSeats: 10 })),
      ).resolves.toBeDefined();
    });

    it('convertit une erreur Prisma P2003 (casinoId inconnu) en BadRequestException', async () => {
      prismaMock.pokerTable.create.mockRejectedValue(makePrismaError('P2003'));

      await expect(service.create(makeDto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('laisse passer telles quelles les autres erreurs Prisma', async () => {
      const error = makePrismaError('P2002');
      prismaMock.pokerTable.create.mockRejectedValue(error);

      await expect(service.create(makeDto())).rejects.toBe(error);
    });
  });

  describe('findById', () => {
    it('renvoie la table en filtrant les tables supprimées', async () => {
      const fakeTable = { id: 'table-1' };
      prismaMock.pokerTable.findUnique.mockResolvedValue(fakeTable);

      await expect(service.findById('table-1')).resolves.toBe(fakeTable);
      expect(prismaMock.pokerTable.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'table-1', deletedAt: null },
        }),
      );
    });

    it('lève NotFoundException si Prisma ne trouve rien', async () => {
      prismaMock.pokerTable.findUnique.mockResolvedValue(null);

      await expect(service.findById('inconnue')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('renvoie les tables non supprimées triées par nom', async () => {
      const fakeTables = [{ id: 'table-1' }, { id: 'table-2' }];
      prismaMock.pokerTable.findMany.mockResolvedValue(fakeTables);

      await expect(service.findAll()).resolves.toBe(fakeTables);
      expect(prismaMock.pokerTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  describe('updateTable', () => {
    // Table telle que renvoyée par findById avant la mise à jour
    const existingTable = {
      id: 'table-1',
      variant: PokerVariant.TEXAS_HOLDEM,
      smallBlind: 5,
      bigBlind: 10,
      maxSeats: 6,
    };

    beforeEach(() => {
      prismaMock.pokerTable.findUnique.mockResolvedValue(existingTable);
    });

    it('lève NotFoundException sans appeler update si la table n’existe pas', async () => {
      prismaMock.pokerTable.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTable('inconnue', { smallBlind: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.pokerTable.update).not.toHaveBeenCalled();
    });

    it('rejette une bigBlind inférieure à la smallBlind déjà en base', async () => {
      await expect(
        service.updateTable('table-1', { bigBlind: 2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.pokerTable.update).not.toHaveBeenCalled();
    });

    it('rejette le passage en OMAHA d’une table de plus de 8 sièges', async () => {
      prismaMock.pokerTable.findUnique.mockResolvedValue({
        ...existingTable,
        maxSeats: 9,
      });

      await expect(
        service.updateTable('table-1', { variant: PokerVariant.OMAHA }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.pokerTable.update).not.toHaveBeenCalled();
    });

    it('renvoie la table mise à jour sans toucher moneyUpdatedAt si moneyOnTable est absent', async () => {
      const updated = { id: 'table-1' };
      prismaMock.pokerTable.update.mockResolvedValue(updated);

      await expect(
        service.updateTable('table-1', { smallBlind: 2, bigBlind: 4 }),
      ).resolves.toBe(updated);
      expect(prismaMock.pokerTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'table-1' },
          data: { smallBlind: 2, bigBlind: 4 },
        }),
      );
    });

    it('met à jour moneyUpdatedAt quand moneyOnTable est fourni, même à 0', async () => {
      prismaMock.pokerTable.update.mockResolvedValue({ id: 'table-1' });

      await service.updateTable('table-1', { moneyOnTable: 0 });

      expect(prismaMock.pokerTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { moneyOnTable: 0, moneyUpdatedAt: expect.any(Date) },
        }),
      );
    });
  });

  describe('deleteTable', () => {
    it('marque la table comme supprimée si elle ne l’est pas déjà', async () => {
      prismaMock.pokerTable.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.deleteTable('table-1')).resolves.toBeUndefined();
      expect(prismaMock.pokerTable.updateMany).toHaveBeenCalledWith({
        where: { id: 'table-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('lève NotFoundException si aucune table n’a été modifiée', async () => {
      prismaMock.pokerTable.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteTable('inconnue')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
