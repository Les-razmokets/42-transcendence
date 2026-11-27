import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, Socket as ClientSocket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { COOKIE_NAME } from '../src/auth/utils/cookie';
import { WebsocketsGateway } from '../src/websockets/websockets.gateway';
import { tableRoom } from '../src/websockets/utils/rooms';

/*
 * Issue 3, `table:join`, end to end: real AppModule (global pipes AND global
 * interceptors included, which unit tests skip), real Socket.IO client, real DB.
 *
 * Fixtures are created here, not taken from prisma/seed: the seed is a manual dev
 * script (`make seed`), not guaranteed to be in the test DB, and other suites may
 * delete casinos. Same shapes as the seed traps, though: a deleted casino whose
 * table is NOT deleted (the "Paris" case).
 *
 * Run like the Makefile: docker compose run --build --rm backend npm run test:e2e -- websockets
 */

const PASSWORD = 'Correct-Horse-9-Battery!';
const USERS = {
  ann: { email: 'ws.rooms.ann@example.com', pseudo: 'wsroomsann' },
  ben: { email: 'ws.rooms.ben@example.com', pseudo: 'wsroomsben' },
} as const;
const EMAILS = Object.values(USERS).map((u) => u.email);
const TAG = 'ws-rooms-e2e'; // marks every fixture row, for cleanup
const MISSING = '99999999-9999-4999-8999-999999999999';
const ACK_MS = 3000;

type Ack = { ok: boolean; code?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('WebSocket rooms: table:join (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let gateway: WebsocketsGateway;
  let url: string;
  let ORIGIN: string;
  const opened: ClientSocket[] = [];
  const tokens: Record<keyof typeof USERS, string> = {} as never;

  // fixture ids
  let liveCasino: string;
  let otherLiveCasino: string;
  let deletedCasino: string;
  let tableA: string; // live, in liveCasino
  let tableB: string; // live, in liveCasino
  let deletedTable: string; // deleted, in liveCasino
  let tableInDeletedCasino: string; // NOT deleted, in deletedCasino (Paris trap)
  let tableInOtherCasino: string; // live, in otherLiveCasino

  // Test-only emits ('probe') are not in the shared contract: untyped view.
  const untypedServer = (): Server => gateway.server as unknown as Server;

  const cookieValue = (setCookie: string[] | string | undefined) => {
    const list = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    const line = list.find((c) => c.startsWith(`${COOKIE_NAME}=`));
    expect(line).toBeDefined();
    return (line as string).split(';')[0].slice(COOKIE_NAME.length + 1);
  };

  const registerAndLogin = async (key: keyof typeof USERS) => {
    const { email, pseudo } = USERS[key];
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Ws',
        lastName: 'Rooms',
        pseudo,
        email,
        password: PASSWORD,
        birthDate: '1990-01-01',
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return cookieValue(res.headers['set-cookie']);
  };

  const connectAs = (key: keyof typeof USERS) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const socket = io(url, {
        transports: ['websocket'],
        extraHeaders: {
          origin: ORIGIN,
          cookie: `${COOKIE_NAME}=${tokens[key]}`,
        },
        reconnection: false,
        forceNew: true,
        timeout: 4000,
      });
      opened.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const joinTable = (socket: ClientSocket, payload: unknown) =>
    socket.timeout(ACK_MS).emitWithAck('table:join', payload) as Promise<Ack>;

  const collect = (socket: ClientSocket, event: string, ms: number) =>
    new Promise<unknown[]>((resolve) => {
      const got: unknown[] = [];
      const onEvent = (payload: unknown) => got.push(payload);
      socket.on(event, onEvent);
      setTimeout(() => {
        socket.off(event, onEvent);
        resolve(got);
      }, ms);
    });

  const socketIdsIn = async (room: string) =>
    (await gateway.server.in(room).fetchSockets()).map((s) => s.id);

  const NOT_FOUND: Ack = { ok: false, code: 'NOT_FOUND' };
  const INVALID: Ack = { ok: false, code: 'INVALID' };

  // ---------------------------------------------------------------- fixtures
  const createCasino = async (suffix: string, deleted = false) =>
    (
      await prisma.casino.create({
        data: {
          name: `${TAG} ${suffix}`,
          city: 'Lausanne',
          address: `${TAG} ${suffix} street`,
          deletedAt: deleted ? new Date() : null,
        },
      })
    ).id;

  const createTable = async (
    casinoId: string,
    suffix: string,
    deleted = false,
  ) =>
    (
      await prisma.pokerTable.create({
        data: {
          casinoId,
          name: `${TAG} ${suffix}`,
          variant: 'TEXAS_HOLDEM',
          smallBlind: 1,
          bigBlind: 2,
          maxSeats: 6,
          deletedAt: deleted ? new Date() : null,
        },
      })
    ).id;

  const cleanFixtures = async () => {
    // tables first: Casino -> PokerTable is onDelete: Restrict
    await prisma.pokerTable.deleteMany({
      where: { name: { startsWith: TAG } },
    });
    await prisma.casino.deleteMany({ where: { name: { startsWith: TAG } } });
  };
  const cleanUsers = () =>
    prisma.user.deleteMany({ where: { email: { in: EMAILS } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app); // the REAL global pipes and interceptors
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    gateway = app.get(WebsocketsGateway);
    expect(process.env.FRONTEND_URL).toBeTruthy();
    ORIGIN = process.env.FRONTEND_URL as string;

    await cleanFixtures();
    await cleanUsers();
    liveCasino = await createCasino('live');
    otherLiveCasino = await createCasino('other');
    deletedCasino = await createCasino('deleted', true);
    tableA = await createTable(liveCasino, 'A');
    tableB = await createTable(liveCasino, 'B');
    deletedTable = await createTable(liveCasino, 'gone', true);
    tableInDeletedCasino = await createTable(deletedCasino, 'paris');
    tableInOtherCasino = await createTable(otherLiveCasino, 'other');

    for (const key of Object.keys(USERS) as (keyof typeof USERS)[])
      tokens[key] = await registerAndLogin(key);
  });

  afterEach(async () => {
    for (const s of opened.splice(0)) s.disconnect();
    await sleep(50);
  });

  afterAll(async () => {
    await cleanFixtures();
    await cleanUsers();
    await app.close();
  });

  // ---------------------------------------------------------------- success
  describe('allowed', () => {
    it('valid join -> ack is exactly { ok: true } (global interceptors included)', async () => {
      const s = await connectAs('ann');
      await expect(
        joinTable(s, { casinoId: liveCasino, tableId: tableA }),
      ).resolves.toStrictEqual({ ok: true });
    });

    it('after the ack, the socket really is in table:<tableId>', async () => {
      const s = await connectAs('ann');
      await joinTable(s, { casinoId: liveCasino, tableId: tableA });
      expect(await socketIdsIn(tableRoom(tableA))).toContain(s.id);
    });

    it('any authenticated user may watch a table (no membership needed)', async () => {
      const s = await connectAs('ben');
      await expect(
        joinTable(s, { casinoId: liveCasino, tableId: tableA }),
      ).resolves.toStrictEqual({ ok: true });
    });

    it('joining twice is harmless: ok twice, in the room once', async () => {
      const s = await connectAs('ann');
      const payload = { casinoId: liveCasino, tableId: tableA };
      await expect(joinTable(s, payload)).resolves.toStrictEqual({ ok: true });
      await expect(joinTable(s, payload)).resolves.toStrictEqual({ ok: true });
      const ids = await socketIdsIn(tableRoom(tableA));
      expect(ids.filter((id) => id === s.id)).toHaveLength(1);
    });

    it('one socket can watch two tables at once', async () => {
      const s = await connectAs('ann');
      await joinTable(s, { casinoId: liveCasino, tableId: tableA });
      await joinTable(s, { casinoId: liveCasino, tableId: tableB });
      expect(await socketIdsIn(tableRoom(tableA))).toContain(s.id);
      expect(await socketIdsIn(tableRoom(tableB))).toContain(s.id);
    });
  });

  // ---------------------------------------------------------------- refusals (D6)
  describe('refused, without revealing why (D6)', () => {
    const refusals = () =>
      [
        ['table does not exist', { casinoId: liveCasino, tableId: MISSING }],
        ['table is deleted', { casinoId: liveCasino, tableId: deletedTable }],
        [
          'table in a deleted casino (Paris trap)',
          { casinoId: deletedCasino, tableId: tableInDeletedCasino },
        ],
        [
          'table in a deleted casino, client names a LIVE casino',
          { casinoId: liveCasino, tableId: tableInDeletedCasino },
        ],
        [
          'table belongs to another casino',
          { casinoId: liveCasino, tableId: tableInOtherCasino },
        ],
        ['casino does not exist', { casinoId: MISSING, tableId: tableA }],
      ] as const;

    it('every refusal case -> exactly { ok: false, code: NOT_FOUND }', async () => {
      const s = await connectAs('ann');
      for (const [label, payload] of refusals()) {
        const ack = await joinTable(s, payload);
        expect({ label, ack }).toStrictEqual({ label, ack: NOT_FOUND });
      }
    });

    it('all refusal acks are byte-identical', async () => {
      const s = await connectAs('ann');
      const seen = new Set<string>();
      for (const [, payload] of refusals())
        seen.add(JSON.stringify(await joinTable(s, payload)));
      expect(seen.size).toBe(1);
    });

    it('a refused socket is NOT in the room', async () => {
      const s = await connectAs('ann');
      await joinTable(s, { casinoId: liveCasino, tableId: deletedTable });
      await joinTable(s, {
        casinoId: deletedCasino,
        tableId: tableInDeletedCasino,
      });
      expect(await socketIdsIn(tableRoom(deletedTable))).not.toContain(s.id);
      expect(await socketIdsIn(tableRoom(tableInDeletedCasino))).not.toContain(
        s.id,
      );
    });

    it('no "exception" event is ever sent: the ack is the only channel', async () => {
      const s = await connectAs('ann');
      const exceptions = collect(s, 'exception', 800);
      await joinTable(s, { casinoId: liveCasino, tableId: MISSING });
      await joinTable(s, { casinoId: liveCasino, tableId: 'abc' });
      expect(await exceptions).toEqual([]);
    });

    it('a refusal does not disconnect the socket; the next valid join works', async () => {
      const s = await connectAs('ann');
      await joinTable(s, { casinoId: liveCasino, tableId: MISSING });
      expect(s.connected).toBe(true);
      await expect(
        joinTable(s, { casinoId: liveCasino, tableId: tableA }),
      ).resolves.toStrictEqual({ ok: true });
    });
  });

  // ---------------------------------------------------------------- validation (D3)
  describe('invalid payloads -> INVALID (D3: which pipe runs on WS?)', () => {
    it.each([
      ['tableId not a UUID', { casinoId: 'LIVE', tableId: 'abc' }],
      ['casinoId not a UUID', { casinoId: 'abc', tableId: 'A' }],
      ['missing tableId', { casinoId: 'LIVE' }],
      ['missing casinoId', { tableId: 'A' }],
      ['empty object', {}],
      ['extra field', { casinoId: 'LIVE', tableId: 'A', admin: true }],
      ['tableId is a number', { casinoId: 'LIVE', tableId: 42 }],
      ['payload is a string', 'table-A'],
      ['payload is null', null],
    ])('%s -> exactly { ok: false, code: INVALID }', async (_l, raw) => {
      // replace placeholders with real ids, so only the invalid part is invalid
      const fill = (v: unknown): unknown =>
        v === 'LIVE' ? liveCasino : v === 'A' ? tableA : v;
      const payload =
        raw && typeof raw === 'object'
          ? Object.fromEntries(
              Object.entries(raw).map(([k, v]) => [k, fill(v)]),
            )
          : raw;
      const s = await connectAs('ann');
      await expect(joinTable(s, payload)).resolves.toStrictEqual(INVALID);
      expect(await socketIdsIn(tableRoom(tableA))).not.toContain(s.id);
    });
  });

  // ---------------------------------------------------------------- isolation
  describe('room isolation', () => {
    it('an emit to table:A reaches table A watchers only', async () => {
      const onA = await connectAs('ann');
      const onB = await connectAs('ben');
      const nowhere = await connectAs('ben');
      await joinTable(onA, { casinoId: liveCasino, tableId: tableA });
      await joinTable(onB, { casinoId: liveCasino, tableId: tableB });

      const gotA = collect(onA, 'probe', 500);
      const gotB = collect(onB, 'probe', 500);
      const gotNowhere = collect(nowhere, 'probe', 500);
      untypedServer().to(tableRoom(tableA)).emit('probe', 'for A');

      expect(await gotA).toEqual(['for A']);
      expect(await gotB).toEqual([]);
      expect(await gotNowhere).toEqual([]);
    });

    it('a refused socket does not receive the table emits', async () => {
      const refused = await connectAs('ann');
      await joinTable(refused, { casinoId: liveCasino, tableId: deletedTable });
      const got = collect(refused, 'probe', 500);
      untypedServer().to(tableRoom(deletedTable)).emit('probe', 'x');
      expect(await got).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- robustness
  describe('robustness', () => {
    it('emit without an ack callback: no crash, socket stays usable', async () => {
      const s = await connectAs('ann');
      s.emit('table:join', { casinoId: liveCasino, tableId: MISSING });
      s.emit('table:join', { casinoId: 'bad', tableId: 'bad' });
      await sleep(200);
      expect(s.connected).toBe(true);
      await expect(
        joinTable(s, { casinoId: liveCasino, tableId: tableA }),
      ).resolves.toStrictEqual({ ok: true });
    });

    it('rooms are lost on reconnect: the new socket must join again', async () => {
      const first = await connectAs('ann');
      await joinTable(first, { casinoId: liveCasino, tableId: tableA });
      first.disconnect();
      await sleep(100);
      const second = await connectAs('ann');
      const ids = await socketIdsIn(tableRoom(tableA));
      expect(ids).not.toContain(first.id);
      expect(ids).not.toContain(second.id);
    });

    it('a burst of joins all get an answer', async () => {
      const s = await connectAs('ann');
      const acks = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          joinTable(s, {
            casinoId: liveCasino,
            tableId: i % 2 ? tableA : MISSING,
          }),
        ),
      );
      expect(acks).toHaveLength(20);
      acks.forEach((ack, i) =>
        expect(ack).toStrictEqual(i % 2 ? { ok: true } : NOT_FOUND),
      );
    });
  });
});
