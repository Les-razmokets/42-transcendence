import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CasinosService } from '../casinos.service'; // adjust paths / names to your project
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/*
 * Unit spec for the casino CRUD service, with a stubbed Prisma (no database).
 * The e2e spec proves the real queries (deleted casinos hidden, real ordering); here we check the
 * logic around them and the SHAPE of each query we send.
 */

const MAX_PAGE_SIZE = 20;
const PUBLIC_SELECT = { id: true, name: true, city: true, address: true };

type Stub = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('stubbed prisma error', {
    code,
    clientVersion: 'test',
  });

const definedOnly = (obj: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  );

describe('CasinosService', () => {
  let service: CasinosService;
  let create: Stub;
  let findMany: Stub;
  let findFirst: Stub;
  let update: Stub;

  const row = { id: 'c1', name: 'Casino', city: 'Lausanne', address: 'Rue 1' };

  beforeEach(async () => {
    create = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(row);
    findMany = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([row]);
    findFirst = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(row);
    update = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(row);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CasinosService,
        {
          provide: PrismaService,
          useValue: { casino: { create, findMany, findFirst, update } },
        },
      ],
    }).compile();

    service = moduleRef.get(CasinosService);
  });

  const capture = async (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (e: unknown) => e,
    );

  // ------------------------------------------------------------------ create
  describe('createCasino', () => {
    const dto = {
      name: 'Casino',
      city: 'Lausanne',
      address: 'Rue 1',
    } as Parameters<CasinosService['createCasino']>[0];

    it('creates with exactly name, city and address', async () => {
      await service.createCasino(dto);

      expect(create).toHaveBeenCalledTimes(1);
      const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(Object.keys(arg.data).sort()).toEqual(['address', 'city', 'name']);
      expect(arg.data).toEqual({
        name: 'Casino',
        city: 'Lausanne',
        address: 'Rue 1',
      });
    });

    it('does not let extra fields of a dirty dto reach the database (id, deletedAt, timestamps)', async () => {
      const dirty = {
        ...dto,
        id: 'chosen-by-client',
        deletedAt: new Date(),
        createdAt: new Date(),
      } as typeof dto;

      await service.createCasino(dirty);

      const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(arg.data).not.toHaveProperty('id');
      expect(arg.data).not.toHaveProperty('deletedAt');
      expect(arg.data).not.toHaveProperty('createdAt');
    });

    it('returns what the database returned', async () => {
      await expect(service.createCasino(dto)).resolves.toBe(row);
    });

    it('lets a database error through (no disguise)', async () => {
      const boom = new Error('db down');
      create.mockRejectedValue(boom);

      await expect(service.createCasino(dto)).rejects.toBe(boom);
    });
  });

  // -------------------------------------------------------------------- list
  describe('listActiveCasinos', () => {
    it('only asks for active casinos (deletedAt: null)', async () => {
      await service.listActiveCasinos();

      const arg = findMany.mock.calls[0][0] as { where: unknown };
      expect(arg.where).toEqual({ deletedAt: null });
    });

    it('orders by name, then by id (a stable, deterministic order)', async () => {
      await service.listActiveCasinos();

      const arg = findMany.mock.calls[0][0] as { orderBy: unknown };
      expect(arg.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    });

    it('selects only the public fields', async () => {
      await service.listActiveCasinos();

      const arg = findMany.mock.calls[0][0] as { select: unknown };
      expect(arg.select).toEqual(PUBLIC_SELECT);
    });

    it('always limits the number of rows (never an unbounded list)', async () => {
      await service.listActiveCasinos();

      const arg = findMany.mock.calls[0][0] as { take: number };
      expect(typeof arg.take).toBe('number');
      expect(arg.take).toBeGreaterThan(0);
      expect(arg.take).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    });

    it('cuts a requested size above the maximum down to the maximum', async () => {
      await (service.listActiveCasinos as (limit: number) => Promise<unknown>)(
        MAX_PAGE_SIZE * 100,
      );

      const arg = findMany.mock.calls[0][0] as { take: number };
      expect(arg.take).toBe(MAX_PAGE_SIZE);
    });

    it('returns the rows as they come (the database already sorted them)', async () => {
      findMany.mockResolvedValue([
        { ...row, id: 'b' },
        { ...row, id: 'a' },
      ]);

      const out = (await service.listActiveCasinos()) as Array<{ id: string }>;

      expect(out.map((c) => c.id)).toEqual(['b', 'a']); // no second, in-memory sort
    });
  });

  // -------------------------------------------------------------------- find
  describe('findActiveCasino', () => {
    it('looks the casino up by id, active only', async () => {
      await service.findActiveCasino('c1');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1', deletedAt: null } }),
      );
    });

    it('returns the row when it exists', async () => {
      await expect(service.findActiveCasino('c1')).resolves.toBe(row);
    });

    it('missing or deleted: a bare 404', async () => {
      findFirst.mockResolvedValue(null);

      const error = await capture(service.findActiveCasino('nope'));

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual(
        new NotFoundException().getResponse(),
      );
    });

    it('lets a database error through (not turned into a 404)', async () => {
      const boom = new Error('db down');
      findFirst.mockRejectedValue(boom);

      await expect(service.findActiveCasino('c1')).rejects.toBe(boom);
    });
  });

  // ------------------------------------------------------------------ update
  describe('updateCasino', () => {
    const dto = (fields: Record<string, unknown>) =>
      fields as Parameters<CasinosService['updateCasino']>[1];

    it('targets the ACTIVE casino with this id (a deleted casino cannot be modified)', async () => {
      await service.updateCasino('c1', dto({ city: 'Geneva' }));

      const arg = update.mock.calls[0][0] as { where: unknown };
      expect(arg.where).toEqual({ id: 'c1', deletedAt: null });
    });

    it('changes only the fields that were sent', async () => {
      await service.updateCasino('c1', dto({ city: 'Geneva' }));

      const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(definedOnly(arg.data)).toEqual({ city: 'Geneva' });
    });

    it('can change all three fields', async () => {
      await service.updateCasino(
        'c1',
        dto({ name: 'N', city: 'C', address: 'A' }),
      );

      const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(definedOnly(arg.data)).toEqual({
        name: 'N',
        city: 'C',
        address: 'A',
      });
    });

    it('never lets extra fields through: no id change, no "undelete", no timestamps', async () => {
      await service.updateCasino(
        'c1',
        dto({
          city: 'Geneva',
          id: 'other',
          deletedAt: null,
          createdAt: new Date(),
        }),
      );

      const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
      const keys = Object.keys(definedOnly(arg.data));

      expect(keys.every((k) => ['name', 'city', 'address'].includes(k))).toBe(
        true,
      );
      expect(arg.data).not.toHaveProperty('id');
      expect(arg.data).not.toHaveProperty('deletedAt');
    });

    it('selects only the public fields in the answer', async () => {
      await service.updateCasino('c1', dto({ city: 'Geneva' }));

      const arg = update.mock.calls[0][0] as { select: unknown };
      expect(arg.select).toEqual(PUBLIC_SELECT);
    });

    it('returns the updated row', async () => {
      await expect(
        service.updateCasino('c1', dto({ city: 'Geneva' })),
      ).resolves.toBe(row);
    });

    it('P2025 (no active casino matched): a bare 404', async () => {
      update.mockRejectedValue(prismaError('P2025'));

      const error = await capture(
        service.updateCasino('c1', dto({ city: 'Geneva' })),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual(
        new NotFoundException().getResponse(),
      );
    });

    it('the update 404 is identical to the "find" 404 (nothing tells the two cases apart)', async () => {
      findFirst.mockResolvedValue(null);
      update.mockRejectedValue(prismaError('P2025'));

      const fromFind = await capture(service.findActiveCasino('c1'));
      const fromUpdate = await capture(
        service.updateCasino('c1', dto({ city: 'Geneva' })),
      );

      expect((fromUpdate as NotFoundException).getResponse()).toEqual(
        (fromFind as NotFoundException).getResponse(),
      );
    });

    it('any other Prisma error is NOT turned into a 404', async () => {
      const other = prismaError('P2002');
      update.mockRejectedValue(other);

      await expect(
        service.updateCasino('c1', dto({ city: 'Geneva' })),
      ).rejects.toBe(other);
    });

    it('a plain database error is NOT turned into a 404', async () => {
      const boom = new Error('db down');
      update.mockRejectedValue(boom);

      await expect(
        service.updateCasino('c1', dto({ city: 'Geneva' })),
      ).rejects.toBe(boom);
    });
  });
});
