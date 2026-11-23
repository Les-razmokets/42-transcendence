import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
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
} from '../src/generated/prisma/enums';

// GET /api/casinos/:casinoId/reservations?day= through HTTP: casino roles
// (FLOOR and above), query validation (FloorDayQueryDto) and response
// serialization (floorReservationSchema), which the service tests do not cover.
describe('/api/casinos/:casinoId/reservations (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let casinoId: string;
  let tableId: string;
  let reservationId: string;

  // Unique prefix per run: we only clean up our own rows.
  // Other e2e suites wipe ALL users and casinos, so nothing may survive this file.
  const prefix = `cr${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9-Battery!';
  // a fixed casino day far away, winter time (Paris = UTC+1)
  const DAY = '2030-03-12';

  const server = () => app.getHttpServer();
  const email = (name: string) => `${prefix}-${name}@test.local`;
  const floorUrl = (casino: string) => `/api/casinos/${casino}/reservations`;

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
    const table = await prisma.pokerTable.create({
      data: {
        casinoId,
        name: `${prefix}-table`,
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
      include: { seats: true },
    });
    tableId = table.id;

    const ownerId = await register('owner');
    const floorId = await register('floor');
    const playerId = await register('player');
    await register('plain'); // logged in, but no membership in the casino
    await prisma.membership.createMany({
      data: [
        { userId: ownerId, casinoId, role: CasinoRole.OWNER },
        { userId: floorId, casinoId, role: CasinoRole.FLOOR },
      ],
    });

    const seat2 = table.seats.find((seat) => seat.seatNumber === 2)!;
    reservationId = (
      await prisma.reservation.create({
        data: {
          userId: playerId,
          seatId: seat2.id,
          status: ReservationStatus.CONFIRMED,
          arrivalAt: new Date(`${DAY}T20:00+01:00`),
        },
      })
    ).id;

    owner = await loggedInAgent('owner');
    floor = await loggedInAgent('floor');
    plain = await loggedInAgent('plain');
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({
      where: { seat: { table: { casinoId } } },
    });
    await prisma.seat.deleteMany({ where: { table: { casinoId } } });
    await prisma.pokerTable.deleteMany({ where: { casinoId } });
    await prisma.membership.deleteMany({ where: { casinoId } });
    await prisma.casino.delete({ where: { id: casinoId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: `${prefix}-` } },
    });
    await app.close();
  });

  it('FLOOR -> 200, the day list with player pseudo, seat and table', async () => {
    const res = await floor
      .get(floorUrl(casinoId))
      .query({ day: DAY })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: reservationId,
      status: ReservationStatus.CONFIRMED,
      user: { pseudo: `${prefix}-player` },
      seat: { seatNumber: 2, table: { id: tableId, name: `${prefix}-table` } },
    });
  });

  it('exposes only the pseudo of the player (no email, no names)', async () => {
    const res = await floor
      .get(floorUrl(casinoId))
      .query({ day: DAY })
      .expect(200);

    expect(Object.keys(res.body[0].user)).toEqual(['pseudo']);
    expect(Object.keys(res.body[0].seat).sort()).toEqual([
      'seatNumber',
      'table',
    ]);
    expect(Object.keys(res.body[0].seat.table).sort()).toEqual(['id', 'name']);
  });

  it('OWNER can do it too (role hierarchy)', async () => {
    await owner.get(floorUrl(casinoId)).query({ day: DAY }).expect(200);
  });

  it('another day -> 200, empty list', async () => {
    const res = await floor
      .get(floorUrl(casinoId))
      .query({ day: '2030-03-14' })
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('no day -> 200 (current casino day), an array', async () => {
    const res = await floor.get(floorUrl(casinoId)).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it.each(['abc', '2030-13-01', '2030-03-32', '12-03-2030'])(
    'invalid day %s -> 400',
    async (day) => {
      await floor.get(floorUrl(casinoId)).query({ day }).expect(400);
    },
  );

  it('unknown query param -> 400 (forbidNonWhitelisted)', async () => {
    await floor
      .get(floorUrl(casinoId))
      .query({ day: DAY, status: 'CONFIRMED' })
      .expect(400);
  });

  it('no membership -> 404 (the casino does not exist for them)', async () => {
    await plain.get(floorUrl(casinoId)).query({ day: DAY }).expect(404);
  });

  it('not logged in -> 401', async () => {
    await request(server())
      .get(floorUrl(casinoId))
      .query({ day: DAY })
      .expect(401);
  });

  it('the player route GET /api/reservations is untouched (own reservations)', async () => {
    const player = await loggedInAgent('player');
    const res = await player.get('/api/reservations').expect(200);

    expect(res.body.map((r: { id: string }) => r.id)).toEqual([reservationId]);
  });
});
