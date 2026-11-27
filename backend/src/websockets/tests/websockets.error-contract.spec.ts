import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { WsErrorCode } from '@transcendence/shared';
import { WsLoggingExceptionFilter } from '../websockets.logging-exception-filter';
import { WebSocketsException } from '../websockets.exception';
import {
  extractLogReason,
  formatLogReason,
} from '../utils/websocket.filter-utils';

/*
 * Challenge tests for the WS error contract (issue 3, decisions D2, D3, D6).
 * Written from the RULES, not from the implementation:
 *  D2  fail by throwing; the filter logs ONCE, then replies through the ack with
 *      exactly { ok: false, code }; no 'exception' event; no ack -> log, no reply.
 *  D3  BadRequestException (ValidationPipe) -> INVALID, warn.
 *  D6  the client never learns more than the code; the log keeps the real reason.
 *  Log safety: client-controlled text in a log is escaped and capped.
 */

const USER_ID = 'user-1111';
const SOCKET_ID = 'socket-2222';
const EVENT = 'table:join';
const CLIENT_SECRET = 'CLIENT-PAYLOAD-MUST-NOT-BE-LOGGED';

type Ack = jest.Mock<(res: unknown) => void>;

describe('WS error contract (challenge)', () => {
  let filter: WsLoggingExceptionFilter;
  let warn: jest.SpiedFunction<Logger['warn']>;
  let error: jest.SpiedFunction<Logger['error']>;
  let socket: { id: string; data: { user: { id: string } }; emit: jest.Mock };

  beforeEach(() => {
    filter = new WsLoggingExceptionFilter();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    socket = {
      id: SOCKET_ID,
      data: { user: { id: USER_ID } },
      emit: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Same argument layout Nest builds for a WS handler: [client, data, ack, pattern].
  const run = (exception: unknown, ack: unknown = jest.fn()) => {
    const host = new ExecutionContextHost([
      socket,
      { tableId: CLIENT_SECRET, casinoId: CLIENT_SECRET },
      ack,
      EVENT,
    ]);
    host.setType('ws');
    filter.catch(exception, host);
    return ack as Ack;
  };

  const allLogText = () =>
    [...warn.mock.calls, ...error.mock.calls]
      .flat()
      .map((part) => String(part))
      .join('\n');
  const logCount = () => warn.mock.calls.length + error.mock.calls.length;

  // ------------------------------------------------------------ code mapping
  describe('which code the client gets', () => {
    it.each<Exclude<WsErrorCode, 'INTERNAL'>>([
      'NOT_FOUND',
      'INVALID',
      'RATE_LIMITED',
    ])('WebSocketsException(%s) -> exactly { ok: false, code: %s }', (code) => {
      const ack = run(new WebSocketsException(code, 'some internal reason'));
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack.mock.calls[0]).toStrictEqual([{ ok: false, code }]);
    });

    it('BadRequestException (ValidationPipe) -> INVALID', () => {
      const ack = run(new BadRequestException(['tableId must be a UUID']));
      expect(ack.mock.calls[0]).toStrictEqual([{ ok: false, code: 'INVALID' }]);
    });

    // D6: the handler translates assertAccess errors; the filter must NOT quietly
    // turn a raw HTTP 404/403 into a harmless-looking NOT_FOUND.
    it.each([
      ['NotFoundException', new NotFoundException('casino not found')],
      ['ForbiddenException', new ForbiddenException('not a member')],
      ['plain WsException', new WsException('forgot the subclass')],
      ['plain Error', new Error('db down')],
      ['a thrown string', 'boom'],
      ['undefined', undefined],
      ['null', null],
    ])('%s -> INTERNAL', (_label, thrown) => {
      const ack = run(thrown);
      expect(ack.mock.calls[0]).toStrictEqual([
        { ok: false, code: 'INTERNAL' },
      ]);
    });
  });

  // ------------------------------------------------------------ what leaks
  describe('the client learns nothing but the code (D6)', () => {
    it('the reason never reaches the ack', () => {
      const ack = run(
        new WebSocketsException(
          'NOT_FOUND',
          'user is not a member of casino X',
        ),
      );
      expect(JSON.stringify(ack.mock.calls)).not.toContain('member');
    });

    it('an internal error message never reaches the ack', () => {
      const ack = run(new Error('password=hunter2 connection refused'));
      expect(JSON.stringify(ack.mock.calls)).not.toContain('hunter2');
    });

    it('validation details never reach the ack', () => {
      const ack = run(
        new BadRequestException(['property evil should not exist']),
      );
      expect(JSON.stringify(ack.mock.calls)).not.toContain('evil');
    });

    it('"casino missing" and "not a member" give byte-identical acks', () => {
      const a = run(
        new WebSocketsException('NOT_FOUND', 'casino does not exist'),
      );
      const b = run(new WebSocketsException('NOT_FOUND', 'not a member'));
      expect(JSON.stringify(a.mock.calls)).toBe(JSON.stringify(b.mock.calls));
    });

    it('never emits any event on the socket (no "exception" event)', () => {
      run(new WebSocketsException('NOT_FOUND'));
      run(new BadRequestException('x'));
      run(new Error('x'));
      expect(socket.emit).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------ logging
  describe('logging', () => {
    it('expected refusal: exactly one warn, no error, with the real reason', () => {
      run(new WebSocketsException('NOT_FOUND', 'not a member of casino X'));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
      expect(allLogText()).toContain('not a member of casino X');
    });

    it('validation error: exactly one warn, no error, with ALL field messages', () => {
      run(
        new BadRequestException([
          'tableId must be a UUID',
          'property extra should not exist',
        ]),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
      expect(allLogText()).toContain('tableId must be a UUID');
      expect(allLogText()).toContain('property extra should not exist');
    });

    it('unknown error: exactly one error, no warn, with the stack', () => {
      const boom = new Error('db down');
      run(boom);
      expect(error).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
      expect(allLogText()).toContain(boom.stack as string);
    });

    it('a raw NotFoundException is an ERROR (a handler forgot to translate it)', () => {
      run(new NotFoundException());
      expect(error).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it.each([
      ['refusal', new WebSocketsException('NOT_FOUND', 'r')],
      ['validation', new BadRequestException('x')],
      ['unknown', new Error('x')],
    ])('%s: the log names the user, the socket and the event', (_l, thrown) => {
      run(thrown);
      const text = allLogText();
      expect(text).toContain(USER_ID);
      expect(text).toContain(SOCKET_ID);
      expect(text).toContain(EVENT);
    });

    it.each([
      ['refusal', new WebSocketsException('NOT_FOUND', 'r')],
      ['validation', new BadRequestException('x')],
      ['unknown', new Error('x')],
    ])('%s: the client payload is never logged', (_l, thrown) => {
      run(thrown);
      expect(allLogText()).not.toContain(CLIENT_SECRET);
    });

    it('no reason: the log does not print "undefined"', () => {
      run(new WebSocketsException('NOT_FOUND'));
      expect(allLogText()).not.toContain('undefined');
    });

    it('a thrown non-Error does not crash the filter and is still logged', () => {
      expect(() => run(undefined)).not.toThrow();
      expect(() => run({ weird: true })).not.toThrow();
      expect(error).toHaveBeenCalledTimes(2);
    });
  });

  // ------------------------------------------------------------ the ack itself
  describe('the ack callback', () => {
    it.each([
      ['undefined (client sent no callback)', undefined],
      ['an object', { not: 'a function' }],
      ['a string', 'ack'],
      ['a number', 42],
    ])('ack is %s: no crash, still logged once', (_l, notAFunction) => {
      expect(() =>
        run(new WebSocketsException('NOT_FOUND'), notAFunction),
      ).not.toThrow();
      expect(logCount()).toBe(1);
    });

    it('the log is written even if calling the ack throws', () => {
      const exploding = jest.fn(() => {
        throw new Error('encoder exploded');
      });
      try {
        run(new Error('db down'), exploding);
      } catch {
        // whether the filter rethrows is not the point here
      }
      expect(error).toHaveBeenCalled();
      expect(allLogText()).toContain('db down');
    });

    it('the pattern (last argument) is never mistaken for the ack', () => {
      // No ack: Nest still puts the pattern LAST. If the filter took "the last
      // argument" as the ack it would try to call the string 'table:join'.
      expect(() =>
        run(new WebSocketsException('NOT_FOUND'), undefined),
      ).not.toThrow();
    });
  });

  // ------------------------------------------------------------ log injection
  describe('client-controlled text in logs', () => {
    it('a newline in a field name cannot forge a second log line', () => {
      run(
        new BadRequestException([
          'property x\n[Nest] ERROR FAKE LINE should not exist',
        ]),
      );
      const logged = warn.mock.calls.flat().map(String).join('');
      expect(logged).not.toMatch(/\n/);
      expect(logged).not.toMatch(/\r/);
    });

    it('a carriage return cannot forge a line either', () => {
      run(new BadRequestException(['property a\rFAKE should not exist']));
      expect(warn.mock.calls.flat().map(String).join('')).not.toMatch(/\r/);
    });

    it('a 100 000-char field name does not flood the log', () => {
      run(
        new BadRequestException([
          `property ${'A'.repeat(100_000)} should not exist`,
        ]),
      );
      const logged = warn.mock.calls.flat().map(String).join('');
      expect(logged.length).toBeLessThan(2_000);
    });

    it('a field name full of escapable characters stays bounded', () => {
      // Escaping can double the length: the bound must still hold.
      run(new BadRequestException([`property ${'\n'.repeat(50_000)}`]));
      const logged = warn.mock.calls.flat().map(String).join('');
      expect(logged.length).toBeLessThan(2_000);
    });

    it.each([
      ['a plain string response', new BadRequestException('just a string')],
      ['an object without message', new BadRequestException({ foo: 1 })],
      [
        'a message array with non-strings',
        new BadRequestException({ message: [{ nested: true }, 3, null] }),
      ],
      ['an empty message array', new BadRequestException({ message: [] })],
    ])('odd ValidationPipe shape (%s): INVALID, no crash', (_l, thrown) => {
      let ack: Ack | undefined;
      expect(() => (ack = run(thrown))).not.toThrow();
      expect(ack?.mock.calls[0]).toStrictEqual([
        { ok: false, code: 'INVALID' },
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------ helpers
  describe('formatLogReason / extractLogReason', () => {
    it('output never contains a raw newline, CR, or unescaped quote breakout', () => {
      const out = formatLogReason('a\nb\r"c" d');
      expect(out).not.toMatch(/[\n\r]/);
      expect(() => JSON.parse(out)).not.toThrow();
    });

    it('caps long input and still returns valid JSON', () => {
      const out = formatLogReason('x'.repeat(10_000));
      expect(out.length).toBeLessThan(1_000);
      expect(() => JSON.parse(out)).not.toThrow();
    });

    it('short input is kept whole', () => {
      expect(JSON.parse(formatLogReason('tableId must be a UUID'))).toBe(
        'tableId must be a UUID',
      );
    });

    it('custom cap is respected', () => {
      expect(JSON.parse(formatLogReason('abcdef', 3)).startsWith('abc')).toBe(
        true,
      );
      expect(JSON.parse(formatLogReason('abcdef', 3))).not.toContain('d');
    });

    it('extract keeps every message of an array, not just the first', () => {
      const out = JSON.parse(
        extractLogReason(new BadRequestException(['first', 'second', 'third'])),
      ) as string;
      expect(out).toContain('first');
      expect(out).toContain('second');
      expect(out).toContain('third');
    });

    it('extract never produces "[object Object]"', () => {
      expect(
        extractLogReason(new BadRequestException({ message: [{ a: 1 }] })),
      ).not.toContain('[object Object]');
    });
  });

  // ------------------------------------------------------------ the exception
  describe('WebSocketsException', () => {
    it('exposes code and reason to the filter', () => {
      const e = new WebSocketsException('NOT_FOUND', 'why');
      expect(e.code).toBe('NOT_FOUND');
      expect(e.reason).toBe('why');
    });

    it('the base WsException "error" is the code only, never the reason', () => {
      // If anything ever falls back to Nest's default WS handling, this is what
      // the client would see.
      const e = new WebSocketsException('NOT_FOUND', 'secret reason');
      expect(e.getError()).toBe('NOT_FOUND');
      expect(e.message).not.toContain('secret');
    });

    it('is still a WsException (Nest treats it as a WS error)', () => {
      expect(new WebSocketsException('INVALID')).toBeInstanceOf(WsException);
    });

    it('INTERNAL cannot be thrown by a handler (compile-time)', () => {
      // @ts-expect-error INTERNAL is reserved for the filter
      const e = new WebSocketsException('INTERNAL');
      expect(e).toBeDefined();
    });
  });
});
