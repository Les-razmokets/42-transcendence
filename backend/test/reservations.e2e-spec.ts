import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { PokerVariant, ReservationStatus } from '../src/generated/prisma/enums';

// /api/reservations through HTTP: auth guard, DTO and param validation, and
// response serialization (reservationSchema), which the service tests do not cover.
describe('/api/reservations (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let casinoId: string;
  const seatIds: string[] = [];

  // Unique prefix per run: we only clean up our own rows.
  // Other e2e suites wipe ALL users, so no reservation may survive this file
  // (onDelete: Restrict would make their deleteMany fail).
  const prefix = `rl${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9-Battery!';

  // tomorrow 18:00 UTC: in the future, within 7 days, outside 5h-8h Paris
  const arrivalAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  arrivalAt.setUTCHours(18, 0, 0, 0);

  const RESERVATION_KEYS = [
    'arrivalAt',
    'cancelledAt',
    'createdAt',
    'id',
    'leftAt',
    'seatId',
    'seatedAt',
    'status',
    'updatedAt',
    'userId',
  ];

  const server = () => app.getHttpServer();

  const email = (name: string) => `${prefix}-${name}@test.local`;

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

  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

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
        maxSeats: 3,
        seats: {
          createMany: {
            data: [1, 2, 3].map((seatNumber) => ({ seatNumber })),
          },
        },
      },
      include: { seats: true },
    });
    for (const seat of table.seats) seatIds[seat.seatNumber] = seat.id;

    ownerId = await register('owner');
    otherId = await register('other');
    await register('empty');
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({
      where: { seat: { table: { casinoId } } },
    });
    await prisma.seat.deleteMany({ where: { table: { casinoId } } });
    await prisma.pokerTable.deleteMany({ where: { casinoId } });
    await prisma.casino.delete({ where: { id: casinoId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: `${prefix}-` } },
    });
    await app.close();
  });

  describe('no valid authentication -> 401', () => {
    it('GET without cookie (the global guard protects the route)', async () => {
      await request(server()).get('/api/reservations').expect(401);
    });

    it('POST without cookie, and nothing is created', async () => {
      await request(server())
        .post('/api/reservations')
        .send({ seatId: seatIds[1], arrivalAt: arrivalAt.toISOString() })
        .expect(401);

      await expect(
        prisma.reservation.count({ where: { seatId: seatIds[1] } }),
      ).resolves.toBe(0);
    });
  });

  describe('POST then GET', () => {
    let ownerReservationId: string;
    let otherReservationId: string;

    beforeAll(async () => {
      const owner = await loggedInAgent('owner');
      const other = await loggedInAgent('other');

      const created = await owner
        .post('/api/reservations')
        .send({ seatId: seatIds[1], arrivalAt: arrivalAt.toISOString() })
        .expect(201);
      ownerReservationId = created.body.id;

      const otherCreated = await other
        .post('/api/reservations')
        .send({ seatId: seatIds[2], arrivalAt: arrivalAt.toISOString() })
        .expect(201);
      otherReservationId = otherCreated.body.id;
    });

    it('POST returned a serialized PENDING_PAYMENT reservation for the caller', async () => {
      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: ownerReservationId },
      });

      expect(reservation.userId).toBe(ownerId);
      expect(reservation.status).toBe(ReservationStatus.PENDING_PAYMENT);
    });

    it('GET returns 200 with exactly the reservation keys, dates as ISO strings', async () => {
      const owner = await loggedInAgent('owner');
      const res = await owner.get('/api/reservations').expect(200);

      expect(res.body).toHaveLength(1);
      const [reservation] = res.body;
      expect(Object.keys(reservation).sort()).toEqual(
        [...RESERVATION_KEYS].sort(),
      );
      expect(reservation).toMatchObject({
        id: ownerReservationId,
        userId: ownerId,
        seatId: seatIds[1],
        status: ReservationStatus.PENDING_PAYMENT,
        arrivalAt: arrivalAt.toISOString(),
        seatedAt: null,
        leftAt: null,
        cancelledAt: null,
      });
    });

    it("each player only sees their own reservations, never another player's", async () => {
      const owner = await loggedInAgent('owner');
      const other = await loggedInAgent('other');

      const ownerRes = await owner.get('/api/reservations').expect(200);
      const otherRes = await other.get('/api/reservations').expect(200);

      expect(ownerRes.body.map((r: { id: string }) => r.id)).toEqual([
        ownerReservationId,
      ]);
      expect(otherRes.body.map((r: { id: string }) => r.id)).toEqual([
        otherReservationId,
      ]);
      expect(otherRes.body[0].userId).toBe(otherId);
    });

    it('ignores a userId passed in the query string', async () => {
      const other = await loggedInAgent('other');

      const res = await other
        .get('/api/reservations')
        .query({ userId: ownerId })
        .expect(200);

      expect(res.body.map((r: { id: string }) => r.id)).toEqual([
        otherReservationId,
      ]);
    });

    it('returns an empty array for a player without reservations', async () => {
      const empty = await loggedInAgent('empty');

      const res = await empty.get('/api/reservations').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('DELETE /api/reservations/:id', () => {
    let cancellerId: string;
    let confirmedId: string;
    let pendingId: string;

    // a CONFIRMED reservation can only be inserted directly:
    // POST creates PENDING_PAYMENT and there is no payment route yet
    const insert = (status: ReservationStatus, hoursLater: number) =>
      prisma.reservation.create({
        data: {
          userId: cancellerId,
          seatId: seatIds[3],
          arrivalAt: new Date(arrivalAt.getTime() + hoursLater * 3_600_000),
          status,
        },
      });

    const statusOf = async (id: string) =>
      (await prisma.reservation.findUniqueOrThrow({ where: { id } })).status;

    beforeAll(async () => {
      cancellerId = await register('canceller');
      await register('intruder');
      // seat 3, two different casino days: one active reservation per day
      confirmedId = (await insert(ReservationStatus.CONFIRMED, 0)).id;
      pendingId = (await insert(ReservationStatus.PENDING_PAYMENT, 24)).id;
    });

    it('401 without cookie, and the reservation is unchanged', async () => {
      await request(server())
        .delete(`/api/reservations/${confirmedId}`)
        .expect(401);

      await expect(statusOf(confirmedId)).resolves.toBe(
        ReservationStatus.CONFIRMED,
      );
    });

    it('400 when the id is not a UUID (ParseUUIDPipe)', async () => {
      const canceller = await loggedInAgent('canceller');

      await canceller.delete('/api/reservations/not-a-uuid').expect(400);
    });

    it('404 for an unknown id', async () => {
      const canceller = await loggedInAgent('canceller');

      await canceller
        .delete('/api/reservations/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });

    it("404 for another player's reservation (its existence is not revealed), and it is unchanged", async () => {
      const intruder = await loggedInAgent('intruder');

      await intruder.delete(`/api/reservations/${confirmedId}`).expect(404);

      await expect(statusOf(confirmedId)).resolves.toBe(
        ReservationStatus.CONFIRMED,
      );
    });

    it('409 for a PENDING_PAYMENT reservation, and it is unchanged', async () => {
      const canceller = await loggedInAgent('canceller');

      await canceller.delete(`/api/reservations/${pendingId}`).expect(409);

      await expect(statusOf(pendingId)).resolves.toBe(
        ReservationStatus.PENDING_PAYMENT,
      );
    });

    it('200 with the serialized CANCELLED reservation, then 409 on a second DELETE', async () => {
      const canceller = await loggedInAgent('canceller');

      const res = await canceller
        .delete(`/api/reservations/${confirmedId}`)
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual(
        [...RESERVATION_KEYS].sort(),
      );
      expect(res.body).toMatchObject({
        id: confirmedId,
        userId: cancellerId,
        status: ReservationStatus.CANCELLED,
      });
      expect(new Date(res.body.cancelledAt).toISOString()).toBe(
        res.body.cancelledAt,
      );

      await canceller.delete(`/api/reservations/${confirmedId}`).expect(409);
    });

    it('the cancelled reservation stays in GET /api/reservations (history)', async () => {
      const canceller = await loggedInAgent('canceller');

      const res = await canceller.get('/api/reservations').expect(200);

      expect(
        res.body.find((r: { id: string }) => r.id === confirmedId),
      ).toMatchObject({ status: ReservationStatus.CANCELLED });
    });
  });
});
