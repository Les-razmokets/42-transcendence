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
import { JwtService } from '@nestjs/jwt';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, Socket as ClientSocket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { COOKIE_NAME } from '../src/auth/utils/cookie';
import { WebsocketsGateway } from '../src/websockets/websockets.gateway';
import { userRoom } from '../src/websockets/utils/rooms';
import { Role } from '../src/generated/prisma/client';

/*
 * WebSocket handshake auth (issue 2), end to end: real AppModule, real HTTP server,
 * real Socket.IO client, real DB. Every "done when" item of the issue is a test here.
 */

const PASSWORD = 'Correct-Horse-9-Battery!';
const USERS = {
  alice: { email: 'ws.e2e.alice@example.com', pseudo: 'wse2ealice' },
  bob: { email: 'ws.e2e.bob@example.com', pseudo: 'wse2ebob' },
  carol: { email: 'ws.e2e.carol@example.com', pseudo: 'wse2ecarol' },
  dave: { email: 'ws.e2e.dave@example.com', pseudo: 'wse2edave' },
} as const;
const EMAILS = Object.values(USERS).map((u) => u.email);

type Logged = { id: string; token: string };
type ConnectResult =
  | { connected: true; socket: ClientSocket }
  | {
      connected: false;
      socket: ClientSocket;
      error: Error & { data?: unknown };
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The gateway's server only allows events from the shared contract
// (@transcendence/shared). Room isolation tests emit a fake 'probe' event that
// must NOT be part of that contract (the front would see it), so they go through
// this untyped view of the server. Use it for test-only emits, nothing else.
const untypedServer = (gateway: WebsocketsGateway): Server =>
  gateway.server as unknown as Server;

describe('WebSocket handshake auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let gateway: WebsocketsGateway;
  let url: string;
  let ORIGIN: string;
  const opened: ClientSocket[] = [];
  const logged: Record<keyof typeof USERS, Logged> = {} as never;

  const cookieValue = (setCookie: string[] | string | undefined) => {
    const list = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    const line = list.find((c) => c.startsWith(`${COOKIE_NAME}=`));
    expect(line).toBeDefined();
    return (line as string).split(';')[0].slice(COOKIE_NAME.length + 1);
  };

  const registerAndLogin = async (key: keyof typeof USERS): Promise<Logged> => {
    const { email, pseudo } = USERS[key];
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Ws',
        lastName: 'E2e',
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
    return {
      id: (res.body as { id: string }).id,
      token: cookieValue(res.headers['set-cookie']),
    };
  };

  /**
   * Opens a socket and resolves on the first outcome. `origin: null` sends no Origin header,
   * `token: null` sends no cookie at all. Every socket is tracked and closed after each test.
   */
  const connect = (
    opts: {
      origin?: string | null;
      token?: string | null;
      cookie?: string;
      reconnection?: boolean;
    } = {},
  ) =>
    new Promise<ConnectResult>((resolve) => {
      const headers: Record<string, string> = {};
      if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
      if (opts.cookie !== undefined) headers.cookie = opts.cookie;
      else if (opts.token) headers.cookie = `${COOKIE_NAME}=${opts.token}`;

      const socket = io(url, {
        transports: ['websocket'],
        extraHeaders: headers,
        reconnection: opts.reconnection ?? false,
        forceNew: true, // never share a connection between test clients
        timeout: 4000,
      });
      opened.push(socket);
      socket.once('connect', () => resolve({ connected: true, socket }));
      socket.once('connect_error', (error) =>
        resolve({ connected: false, socket, error }),
      );
    });

  const connectOk = async (token: string) => {
    const result = await connect({ token });
    expect(result.connected).toBe(true);
    return result.socket;
  };

  const expectRefused = (result: ConnectResult) => {
    expect(result.connected).toBe(false);
    if (result.connected) return;
    // one generic message: the client cannot tell why it was refused
    expect(result.error.message).toBe('unauthorized');
    expect(result.error.data).toBeUndefined();
    expect(result.socket.connected).toBe(false);
  };

  // resolves with the event payloads received during `ms`
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

  const waitFor = <T>(socket: ClientSocket, event: string, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no "${event}" within ${ms}ms`)),
        ms,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const cleanUsers = () =>
    prisma.user.deleteMany({ where: { email: { in: EMAILS } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.listen(0); // a real listening server: a socket cannot go through supertest
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    gateway = app.get(WebsocketsGateway);

    expect(process.env.FRONTEND_URL).toBeTruthy();
    ORIGIN = process.env.FRONTEND_URL as string;

    await cleanUsers();
    for (const key of Object.keys(USERS) as (keyof typeof USERS)[])
      logged[key] = await registerAndLogin(key);
  });

  afterEach(async () => {
    for (const s of opened.splice(0)) s.disconnect();
    await sleep(50); // let the server run handleDisconnect before the next test
  });

  afterAll(async () => {
    await cleanUsers();
    await app.close();
  });

  // ------------------------------------------------------------------ accepted
  describe('accepted connection', () => {
    it('valid session cookie + frontend Origin: connected', async () => {
      const socket = await connectOk(logged.alice.token);
      expect(socket.connected).toBe(true);
    });

    it('ping -> pong works without @Public(): AuthGuard does not block WS messages', async () => {
      const socket = await connectOk(logged.alice.token);

      const pong = waitFor<unknown>(socket, 'pong', 2000);
      socket.emit('ping', 'hi');

      await expect(pong).resolves.toEqual({ message: 'pong' });
    });

    it('no "exception" event is ever sent on a normal ping', async () => {
      const socket = await connectOk(logged.alice.token);

      const exceptions = collect(socket, 'exception', 500);
      socket.emit('ping', 'hi');

      expect(await exceptions).toEqual([]);
    });

    it('pong goes to the sender only', async () => {
      const a = await connectOk(logged.alice.token);
      const b = await connectOk(logged.bob.token);

      const bPongs = collect(b, 'pong', 500);
      const aPong = waitFor<unknown>(a, 'pong', 2000);
      a.emit('ping', 'hi');

      await expect(aPong).resolves.toEqual({ message: 'pong' });
      expect(await bPongs).toEqual([]);
    });

    it('the session cookie is found among other cookies', async () => {
      const result = await connect({
        cookie: `theme=dark; ${COOKIE_NAME}=${logged.alice.token}; lang=fr`,
      });
      expect(result.connected).toBe(true);
    });
  });

  // ------------------------------------------------------------------ server-side state
  describe('server-side state of an accepted socket', () => {
    it('socket.data.user is exactly { id, role, exp } of the logged user, taken from the DB', async () => {
      const socket = await connectOk(logged.alice.token);

      const remote = (await gateway.server.fetchSockets()).find(
        (s) => s.id === socket.id,
      );

      expect(remote).toBeDefined();
      const user = remote?.data.user;
      expect(Object.keys(user ?? {}).sort()).toEqual(['exp', 'id', 'role']);
      expect(user?.id).toBe(logged.alice.id);
      expect(user?.role).toBe(Role.USER);
      expect(user?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('every tab of a user joins user:<id>, and only that user is in it', async () => {
      const tab1 = await connectOk(logged.alice.token);
      const tab2 = await connectOk(logged.alice.token);
      const bob = await connectOk(logged.bob.token);

      const ids = (
        await gateway.server.in(userRoom(logged.alice.id)).fetchSockets()
      ).map((s) => s.id);

      const byId = (a: string, b: string) => a.localeCompare(b);
      expect([...ids].sort(byId)).toEqual(
        [tab1.id as string, tab2.id as string].sort(byId),
      );
      expect(ids).not.toContain(bob.id);
      expect(userRoom(logged.alice.id)).toBe(`user:${logged.alice.id}`);
    });

    it('an emit to user:<id> reaches all tabs of that user and nobody else', async () => {
      const tab1 = await connectOk(logged.alice.token);
      const tab2 = await connectOk(logged.alice.token);
      const bob = await connectOk(logged.bob.token);

      const got1 = collect(tab1, 'probe', 500);
      const got2 = collect(tab2, 'probe', 500);
      const gotBob = collect(bob, 'probe', 500);
      untypedServer(gateway).to(userRoom(logged.alice.id)).emit('probe', 42);

      expect(await got1).toEqual([42]);
      expect(await got2).toEqual([42]);
      expect(await gotBob).toEqual([]);
    });

    it('a refused socket never reaches the server socket list', async () => {
      const before = (await gateway.server.fetchSockets()).length;

      expectRefused(await connect({ token: null }));
      expectRefused(
        await connect({
          origin: 'https://evil.example',
          token: logged.alice.token,
        }),
      );

      expect((await gateway.server.fetchSockets()).length).toBe(before);
    });
  });

  // ------------------------------------------------------------------ Origin
  describe('Origin check (anti cross-site WebSocket hijacking)', () => {
    const nearMisses = () => {
      const u = new URL(ORIGIN);
      const other = u.protocol === 'https:' ? 'http:' : 'https:';
      return [
        ['another site', 'https://evil.example'],
        ['"null" origin', 'null'],
        ['trailing slash', `${ORIGIN}/`],
        ['other scheme', `${other}//${u.host}`],
        ['other port', `${u.protocol}//${u.hostname}:1`],
        ['subdomain of the frontend', `${u.protocol}//evil.${u.host}`],
        ['frontend used as a prefix', `${ORIGIN}.evil.com`],
      ] as const;
    };

    it('no Origin header at all: refused, even with a valid cookie', async () => {
      expectRefused(await connect({ origin: null, token: logged.alice.token }));
    });

    it('every near-miss origin is refused, even with a valid cookie', async () => {
      for (const [name, origin] of nearMisses()) {
        const result = await connect({ origin, token: logged.alice.token });
        // the label tells which variant leaked if this fails
        expect([name, result.connected]).toEqual([name, false]);
        expectRefused(result);
      }
    });
  });

  // ------------------------------------------------------------------ session
  describe('session checks', () => {
    it('no cookie: refused', async () => {
      expectRefused(await connect({ token: null }));
    });

    it('other cookies but no session cookie: refused', async () => {
      expectRefused(await connect({ cookie: 'theme=dark; lang=fr' }));
    });

    it('empty session cookie: refused', async () => {
      expectRefused(await connect({ cookie: `${COOKIE_NAME}=` }));
    });

    it('garbage token: refused', async () => {
      expectRefused(await connect({ token: 'not.a.token' }));
    });

    it('expired token: refused', async () => {
      const expired = await jwt.signAsync(
        { sub: logged.alice.id, role: Role.USER },
        { expiresIn: -10 },
      );
      expectRefused(await connect({ token: expired }));
    });

    it('token signed with another secret: refused', async () => {
      const forged = await new JwtService({
        secret: 'another-secret-entirely-0123456789abcdef',
      }).signAsync(
        { sub: logged.alice.id, role: Role.USER },
        { expiresIn: 60 },
      );
      expectRefused(await connect({ token: forged }));
    });

    it('token signed with another algorithm (HS384): refused', async () => {
      const other = await jwt.signAsync(
        { sub: logged.alice.id, role: Role.USER },
        { algorithm: 'HS384' },
      );
      expectRefused(await connect({ token: other }));
    });

    it('validly signed token without exp: refused (a WS session must expire)', async () => {
      expect(process.env.JWT_SECRET).toBeTruthy();
      const noExp = await new JwtService({
        secret: process.env.JWT_SECRET,
      }).signAsync({ sub: logged.alice.id, role: Role.USER });
      expect(
        (
          JSON.parse(
            Buffer.from(noExp.split('.')[1], 'base64url').toString('utf8'),
          ) as { exp?: number }
        ).exp,
      ).toBeUndefined();

      expectRefused(await connect({ token: noExp }));
    });

    it('soft-deleted user with a still-valid token: refused', async () => {
      await prisma.user.update({
        where: { id: logged.carol.id },
        data: { deletedAt: new Date() },
      });

      expectRefused(await connect({ token: logged.carol.token }));
    });

    it('user removed from the DB with a still-valid token: refused', async () => {
      await prisma.user.delete({ where: { id: logged.dave.id } });

      expectRefused(await connect({ token: logged.dave.token }));
    });

    it('every refusal carries the same generic message (no oracle for the attacker)', async () => {
      const results = [
        await connect({ token: null }),
        await connect({
          origin: 'https://evil.example',
          token: logged.alice.token,
        }),
        await connect({ token: 'not.a.token' }),
        await connect({ token: logged.carol.token }),
      ];
      const messages = results.map((r) =>
        r.connected ? '<connected>' : r.error.message,
      );
      expect(new Set(messages)).toEqual(new Set(['unauthorized']));
    });
  });

  // ------------------------------------------------------------------ expiry
  describe('session expiry while connected', () => {
    it('the server disconnects the socket when its JWT expires (io server disconnect), and the client does not auto-reconnect', async () => {
      const shortLived = await jwt.signAsync(
        { sub: logged.alice.id, role: Role.USER },
        { expiresIn: 2 },
      );
      const result = await connect({ token: shortLived, reconnection: true });
      expect(result.connected).toBe(true);
      const socket = result.socket;
      let reconnects = 0;
      socket.on('connect', () => reconnects++);

      const reason = await waitFor<string>(socket, 'disconnect', 5000);

      expect(reason).toBe('io server disconnect');
      await sleep(1500);
      expect(socket.connected).toBe(false);
      expect(reconnects).toBe(0);
    }, 10_000);

    it('a long-lived session is NOT disconnected early', async () => {
      const socket = await connectOk(logged.alice.token);

      const reasons = collect(socket, 'disconnect', 2500);

      expect(await reasons).toEqual([]);
      expect(socket.connected).toBe(true);
    }, 10_000);
  });

  // ------------------------------------------------------------------ HTTP unchanged
  describe('HTTP behaviour is unchanged', () => {
    it('GET /api/users/me with the session cookie: 200', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Cookie', `${COOKIE_NAME}=${logged.alice.token}`)
        .expect(200);
    });

    it('GET /api/users/me without a cookie: 401 (AuthGuard still protects HTTP)', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
    });
  });
});
