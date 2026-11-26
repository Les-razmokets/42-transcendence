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
  ReservationStatus,
  SeatStatus,
  TableStatus,
} from '../src/generated/prisma/enums';

// /api/casinos/:casinoId/tables through HTTP: routing (GET, POST, PUT, DELETE, PATCH /state and /seats),
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
  const readSeat = (table: string, seatNumber: number) =>
    prisma.seat.findUniqueOrThrow({
      where: { tableId_seatNumber: { tableId: table, seatNumber } },
    });

  // full PUT body, same maxSeats as newTable
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
    await prisma.reservation.deleteMany({
      where: { seat: { table: { casinoId: { in: casinoIds } } } },
    });
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

  describe('PATCH /:id/seats/:seatNumber (FLOOR and above): walk-in', () => {
    const seatUrl = (
      casino: string,
      table: string,
      seatNumber: number | string,
    ) => `${tablesUrl(casino)}/${table}/seats/${seatNumber}`;

    it('FLOOR seats a walk-in -> 200, returns the whole table', async () => {
      const res = await floor
        .patch(seatUrl(casinoId, tableId, 2))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(200);

      expect(res.body.id).toBe(tableId);
      expect(res.body.seats).toHaveLength(3);
      expect(
        res.body.seats.find((s: { seatNumber: number }) => s.seatNumber === 2)
          .status,
      ).toBe(SeatStatus.OCCUPIED);
      expect((await readSeat(tableId, 2)).status).toBe(SeatStatus.OCCUPIED);
    });

    it('OWNER can do it too (role hierarchy), and free the seat again', async () => {
      await owner
        .patch(seatUrl(casinoId, tableId, 1))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(200);
      await owner
        .patch(seatUrl(casinoId, tableId, 1))
        .send({ status: SeatStatus.FREE })
        .expect(200);

      expect((await readSeat(tableId, 1)).status).toBe(SeatStatus.FREE);
    });

    it('unknown status -> 400', async () => {
      await floor
        .patch(seatUrl(casinoId, tableId, 1))
        .send({ status: 'RESERVED' })
        .expect(400);
    });

    it('extra field -> 400 (forbidNonWhitelisted), seat unchanged', async () => {
      await floor
        .patch(seatUrl(casinoId, tableId, 1))
        .send({ status: SeatStatus.OCCUPIED, seatNumber: 3 })
        .expect(400);

      expect((await readSeat(tableId, 1)).status).toBe(SeatStatus.FREE);
    });

    it('seatNumber that is not an integer -> 400', async () => {
      await floor
        .patch(seatUrl(casinoId, tableId, 'abc'))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(400);
    });

    it('seat number outside the table -> 404', async () => {
      await floor
        .patch(seatUrl(casinoId, tableId, 4))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(404);
    });

    it('no membership -> 404', async () => {
      await plain
        .patch(seatUrl(casinoId, tableId, 1))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(404);
    });

    it('not logged in -> 401', async () => {
      await request(server())
        .patch(seatUrl(casinoId, tableId, 1))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(401);
    });

    it('table of another casino -> 404, that seat is untouched', async () => {
      await floor
        .patch(seatUrl(casinoId, otherTableId, 1))
        .send({ status: SeatStatus.OCCUPIED })
        .expect(404);

      expect((await readSeat(otherTableId, 1)).status).toBe(SeatStatus.FREE);
    });
  });

  describe('GET / and GET /:id (logged in, no casino role)', () => {
    it('list -> 200, only the tables of this casino, with their seats', async () => {
      const res = await plain.get(tablesUrl(casinoId)).expect(200);

      const ids = res.body.map((table: { id: string }) => table.id);
      expect(ids).toContain(tableId);
      expect(ids).not.toContain(otherTableId);
      const table = res.body.find((t: { id: string }) => t.id === tableId);
      expect(table.casinoId).toBe(casinoId);
      expect(table.seats).toHaveLength(3);
    });

    it('one table -> 200, serialized by tableSchema (no dates)', async () => {
      const res = await plain
        .get(`${tablesUrl(casinoId)}/${tableId}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: tableId, casinoId, maxSeats: 3 });
      expect(res.body).not.toHaveProperty('createdAt');
      expect(res.body).not.toHaveProperty('deletedAt');
    });

    it('table of another casino -> 404', async () => {
      await plain.get(`${tablesUrl(casinoId)}/${otherTableId}`).expect(404);
    });

    it('id is not a uuid -> 400', async () => {
      await plain.get(`${tablesUrl(casinoId)}/not-a-uuid`).expect(400);
    });

    it.each(['list', 'one'])('%s: not logged in -> 401', async (what) => {
      const url =
        what === 'list'
          ? tablesUrl(casinoId)
          : `${tablesUrl(casinoId)}/${tableId}`;
      await request(server()).get(url).expect(401);
    });
  });

  describe('POST / (OWNER): creates the table and its seats', () => {
    const createBody = (overrides: Record<string, unknown> = {}) => ({
      name: `${prefix}-created-${Date.now()}`,
      variant: PokerVariant.TEXAS_HOLDEM,
      smallBlind: 1,
      bigBlind: 2,
      maxSeats: 4,
      ...overrides,
    });
    const countTables = () =>
      prisma.pokerTable.count({ where: { casinoId, deletedAt: null } });

    it('OWNER -> 201, casinoId from the URL, seats 1..maxSeats FREE', async () => {
      const res = await owner
        .post(tablesUrl(casinoId))
        .send(createBody())
        .expect(201);

      expect(res.body.casinoId).toBe(casinoId);
      expect(
        res.body.seats.map((s: { seatNumber: number }) => s.seatNumber).sort(),
      ).toEqual([1, 2, 3, 4]);
      expect(
        res.body.seats.every(
          (s: { status: string }) => s.status === SeatStatus.FREE,
        ),
      ).toBe(true);
    });

    it('casinoId in the body -> 400 (forbidNonWhitelisted), nothing created', async () => {
      const before = await countTables();

      await owner
        .post(tablesUrl(casinoId))
        .send(createBody({ casinoId: otherCasinoId }))
        .expect(400);

      expect(await countTables()).toBe(before);
    });

    it.each([
      ['bigBlind < smallBlind', { smallBlind: 10, bigBlind: 5 }],
      ['OMAHA with 9 seats', { variant: PokerVariant.OMAHA, maxSeats: 9 }],
      ['11 seats', { maxSeats: 11 }],
      ['1 seat', { maxSeats: 1 }],
    ])('%s -> 400', async (_label, overrides) => {
      await owner
        .post(tablesUrl(casinoId))
        .send(createBody(overrides))
        .expect(400);
    });

    it('FLOOR -> 403, nothing created', async () => {
      const before = await countTables();

      await floor.post(tablesUrl(casinoId)).send(createBody()).expect(403);

      expect(await countTables()).toBe(before);
    });

    it('no membership -> 404', async () => {
      await plain.post(tablesUrl(casinoId)).send(createBody()).expect(404);
    });

    it('not logged in -> 401', async () => {
      await request(server())
        .post(tablesUrl(casinoId))
        .send(createBody())
        .expect(401);
    });
  });

  describe('DELETE /:id (OWNER): soft delete', () => {
    let n = 0;
    // a new player per reservation: a player has at most one active reservation
    const book = async (seatNumber: number, arrivalAt: Date) => {
      n += 1;
      const user = await prisma.user.create({
        data: {
          email: email(`del${n}`),
          pseudo: `${prefix}-del${n}`,
          firstName: 'Test',
          lastName: `del${n}`,
          birthDate: new Date('1990-01-01'),
        },
      });
      const seat = await readSeat(tableId, seatNumber);
      await prisma.reservation.create({
        data: {
          userId: user.id,
          seatId: seat.id,
          status: ReservationStatus.CONFIRMED,
          arrivalAt,
        },
      });
    };

    it('OWNER -> 204, then the table is gone from GET', async () => {
      await owner.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(204);

      expect((await readTable(tableId)).deletedAt).not.toBeNull();
      await owner.get(`${tablesUrl(casinoId)}/${tableId}`).expect(404);
      const list = await owner.get(tablesUrl(casinoId)).expect(200);
      expect(list.body.map((t: { id: string }) => t.id)).not.toContain(tableId);
    });

    it('deleting twice -> second call 404', async () => {
      await owner.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(204);
      await owner.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(404);
    });

    it('active reservation in the coming days -> 409, table kept', async () => {
      await book(1, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

      await owner.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(409);

      expect((await readTable(tableId)).deletedAt).toBeNull();
    });

    it('active reservation of a past casino day only -> 204', async () => {
      await book(1, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

      await owner.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(204);
    });

    it('FLOOR -> 403, table kept', async () => {
      await floor.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(403);

      expect((await readTable(tableId)).deletedAt).toBeNull();
    });

    it('no membership -> 404', async () => {
      await plain.delete(`${tablesUrl(casinoId)}/${tableId}`).expect(404);
    });

    it('not logged in -> 401', async () => {
      await request(server())
        .delete(`${tablesUrl(casinoId)}/${tableId}`)
        .expect(401);
    });

    it('table of another casino -> 404, that table is kept', async () => {
      await owner.delete(`${tablesUrl(casinoId)}/${otherTableId}`).expect(404);

      expect((await readTable(otherTableId)).deletedAt).toBeNull();
    });
  });
});
