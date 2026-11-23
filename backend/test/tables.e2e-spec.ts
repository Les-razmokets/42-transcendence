import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  CasinoRole,
  PokerVariant,
  TableStatus,
} from '../src/generated/prisma/enums';

// /api/casinos/:casinoId/tables through HTTP: routing (PUT, PATCH /state),
// the global ValidationPipe (whitelist + forbidNonWhitelisted), the casino
// roles (OWNER for the config, FLOOR and above for the state) and the
// response serialization (tableSchema), which the service tests do not cover.
describe('/api/casinos/:casinoId/tables (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let casinoId: string;
  let otherCasinoId: string;
  let tableId: string;
  let otherTableId: string;

  // Unique prefix per run: we only clean up our own rows.
  // Other e2e suites wipe ALL users and casinos, so nothing may survive this file.
  const prefix = `tb${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9-Battery!';

  const server = () => app.getHttpServer();
  const email = (name: string) => `${prefix}-${name}@test.local`;
  const tablesUrl = (casino: string) => `/api/casinos/${casino}/tables`;

  const register = async (name: string) => {
    const res = await request(server())
      .post('/api/auth/register')
      .send({
        pseudo: `${prefix}-${name}`,
        email: email(name),
        firstName: 'Test',
        lastName: name,
        birthDate: '1990-01-01',
        password: PASSWORD,
      })
      .expect(201);
    return res.body.id as string;
  };

  // a logged-in "browser": the agent stores the cookie and sends it back
  const loggedInAgent = async (name: string) => {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/login')
      .send({ email: email(name), password: PASSWORD })
      .expect(200);
    return agent;
  };

  const newTable = async (casino: string, name: string) => {
    const table = await prisma.pokerTable.create({
      data: {
        casinoId: casino,
        name: `${prefix}-${name}`,
        variant: PokerVariant.TEXAS_HOLDEM,
        smallBlind: 1,
        bigBlind: 2,
        maxSeats: 3,
        seats: {
          createMany: {
            data: [1, 2, 3].map((seatNumber) => ({ seatNumber })),
          },
        },
      },
    });
    return table.id;
  };

  const readTable = (id: string) =>
    prisma.pokerTable.findUniqueOrThrow({ where: { id } });

  // full PUT body, same maxSeats as newTable (changing it is not handled yet)
  const putBody = (overrides: Record<string, unknown> = {}) => ({
    name: `${prefix}-renamed`,
    variant: PokerVariant.OMAHA,
    smallBlind: 5,
    bigBlind: 10,
    maxSeats: 3,
    ...overrides,
  });

  let owner: Awaited<ReturnType<typeof loggedInAgent>>;
  let floor: Awaited<ReturnType<typeof loggedInAgent>>;
  let plain: Awaited<ReturnType<typeof loggedInAgent>>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    casinoId = (
      await prisma.casino.create({
        data: {
          name: `${prefix}-casino`,
          city: 'Test',
          address: `${prefix}-address`,
        },
      })
    ).id;
    otherCasinoId = (
      await prisma.casino.create({
        data: {
          name: `${prefix}-other-casino`,
          city: 'Test',
          address: `${prefix}-other-address`,
        },
      })
    ).id;

    const ownerId = await register('owner');
    const floorId = await register('floor');
    await register('plain'); // logged in, but no membership in the casino
    await prisma.membership.createMany({
      data: [
        { userId: ownerId, casinoId, role: CasinoRole.OWNER },
        { userId: floorId, casinoId, role: CasinoRole.FLOOR },
      ],
    });

    owner = await loggedInAgent('owner');
    floor = await loggedInAgent('floor');
    plain = await loggedInAgent('plain');
  });

  // a fresh table for each test: no test depends on what another one changed
  beforeEach(async () => {
    tableId = await newTable(casinoId, `table-${Date.now()}`);
    otherTableId = await newTable(otherCasinoId, `other-${Date.now()}`);
  });

  afterAll(async () => {
    const casinoIds = [casinoId, otherCasinoId];
    await prisma.seat.deleteMany({
      where: { table: { casinoId: { in: casinoIds } } },
    });
    await prisma.pokerTable.deleteMany({
      where: { casinoId: { in: casinoIds } },
    });
    await prisma.membership.deleteMany({
      where: { casinoId: { in: casinoIds } },
    });
    await prisma.casino.deleteMany({ where: { id: { in: casinoIds } } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: `${prefix}-` } },
    });
    await app.close();
  });

  describe('PUT /:id (OWNER): replaces the table config', () => {
    it('OWNER -> 200, every field replaced, seats kept', async () => {
      const res = await owner
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send(putBody())
        .expect(200);

      expect(res.body).toMatchObject({
        id: tableId,
        name: `${prefix}-renamed`,
        variant: PokerVariant.OMAHA,
        smallBlind: 5,
        bigBlind: 10,
        maxSeats: 3,
      });
      expect(
        res.body.seats.map((s: { seatNumber: number }) => s.seatNumber),
      ).toEqual([1, 2, 3]);
    });

    it('incomplete body -> 400, nothing changed (PUT is not a PATCH)', async () => {
      await owner
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send({ bigBlind: 4 })
        .expect(400);

      expect((await readTable(tableId)).bigBlind).toBe(2);
    });

    it('maxSeats raised -> 200, the missing seats are created', async () => {
      const res = await owner
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send(putBody({ maxSeats: 6 }))
        .expect(200);

      expect(res.body.maxSeats).toBe(6);
      expect(
        res.body.seats.map((s: { seatNumber: number }) => s.seatNumber),
      ).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('maxSeats lowered -> 200, the last seats are removed', async () => {
      const res = await owner
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send(putBody({ maxSeats: 2 }))
        .expect(200);

      expect(res.body.maxSeats).toBe(2);
      expect(
        res.body.seats.map((s: { seatNumber: number }) => s.seatNumber),
      ).toEqual([1, 2]);
    });

    it('FLOOR -> 403, nothing changed', async () => {
      await floor
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send(putBody())
        .expect(403);

      expect((await readTable(tableId)).variant).toBe(
        PokerVariant.TEXAS_HOLDEM,
      );
    });

    it('no membership -> 404 (the casino does not exist for them)', async () => {
      await plain
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send(putBody())
        .expect(404);
    });

    it('not logged in -> 401', async () => {
      await request(server())
        .put(`${tablesUrl(casinoId)}/${tableId}`)
        .send(putBody())
        .expect(401);
    });

    it('table of another casino -> 404, that table is untouched', async () => {
      await owner
        .put(`${tablesUrl(casinoId)}/${otherTableId}`)
        .send(putBody())
        .expect(404);

      expect((await readTable(otherTableId)).variant).toBe(
        PokerVariant.TEXAS_HOLDEM,
      );
    });

    it('the old PATCH /:id route is gone -> 404', async () => {
      await owner
        .patch(`${tablesUrl(casinoId)}/${tableId}`)
        .send({ bigBlind: 4 })
        .expect(404);

      expect((await readTable(tableId)).bigBlind).toBe(2);
    });
  });

  describe('PATCH /:id/state (FLOOR and above): status and money', () => {
    it('FLOOR pauses the table -> 200, moneyUpdatedAt untouched', async () => {
      const res = await floor
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ status: TableStatus.PAUSED })
        .expect(200);

      expect(res.body.status).toBe(TableStatus.PAUSED);
      expect(res.body.seats).toHaveLength(3);
      expect((await readTable(tableId)).moneyUpdatedAt).toBeNull();
    });

    it('OWNER can do it too (role hierarchy), money 0 is dated', async () => {
      const res = await owner
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ moneyOnTable: 0 })
        .expect(200);

      expect(res.body.moneyOnTable).toBe(0);
      expect((await readTable(tableId)).moneyUpdatedAt).toBeInstanceOf(Date);
    });

    it('a config field -> 400 (forbidNonWhitelisted), name unchanged', async () => {
      await floor
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ name: 'hacked' })
        .expect(400);

      expect((await readTable(tableId)).name).not.toBe('hacked');
    });

    it('a valid field next to a config field -> 400, nothing applied', async () => {
      await floor
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ status: TableStatus.PAUSED, smallBlind: 50 })
        .expect(400);

      const row = await readTable(tableId);
      expect(row.status).toBe(TableStatus.OPEN);
      expect(row.smallBlind).toBe(1);
    });

    it('empty body -> 400', async () => {
      await floor
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({})
        .expect(400);
    });

    it('negative money -> 400', async () => {
      await floor
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ moneyOnTable: -1 })
        .expect(400);
    });

    it('no membership -> 404', async () => {
      await plain
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ status: TableStatus.PAUSED })
        .expect(404);
    });

    it('not logged in -> 401', async () => {
      await request(server())
        .patch(`${tablesUrl(casinoId)}/${tableId}/state`)
        .send({ status: TableStatus.PAUSED })
        .expect(401);
    });

    it('table of another casino -> 404, that table is untouched', async () => {
      await floor
        .patch(`${tablesUrl(casinoId)}/${otherTableId}/state`)
        .send({ status: TableStatus.PAUSED })
        .expect(404);

      expect((await readTable(otherTableId)).status).toBe(TableStatus.OPEN);
    });
  });
});
