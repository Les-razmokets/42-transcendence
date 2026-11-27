import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import {
  MESSAGE_MAPPING_METADATA,
  MESSAGE_METADATA,
} from '@nestjs/websockets/constants';
import { WebsocketsGateway } from '../websockets.gateway';
import { WsLoggingExceptionFilter } from '../websockets.logging-exception-filter';
import { SessionService } from '../../auth/session.service';
import { COOKIE_NAME } from '../../auth/utils/cookie';
import { IS_PUBLIC_KEY } from '../../auth/utils/public.decorator';
import { ROLES_KEY } from '../../auth/utils/roles.decorator';
import type { VerifiedSession } from '../../auth/utils/verified.session';
import type { AppServer, AppSocket } from '../utils/websockets.types';
import { userRoom } from '../utils/rooms';
import type { WsTableJoinService } from '../websockets.join-table.service';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.USER

/*
 * Written against the issue 2 specification, not against the implementation:
 *  - handshake: Origin must equal FRONTEND_URL, the session cookie must verify, otherwise the
 *    connection is refused with ONE generic error, the cause is only in the server logs,
 *    and the token never appears in any log;
 *  - a refused or failed handshake never calls next() twice (the missing `return` bug);
 *  - an accepted socket carries { id, role, exp } and joins user:<id>;
 *  - the server disconnects the socket (closing the transport) when the JWT expires,
 *    and cleans the timer when the socket leaves first;
 *  - Nest does not await handleConnection, so it must never reject.
 */

const FRONTEND = 'https://app.example.test';
// a recognizable token value, so we can prove it never reaches the logs
const TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.SECRET-TOKEN-PAYLOAD.SECRET-TOKEN-SIGNATURE';

type Next = jest.Mock<(err?: Error & { data?: unknown }) => void>;
type Middleware = (socket: AppSocket, next: Next) => unknown;

interface FakeSocket {
  id: string;
  handshake: {
    headers: Record<string, string | string[] | undefined>;
    address: string;
  };
  data: { user?: VerifiedSession; expiryTimer?: NodeJS.Timeout };
  connected: boolean;
  join: jest.Mock<(room: string) => Promise<void> | void>;
  disconnect: jest.Mock<(close?: boolean) => void>;
  emit: jest.Mock<(event: string, ...args: unknown[]) => boolean>;
}

let socketCounter = 0;
const makeSocket = (
  headers: Record<string, string | string[] | undefined> = {},
  user?: VerifiedSession,
): FakeSocket => {
  const socket: FakeSocket = {
    id: `sock-${++socketCounter}`,
    handshake: { headers, address: '198.51.100.9' },
    data: user ? { user } : {},
    connected: true,
    join: jest.fn<(room: string) => Promise<void> | void>(),
    disconnect: jest.fn<(close?: boolean) => void>(),
    emit: jest.fn<(event: string, ...args: unknown[]) => boolean>(),
  };
  // a real socket is no longer connected once disconnect() has been called
  socket.disconnect.mockImplementation(() => {
    socket.connected = false;
  });
  return socket;
};
const asSocket = (s: FakeSocket) => s as unknown as AppSocket;

const validHeaders = (cookie = `${COOKIE_NAME}=${TOKEN}`) => ({
  origin: FRONTEND,
  cookie,
});

describe('WebsocketsGateway', () => {
  let gateway: WebsocketsGateway;
  let config: { getOrThrow: jest.Mock<(key: string) => string> };
  let session: { verify: jest.Mock<SessionService['verify']> };
  // issue 3: table:join access check (tested in websockets.table-join.spec.ts)
  const tableJoin = {
    assertCanJoin: jest.fn<WsTableJoinService['assertCanJoin']>(),
  } as unknown as WsTableJoinService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;
  let errorSpy: jest.SpiedFunction<Logger['error']>;

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const sessionFor = (expInSeconds: number): VerifiedSession => ({
    id: 'u1',
    role: Role.USER,
    exp: nowSeconds() + expInSeconds,
  });

  // every argument of every log call, flattened to text
  const allLogText = () =>
    [logSpy, warnSpy, errorSpy]
      .flatMap((spy) => spy.mock.calls.flat())
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return FRONTEND;
        throw new Error(`unexpected config key ${key}`);
      }),
    };
    session = { verify: jest.fn<SessionService['verify']>() };
    session.verify.mockResolvedValue(sessionFor(3600));

    gateway = new WebsocketsGateway(
      config as unknown as ConfigService,
      session as unknown as SessionService,
      tableJoin,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------------ configuration
  describe('configuration', () => {
    it('fails at construction (app startup) when FRONTEND_URL is missing, not at the first connection', () => {
      const broken = {
        getOrThrow: jest.fn(() => {
          throw new Error('FRONTEND_URL is missing');
        }),
      };
      expect(
        () =>
          new WebsocketsGateway(
            broken as unknown as ConfigService,
            session as unknown as SessionService,
            tableJoin,
          ),
      ).toThrow();
    });

    it('protects every handler with the logging exception filter', () => {
      const filters = Reflect.getMetadata(
        EXCEPTION_FILTERS_METADATA,
        WebsocketsGateway,
      ) as unknown[] | undefined;
      const filterClasses = (filters ?? []).map((f) =>
        typeof f === 'function' ? f : (f as object).constructor,
      );
      expect(filterClasses).toContain(WsLoggingExceptionFilter);
    });

    it('no message handler relies on @Roles() or @Public() (HTTP-only, would silently do nothing on WS)', () => {
      const proto = WebsocketsGateway.prototype as unknown as Record<
        string,
        unknown
      >;
      const handlers = Object.getOwnPropertyNames(proto)
        .map((name) => proto[name])
        .filter(
          (fn): fn is object =>
            typeof fn === 'function' &&
            Reflect.getMetadata(MESSAGE_MAPPING_METADATA, fn) === true,
        );

      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
        expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      }
      expect(Reflect.getMetadata(ROLES_KEY, WebsocketsGateway)).toBeUndefined();
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, WebsocketsGateway),
      ).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------ handshake middleware
  describe('handshake middleware', () => {
    let middleware: Middleware;

    // flushes pending microtasks/IO callbacks, so an implementation that calls next()
    // after an extra await is still observed
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    const run = async (socket: FakeSocket) => {
      const next: Next = jest.fn();
      await middleware(asSocket(socket), next);
      await settle();
      return next;
    };

    // every refusal must look the same to the client: one generic error, no details
    const expectRefusedOnce = (next: Next) => {
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('unauthorized');
      expect(err?.data).toBeUndefined();
    };

    beforeEach(() => {
      const server = { use: jest.fn<(fn: Middleware) => void>() };
      // the middleware may be registered on the injected server or on the afterInit argument:
      // both are the same object at runtime
      gateway.server = server as unknown as AppServer;
      gateway.afterInit(server as unknown as AppServer);

      expect(server.use).toHaveBeenCalledTimes(1);
      middleware = server.use.mock.calls[0][0];
    });

    describe('Origin check', () => {
      it.each([
        ['no Origin header (non-browser client)', undefined],
        ['empty Origin', ''],
        ['another site', 'https://evil.example'],
        ['"null" origin (sandboxed iframe, file://)', 'null'],
        ['same host over http', 'http://app.example.test'],
        ['trailing slash', 'https://app.example.test/'],
        ['other port', 'https://app.example.test:8443'],
        ['subdomain of the frontend', 'https://evil.app.example.test'],
        ['frontend used as a prefix', 'https://app.example.test.evil.com'],
      ])(
        '%s: refused, even with a VALID cookie, and the session is never verified',
        async (_name, origin) => {
          const socket = makeSocket({
            origin,
            cookie: `${COOKIE_NAME}=${TOKEN}`,
          });

          const next = await run(socket);

          expectRefusedOnce(next);
          // cheap check first: a hostile page never costs a JWT check + DB query
          expect(session.verify).not.toHaveBeenCalled();
          expect(socket.data.user).toBeUndefined();
        },
      );

      it('the exact frontend origin is accepted', async () => {
        const next = await run(makeSocket(validHeaders()));
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('session cookie', () => {
      it.each([
        ['no Cookie header at all', undefined],
        ['empty Cookie header', ''],
        ['only other cookies', 'theme=dark; lang=fr'],
        ['session cookie present but empty', `${COOKIE_NAME}=`],
        [
          'a cookie whose name only contains the session cookie name',
          `x${COOKIE_NAME}=${TOKEN}`,
        ],
      ])('%s: refused without verifying anything', async (_name, cookie) => {
        const socket = makeSocket({ origin: FRONTEND, cookie });

        const next = await run(socket);

        expectRefusedOnce(next);
        expect(session.verify).not.toHaveBeenCalled();
        expect(socket.data.user).toBeUndefined();
      });

      it('extracts the session cookie among others and verifies exactly that token, once', async () => {
        const socket = makeSocket(
          validHeaders(`theme=dark; ${COOKIE_NAME}=${TOKEN}; lang=fr`),
        );

        await run(socket);

        expect(session.verify).toHaveBeenCalledTimes(1);
        expect(session.verify).toHaveBeenCalledWith(TOKEN);
      });
    });

    describe('session verification', () => {
      it('valid session: accepted exactly once, without error, and the socket carries the verified session', async () => {
        const verified = sessionFor(3600);
        session.verify.mockResolvedValue(verified);
        const socket = makeSocket(validHeaders());

        const next = await run(socket);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0]).toEqual([]);
        expect(socket.data.user).toEqual(verified);
      });

      it('invalid session (401 from SessionService): refused once, socket not authenticated', async () => {
        session.verify.mockRejectedValue(new UnauthorizedException());
        const socket = makeSocket(validHeaders());

        const next = await run(socket);

        expectRefusedOnce(next);
        expect(socket.data.user).toBeUndefined();
      });

      it('unexpected failure (DB down): refused once with the SAME generic error, never accepted', async () => {
        session.verify.mockRejectedValue(new Error('db down'));
        const socket = makeSocket(validHeaders());

        const next = await run(socket);

        expectRefusedOnce(next);
        expect(socket.data.user).toBeUndefined();
      });

      it('a synchronous throw from SessionService is handled like a rejection', async () => {
        session.verify.mockImplementation(() => {
          throw new Error('sync boom');
        });
        const socket = makeSocket(validHeaders());

        const next = await run(socket);

        expectRefusedOnce(next);
        expect(socket.data.user).toBeUndefined();
      });

      it('the client cannot tell the causes apart: all refusals carry the same message', async () => {
        const messages: string[] = [];
        const collect = async (socket: FakeSocket) => {
          const next = await run(socket);
          messages.push(next.mock.calls[0][0]?.message ?? '<accepted>');
        };

        await collect(makeSocket({ origin: 'https://evil.example' }));
        await collect(makeSocket({ origin: FRONTEND }));
        session.verify.mockRejectedValueOnce(new UnauthorizedException());
        await collect(makeSocket(validHeaders()));
        session.verify.mockRejectedValueOnce(new Error('db down'));
        await collect(makeSocket(validHeaders()));

        expect(new Set(messages)).toEqual(new Set(['unauthorized']));
      });
    });

    describe('logs (the cause lives on the server side only)', () => {
      it('every refusal is logged as a warning with the socket id, without being an error', async () => {
        const socket = makeSocket({ origin: 'https://evil.example' });

        await run(socket);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(String(warnSpy.mock.calls[0][0])).toContain(socket.id);
      });

      it('a bad origin log shows the origin that was received', async () => {
        await run(makeSocket({ origin: 'https://evil.example' }));
        expect(allLogText()).toContain('https://evil.example');
      });

      it('the three causes produce three different log messages', async () => {
        const causeOf = async (socket: FakeSocket) => {
          warnSpy.mockClear();
          await run(socket);
          expect(warnSpy).toHaveBeenCalledTimes(1);
          // drop the parts that change per socket, keep the cause
          return String(warnSpy.mock.calls[0][0])
            .replaceAll(socket.id, '<id>')
            .replaceAll(/origin=\S*/g, '')
            .replaceAll(/ip=\S*/g, '');
        };

        const badOrigin = await causeOf(
          makeSocket({ origin: 'https://evil.example' }),
        );
        const noCookie = await causeOf(makeSocket({ origin: FRONTEND }));
        session.verify.mockRejectedValueOnce(new UnauthorizedException());
        const badSession = await causeOf(makeSocket(validHeaders()));

        expect(new Set([badOrigin, noCookie, badSession]).size).toBe(3);
      });

      it.each([
        ['single X-Forwarded-For value', '203.0.113.7', '203.0.113.7'],
        [
          'X-Forwarded-For list: the first (client) entry',
          ' 203.0.113.7 , 10.0.0.2',
          '203.0.113.7',
        ],
        [
          'repeated header (array): the first entry',
          ['203.0.113.7', '10.0.0.2'],
          '203.0.113.7',
        ],
        ['no X-Forwarded-For: the socket address', undefined, '198.51.100.9'],
      ])('client IP in the refusal log: %s', async (_name, xff, expected) => {
        await run(
          makeSocket({
            origin: 'https://evil.example',
            'x-forwarded-for': xff,
          }),
        );

        expect(String(warnSpy.mock.calls[0][0])).toContain(`ip=${expected}`);
      });

      it('an unexpected verification failure is logged as an error WITH the stack trace', async () => {
        const boom = new Error('db down');
        session.verify.mockRejectedValue(boom);

        await run(makeSocket(validHeaders()));

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [, stack] = errorSpy.mock.calls[0];
        expect(String(stack)).toContain('db down');
        expect(String(stack)).toBe(boom.stack);
      });

      it('an invalid session is a warning, not an error', async () => {
        session.verify.mockRejectedValue(new UnauthorizedException());

        await run(makeSocket(validHeaders()));

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('the token never appears in any log, whatever the outcome', async () => {
        // bad origin with a valid cookie
        await run(
          makeSocket({
            origin: 'https://evil.example',
            cookie: `${COOKIE_NAME}=${TOKEN}`,
          }),
        );
        // invalid session
        session.verify.mockRejectedValueOnce(new UnauthorizedException());
        await run(makeSocket(validHeaders()));
        // unexpected failure
        session.verify.mockRejectedValueOnce(new Error('db down'));
        await run(makeSocket(validHeaders()));
        // accepted
        await run(makeSocket(validHeaders()));

        expect(allLogText()).not.toContain(TOKEN);
        expect(allLogText()).not.toContain('SECRET-TOKEN');
      });
    });
  });

  // ------------------------------------------------------------------ handleConnection
  describe('handleConnection', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    });

    it('joins the personal room user:<id>, exactly once', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(3600));

      await gateway.handleConnection(asSocket(socket));

      expect(socket.join).toHaveBeenCalledTimes(1);
      expect(socket.join).toHaveBeenCalledWith('user:u1');
      expect(userRoom('u1')).toBe('user:u1');
    });

    it('does not disconnect a valid session before its exp, and disconnects it exactly at exp', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));

      await gateway.handleConnection(asSocket(socket));

      jest.advanceTimersByTime(60_000 - 1);
      expect(socket.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
    });

    it('expiry closes the underlying connection: disconnect(true)', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));

      await gateway.handleConnection(asSocket(socket));
      jest.advanceTimersByTime(60_000);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('keeps the timer handle on the socket, so handleDisconnect can clear it', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));

      await gateway.handleConnection(asSocket(socket));

      expect(socket.data.expiryTimer).toBeDefined();
      expect(jest.getTimerCount()).toBe(1);
    });

    it('a normal expiry is logged with the user, as ordinary information (not a warning/error)', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));
      await gateway.handleConnection(asSocket(socket));
      logSpy.mockClear();
      warnSpy.mockClear();

      jest.advanceTimersByTime(60_000);

      const expiryLogs = logSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes(socket.id));
      expect(expiryLogs.some((m) => m.includes('u1'))).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['already expired', -1],
      ['expiring exactly now', 0],
    ])(
      '%s at connection: disconnected immediately with disconnect(true), no timer left',
      async (_name, expIn) => {
        const socket = makeSocket(validHeaders(), sessionFor(expIn));

        await gateway.handleConnection(asSocket(socket));

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(jest.getTimerCount()).toBe(0);
        expect(socket.data.expiryTimer).toBeUndefined();
      },
    );

    it('already expired at connection is logged as a warning naming the user', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(-1));

      await gateway.handleConnection(asSocket(socket));

      const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warnings.some((m) => m.includes('u1'))).toBe(true);
    });

    it('creates the timer only AFTER the room is joined', async () => {
      let resolveJoin!: () => void;
      const socket = makeSocket(validHeaders(), sessionFor(60));
      socket.join.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveJoin = resolve;
        }),
      );

      const pending = gateway.handleConnection(asSocket(socket));
      await Promise.resolve();
      expect(jest.getTimerCount()).toBe(0);

      resolveJoin();
      await pending;
      expect(jest.getTimerCount()).toBe(1);
    });

    it('socket gone while joining (async adapter): no timer is created, nothing is disconnected again', async () => {
      let resolveJoin!: () => void;
      const socket = makeSocket(validHeaders(), sessionFor(60));
      socket.join.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveJoin = resolve;
        }),
      );

      const pending = gateway.handleConnection(asSocket(socket));
      // the client leaves during the join: Nest calls handleDisconnect
      socket.connected = false;
      gateway.handleDisconnect(asSocket(socket), 'transport close');
      resolveJoin();
      await pending;

      expect(jest.getTimerCount()).toBe(0);
      expect(socket.data.expiryTimer).toBeUndefined();
      jest.advanceTimersByTime(3600_000);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it.each([
      [
        'rejects (async adapter down)',
        () => Promise.reject(new Error('adapter down')),
      ],
      [
        'throws synchronously',
        () => {
          throw new Error('adapter down');
        },
      ],
    ])(
      'join %s: never rejects (Nest does not await it), logs an error with the stack, disconnects, no timer',
      async (_name, impl) => {
        const socket = makeSocket(validHeaders(), sessionFor(60));
        socket.join.mockImplementation(impl as () => Promise<void>);

        await expect(
          gateway.handleConnection(asSocket(socket)),
        ).resolves.toBeUndefined();

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(jest.getTimerCount()).toBe(0);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(String(errorSpy.mock.calls[0][1])).toContain('adapter down');
      },
    );

    it('several tabs of the same user: each socket has its own timer', async () => {
      const tab1 = makeSocket(validHeaders(), sessionFor(60));
      const tab2 = makeSocket(validHeaders(), sessionFor(120));

      await gateway.handleConnection(asSocket(tab1));
      await gateway.handleConnection(asSocket(tab2));
      gateway.handleDisconnect(asSocket(tab1), 'transport close');

      jest.advanceTimersByTime(60_000);
      expect(tab1.disconnect).not.toHaveBeenCalled();
      expect(tab2.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(60_000);
      expect(tab2.disconnect).toHaveBeenCalledTimes(1);
      expect(tab2.disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ------------------------------------------------------------------ handleDisconnect
  describe('handleDisconnect', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    });

    it('clears the expiry timer: a socket that left is never disconnected later, no timer leaks', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));
      await gateway.handleConnection(asSocket(socket));
      expect(jest.getTimerCount()).toBe(1);

      gateway.handleDisconnect(asSocket(socket), 'transport close');

      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(3600_000);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('does not throw for a socket that never got a timer', () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));
      expect(() =>
        gateway.handleDisconnect(asSocket(socket), 'transport close'),
      ).not.toThrow();
    });

    it('does not throw after the timer already fired (expiry path)', async () => {
      const socket = makeSocket(validHeaders(), sessionFor(60));
      await gateway.handleConnection(asSocket(socket));
      jest.advanceTimersByTime(60_000);

      expect(() =>
        gateway.handleDisconnect(
          asSocket(socket),
          'server namespace disconnect',
        ),
      ).not.toThrow();
    });
  });

  // ------------------------------------------------------------------ ping
  describe('ping', () => {
    const findHandler = (event: string) => {
      const proto = WebsocketsGateway.prototype as unknown as Record<
        string,
        unknown
      >;
      const name = Object.getOwnPropertyNames(proto).find(
        (n) =>
          typeof proto[n] === 'function' &&
          Reflect.getMetadata(MESSAGE_METADATA, proto[n] as object) === event,
      );
      expect(name).toBeDefined();
      return (
        proto[name as string] as (data: unknown, client: AppSocket) => unknown
      ).bind(gateway);
    };

    it('answers pong to the sender only, never broadcasts', () => {
      const server = { emit: jest.fn(), to: jest.fn(), in: jest.fn() };
      gateway.server = server as unknown as AppServer;
      const socket = makeSocket(validHeaders(), sessionFor(3600));

      findHandler('ping')('hi', asSocket(socket));

      expect(socket.emit).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith('pong', { message: 'pong' });
      expect(server.emit).not.toHaveBeenCalled();
      expect(server.to).not.toHaveBeenCalled();
      expect(server.in).not.toHaveBeenCalled();
    });
  });
});
