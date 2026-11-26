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
  SeatStatus,
} from '../src/generated/prisma/enums';
import { casinoDay } from '../src/reservations/casino-day';

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

  // POST /:id/seat, /:id/leave, /:id/no-show : the business rules are tested
  // in the service integration spec; here, HTTP only (roles, status codes,
  // ParseUUIDPipe and serialization with the plain reservationSchema).
  describe('transitions: seat, leave, no-show', () => {
    const url = (id: string, action: string, casino = casinoId) =>
      `${floorUrl(casino)}/${id}/${action}`;
    let seat1Id: string;
    let seat3Id: string;
    let n = 0;

    // a new player per reservation: a player has at most one active reservation
    const book = async (
      seatId: string,
      arrivalAt: Date,
      status: ReservationStatus = ReservationStatus.CONFIRMED,
    ) => {
      n += 1;
      const user = await prisma.user.create({
        data: {
          email: email(`tr${n}`),
          pseudo: `${prefix}-tr${n}`,
          firstName: 'Test',
          lastName: `tr${n}`,
          birthDate: new Date('1990-01-01'),
        },
      });
      return (
        await prisma.reservation.create({
          data: { userId: user.id, seatId, status, arrivalAt },
        })
      ).id;
    };

    beforeAll(async () => {
      const seats = await prisma.seat.findMany({ where: { tableId } });
      seat1Id = seats.find((seat) => seat.seatNumber === 1)!.id;
      seat3Id = seats.find((seat) => seat.seatNumber === 3)!.id;
    });

    afterEach(async () => {
      await prisma.reservation.deleteMany({
        where: { seatId: { in: [seat1Id, seat3Id] } },
      });
      await prisma.seat.updateMany({
        where: { id: { in: [seat1Id, seat3Id] } },
        data: { status: SeatStatus.FREE },
      });
    });

    it('FLOOR seat -> 200, plain reservation (no user, no seat), SEATED', async () => {
      const id = await book(seat1Id, new Date());

      const res = await floor.post(url(id, 'seat')).expect(200);

      expect(res.body).toMatchObject({
        id,
        status: ReservationStatus.SEATED,
        seatId: seat1Id,
      });
      expect(typeof res.body.seatedAt).toBe('string');
      expect(res.body).not.toHaveProperty('user');
      expect(res.body).not.toHaveProperty('seat');
    });

    it('seat twice -> second call 409', async () => {
      const id = await book(seat1Id, new Date());

      await floor.post(url(id, 'seat')).expect(200);
      await floor.post(url(id, 'seat')).expect(409);
    });

    it('OWNER leave -> 200, COMPLETED with leftAt, seat FREE', async () => {
      const id = await book(seat1Id, new Date(), ReservationStatus.SEATED);
      await prisma.seat.update({
        where: { id: seat1Id },
        data: { status: SeatStatus.OCCUPIED },
      });

      const res = await owner.post(url(id, 'leave')).expect(200);

      expect(res.body).toMatchObject({
        id,
        status: ReservationStatus.COMPLETED,
      });
      expect(typeof res.body.leftAt).toBe('string');
      const seat = await prisma.seat.findUniqueOrThrow({
        where: { id: seat1Id },
      });
      expect(seat.status).toBe(SeatStatus.FREE);
    });

    it('FLOOR no-show -> 200, NO_SHOW', async () => {
      const id = await book(seat3Id, new Date(Date.now() - 60 * 60 * 1000));

      const res = await floor.post(url(id, 'no-show')).expect(200);

      expect(res.body).toMatchObject({ id, status: ReservationStatus.NO_SHOW });
    });

    it('no-show before arrivalAt -> 409', async () => {
      const id = await book(seat3Id, new Date(Date.now() + 60 * 60 * 1000));

      await floor.post(url(id, 'no-show')).expect(409);
    });

    it.each(['seat', 'leave', 'no-show'])(
      '%s: id is not a uuid -> 400',
      async (action) => {
        await floor.post(url('not-a-uuid', action)).expect(400);
      },
    );

    it.each(['seat', 'leave', 'no-show'])(
      '%s: unknown reservation -> 404',
      async (action) => {
        await floor
          .post(url('00000000-0000-4000-8000-000000000000', action))
          .expect(404);
      },
    );

    it.each(['seat', 'leave', 'no-show'])(
      '%s: no membership -> 404, nothing changes',
      async (action) => {
        const id = await book(seat1Id, new Date());

        await plain.post(url(id, action)).expect(404);
        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id },
        });
        expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
      },
    );

    it.each(['seat', 'leave', 'no-show'])(
      '%s: not logged in -> 401',
      async (action) => {
        const id = await book(seat1Id, new Date());

        await request(server()).post(url(id, action)).expect(401);
      },
    );

    describe('reservation of another casino', () => {
      let otherCasinoId: string;
      let otherSeatId: string;

      beforeAll(async () => {
        const otherCasino = await prisma.casino.create({
          data: {
            name: `${prefix}-other-casino`,
            city: 'Test',
            address: `${prefix}-other-address`,
            tables: {
              create: {
                name: `${prefix}-other-table`,
                variant: PokerVariant.TEXAS_HOLDEM,
                smallBlind: 1,
                bigBlind: 2,
                maxSeats: 2,
                seats: { create: [{ seatNumber: 1 }] },
              },
            },
          },
          include: { tables: { include: { seats: true } } },
        });
        otherCasinoId = otherCasino.id;
        otherSeatId = otherCasino.tables[0].seats[0].id;
      });

      afterAll(async () => {
        await prisma.reservation.deleteMany({ where: { seatId: otherSeatId } });
        await prisma.seat.deleteMany({
          where: { table: { casinoId: otherCasinoId } },
        });
        await prisma.pokerTable.deleteMany({
          where: { casinoId: otherCasinoId },
        });
        await prisma.casino.delete({ where: { id: otherCasinoId } });
      });

      it.each(['seat', 'leave', 'no-show'])(
        '%s through our casino URL -> 404, nothing changes',
        async (action) => {
          const id = await book(otherSeatId, new Date(Date.now() - 1000));

          await floor.post(url(id, action)).expect(404);
          const reservation = await prisma.reservation.findUniqueOrThrow({
            where: { id },
          });
          expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
          await prisma.reservation.delete({ where: { id } });
        },
      );

      it('the floor list of our casino does not show it', async () => {
        const id = await book(otherSeatId, new Date());

        const res = await floor
          .get(floorUrl(casinoId))
          .query({ day: casinoDay(new Date()) })
          .expect(200);

        expect(res.body.map((r: { id: string }) => r.id)).not.toContain(id);
        await prisma.reservation.delete({ where: { id } });
      });
    });
  });

  // The whole life of a reservation through HTTP, player then floor.
  // PENDING_PAYMENT -> CONFIRMED is the Stripe ticket: simulated in the DB.
  describe('full cycle: book, pay, seat, leave', () => {
    let seat3Id: string;

    beforeAll(async () => {
      await register('cycle');
      seat3Id = (
        await prisma.seat.findFirstOrThrow({
          where: { tableId, seatNumber: 3 },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.reservation.deleteMany({ where: { seatId: seat3Id } });
      await prisma.seat.update({
        where: { id: seat3Id },
        data: { status: SeatStatus.FREE },
      });
    });

    it('goes PENDING_PAYMENT -> CONFIRMED -> SEATED -> COMPLETED', async () => {
      const player = await loggedInAgent('cycle');
      const tomorrowEvening = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrowEvening.setUTCHours(18, 0, 0, 0);

      // 1. the player books
      const booked = await player
        .post('/api/reservations')
        .send({ seatId: seat3Id, arrivalAt: tomorrowEvening.toISOString() })
        .expect(201);
      expect(booked.body.status).toBe(ReservationStatus.PENDING_PAYMENT);
      const id = booked.body.id as string;

      // 2. not paid yet: the floor cannot seat them
      await floor.post(`${floorUrl(casinoId)}/${id}/seat`).expect(409);

      // 3. paid (Stripe ticket), and the arrival day has come
      await prisma.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CONFIRMED, arrivalAt: new Date() },
      });

      // 4. the floor sees them in today's list
      const list = await floor
        .get(floorUrl(casinoId))
        .query({ day: casinoDay(new Date()) })
        .expect(200);
      expect(list.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id,
            status: ReservationStatus.CONFIRMED,
            user: { pseudo: `${prefix}-cycle` },
          }),
        ]),
      );

      // 5. check-in: the seat is taken
      await floor.post(`${floorUrl(casinoId)}/${id}/seat`).expect(200);
      expect(
        (await prisma.seat.findUniqueOrThrow({ where: { id: seat3Id } }))
          .status,
      ).toBe(SeatStatus.OCCUPIED);

      // 6. a walk-in FREE is refused while they sit: leave must be used
      await floor
        .patch(`/api/casinos/${casinoId}/tables/${tableId}/seats/3`)
        .send({ status: SeatStatus.FREE })
        .expect(409);

      // 7. the player sees SEATED in their own list
      const mine = await player.get('/api/reservations').expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ id, status: ReservationStatus.SEATED }),
      ]);

      // 8. departure: the seat is free again
      const left = await floor
        .post(`${floorUrl(casinoId)}/${id}/leave`)
        .expect(200);
      expect(left.body.status).toBe(ReservationStatus.COMPLETED);
      expect(typeof left.body.leftAt).toBe('string');
      expect(
        (await prisma.seat.findUniqueOrThrow({ where: { id: seat3Id } }))
          .status,
      ).toBe(SeatStatus.FREE);

      // 9. the floor list only shows active reservations: it is gone
      const after = await floor
        .get(floorUrl(casinoId))
        .query({ day: casinoDay(new Date()) })
        .expect(200);
      expect(after.body.map((r: { id: string }) => r.id)).not.toContain(id);
    });
  });
});
