import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  ArgumentsHost,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsLoggingExceptionFilter } from '../websockets.logging-exception-filter';
import { WebSocketsException } from '../utils/websockets.exception';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.USER

/*
 * Written against the issue 2 specification, updated for issue 3 (D2):
 *  - no WebSocket error is silent: every one is logged exactly once, with the event,
 *    the socket and the user;
 *  - expected refusals (WebSocketsException) are warnings without a stack, everything
 *    else (including a plain WsException) is an error WITH the stack;
 *  - the client gets { ok: false, code } through its ack callback, never an
 *    'exception' event, never internal details, never its own data echoed back;
 *  - what the client sent is never written to the logs.
 * See websockets.error-contract.spec.ts for the full issue 3 contract.
 */

const SECRET_DATA = 'S3CRET-CLIENT-PAYLOAD';

describe('WsLoggingExceptionFilter', () => {
  let filter: WsLoggingExceptionFilter;
  let client: {
    id: string;
    data: { user: { id: string; role: Role; exp: number } };
    emit: jest.Mock<(event: string, payload: unknown) => boolean>;
  };
  let ack: jest.Mock<(res: unknown) => void>;
  let host: ArgumentsHost;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;
  let errorSpy: jest.SpiedFunction<Logger['error']>;
  let logSpy: jest.SpiedFunction<Logger['log']>;

  const allLogText = () =>
    [logSpy, warnSpy, errorSpy]
      .flatMap((spy) => spy.mock.calls.flat())
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

  // the single payload sent to the client: through the ack, never as an event
  const sentPayload = () => {
    expect(client.emit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    return ack.mock.calls[0][0] as Record<string, unknown>;
  };

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    filter = new WsLoggingExceptionFilter();
    client = {
      id: 'sock-1',
      data: { user: { id: 'u1', role: Role.USER, exp: 0 } },
      emit: jest.fn<(event: string, payload: unknown) => boolean>(),
    };
    ack = jest.fn<(res: unknown) => void>();
    // Nest's WS handler arguments: [client, data, ack, pattern]
    const args = () => [client, { secret: SECRET_DATA }, ack, 'join_table'];
    host = {
      getType: () => 'ws',
      getArgs: args,
      getArgByIndex: (i: number) => args()[i],
      switchToWs: () => ({
        getClient: () => client,
        getData: () => ({ secret: SECRET_DATA }),
        getPattern: () => 'join_table',
      }),
      switchToHttp: () => {
        throw new Error('not an HTTP context');
      },
      switchToRpc: () => {
        throw new Error('not an RPC context');
      },
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('expected refusal: WebSocketsException', () => {
    it('sends only its code to the client, never the reason nor the client data', () => {
      filter.catch(new WebSocketsException('NOT_FOUND', 'table is full'), host);

      expect(sentPayload()).toStrictEqual({ ok: false, code: 'NOT_FOUND' });
    });

    it('is logged once as a warning with event, socket, user and reason, and no stack', () => {
      filter.catch(new WebSocketsException('NOT_FOUND', 'table is full'), host);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain('join_table');
      expect(message).toContain('sock-1');
      expect(message).toContain('u1');
      expect(message).toContain('table is full');
      expect(warnSpy.mock.calls[0]).toHaveLength(1);
    });
  });

  describe('unexpected errors', () => {
    const unexpected: [string, () => unknown, string][] = [
      ['a plain Error (bug)', () => new Error('kaboom'), 'kaboom'],
      [
        'a plain WsException (handler forgot the subclass)',
        () => new WsException('table is full'),
        'table is full',
      ],
      [
        'the @Roles() misuse from RolesGuard',
        () =>
          new Error(
            '@Roles is for HTTP-only; for WebSocket handlers, check permissions in the handler',
          ),
        'HTTP-only',
      ],
      [
        'an HTTP exception thrown in a WS handler (silent by default in Nest)',
        () => new ForbiddenException('not your casino'),
        'not your casino',
      ],
      [
        'an UnauthorizedException (the issue 1 trap)',
        () => new UnauthorizedException(),
        'Unauthorized',
      ],
      ['a thrown string', () => 'just a string', 'just a string'],
    ];

    it.each(unexpected)(
      '%s: the client gets INTERNAL, never the internal message',
      (_name, make, internal) => {
        filter.catch(make(), host);

        const payload = sentPayload();
        expect(payload).toStrictEqual({ ok: false, code: 'INTERNAL' });
        expect(JSON.stringify(payload)).not.toContain(internal);
      },
    );

    it.each(unexpected)(
      '%s: logged EXACTLY ONCE, as an error, with the event, socket and user',
      (_name, make) => {
        filter.catch(make(), host);

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const message = String(errorSpy.mock.calls[0][0]);
        expect(message).toContain('join_table');
        expect(message).toContain('sock-1');
        expect(message).toContain('u1');
      },
    );

    it.each(unexpected.filter(([name]) => name !== 'a thrown string'))(
      '%s: the error log carries the stack trace',
      (_name, make) => {
        const exception = make() as Error;

        filter.catch(exception, host);

        expect(errorSpy).toHaveBeenCalled();
        expect(errorSpy.mock.calls.map((c) => c[1])).toContain(exception.stack);
      },
    );

    it('a thrown non-Error value still shows up in the error log', () => {
      filter.catch('just a string', host);

      expect(errorSpy).toHaveBeenCalled();
      expect(allLogText()).toContain('just a string');
    });
  });

  describe('client data', () => {
    it.each([
      ['WebSocketsException', () => new WebSocketsException('NOT_FOUND')],
      ['WsException', () => new WsException('nope')],
      ['Error', () => new Error('kaboom')],
      ['HttpException', () => new ForbiddenException()],
    ])(
      '%s: what the client sent is never logged nor echoed back',
      (_name, make) => {
        filter.catch(make(), host);

        expect(allLogText()).not.toContain(SECRET_DATA);
        expect(JSON.stringify(ack.mock.calls)).not.toContain(SECRET_DATA);
        expect(sentPayload()).not.toHaveProperty('cause');
      },
    );
  });
});
