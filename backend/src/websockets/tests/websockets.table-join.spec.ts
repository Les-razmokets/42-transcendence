import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  ArgumentMetadata,
  BadRequestException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_METADATA } from '@nestjs/websockets/constants';
import { WS_EVENTS } from '@transcendence/shared';
import { WebsocketsGateway } from '../websockets.gateway';
import { WsTableJoinService } from '../websockets.join-table.service';
import { WebSocketsException } from '../utils/websockets.exception';
import { TableJoinDto } from '../dto/websockets.dto';
import { SessionService } from '../../auth/session.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AppSocket } from '../utils/websockets.types';

/*
 * Challenge tests for `table:join` (issue 3, step 4), written from the RULES:
 *  - any authenticated user may join `table:<tableId>` if the table exists, is not
 *    deleted, its casino is not deleted, and it belongs to the casino named;
 *  - the client's casinoId is a CLAIM: the casino checked is the table's real one;
 *  - every refusal is the same NOT_FOUND for the client, with a distinct reason
 *    for the log (D6);
 *  - a database failure is NOT a refusal: it must surface as itself (-> INTERNAL);
 *  - success: join exactly `table:<tableId>`, then return exactly { ok: true };
 *  - payload validated as a DTO: UUIDs, nothing missing, nothing extra.
 */

const CASINO_LYON = '11111111-1111-4111-8111-111111111111';
const CASINO_PARIS = '22222222-2222-4222-8222-222222222222';
const TABLE = '33333333-3333-4333-8333-333333333333';

type Row = {
  casinoId: string;
  deletedAt: Date | null;
  casino: { deletedAt: Date | null };
};
const liveTable = (overrides: Partial<Row> = {}): Row => ({
  casinoId: CASINO_LYON,
  deletedAt: null,
  casino: { deletedAt: null },
  ...overrides,
});

// ====================================================================== service
describe('WsTableJoinService.assertCanJoin (challenge)', () => {
  let findUnique: jest.Mock<(args: unknown) => Promise<Row | null>>;
  let service: WsTableJoinService;

  beforeEach(() => {
    findUnique = jest.fn<(args: unknown) => Promise<Row | null>>();
    service = new WsTableJoinService({
      pokerTable: { findUnique },
    } as unknown as PrismaService);
  });

  const refusal = async (p: Promise<void>) => {
    const err = await p.then(
      () => {
        throw new Error('expected a refusal, got success');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(WebSocketsException);
    return err as WebSocketsException;
  };

  it('active table in an active casino, matching ids -> allowed', async () => {
    findUnique.mockResolvedValue(liveTable());
    await expect(
      service.assertCanJoin(CASINO_LYON, TABLE),
    ).resolves.toBeUndefined();
  });

  it('looks the table up by the TABLE id', async () => {
    findUnique.mockResolvedValue(liveTable());
    await service.assertCanJoin(CASINO_LYON, TABLE);
    expect(JSON.stringify(findUnique.mock.calls)).toContain(TABLE);
  });

  describe('refusals', () => {
    const cases: [string, Row | null, string][] = [
      ['table does not exist', null, CASINO_LYON],
      [
        'table is deleted',
        liveTable({ deletedAt: new Date('2026-01-01') }),
        CASINO_LYON,
      ],
      [
        'table belongs to another casino',
        liveTable({ casinoId: CASINO_PARIS }),
        CASINO_LYON,
      ],
      [
        'casino is deleted, table is not (the seeded Paris trap)',
        liveTable({
          casinoId: CASINO_PARIS,
          casino: { deletedAt: new Date('2026-01-01') },
        }),
        CASINO_PARIS,
      ],
      [
        'table deleted AND in another casino',
        liveTable({ casinoId: CASINO_PARIS, deletedAt: new Date() }),
        CASINO_LYON,
      ],
    ];

    it.each(cases)('%s -> NOT_FOUND', async (_l, row, claimedCasino) => {
      findUnique.mockResolvedValue(row);
      const err = await refusal(service.assertCanJoin(claimedCasino, TABLE));
      expect(err.code).toBe('NOT_FOUND');
    });

    it('the client cannot launder a deleted casino by naming a live one', async () => {
      // Table really lives in deleted Paris; the client claims live Lyon.
      findUnique.mockResolvedValue(
        liveTable({
          casinoId: CASINO_PARIS,
          casino: { deletedAt: new Date() },
        }),
      );
      const err = await refusal(service.assertCanJoin(CASINO_LYON, TABLE));
      expect(err.code).toBe('NOT_FOUND');
    });

    it('what the client could see (getError) is identical for every refusal', async () => {
      const seen = new Set<string>();
      for (const [, row, claimed] of cases) {
        findUnique.mockResolvedValue(row);
        const err = await refusal(service.assertCanJoin(claimed, TABLE));
        seen.add(JSON.stringify(err.getError()));
      }
      expect(seen.size).toBe(1);
    });

    it('each refusal carries a reason for the log, and they are distinct', async () => {
      const reasons = new Set<string>();
      for (const [, row, claimed] of cases.slice(0, 4)) {
        findUnique.mockResolvedValue(row);
        const err = await refusal(service.assertCanJoin(claimed, TABLE));
        expect(err.reason).toBeTruthy();
        reasons.add(err.reason as string);
      }
      expect(reasons.size).toBe(4);
    });
  });

  it('a database failure is NOT disguised as a refusal', async () => {
    const dbDown = new Error('connection refused');
    findUnique.mockRejectedValue(dbDown);
    const err = await service
      .assertCanJoin(CASINO_LYON, TABLE)
      .catch((e: unknown) => e);
    expect(err).toBe(dbDown);
    expect(err).not.toBeInstanceOf(WebSocketsException);
  });
});

// ====================================================================== handler
describe('table:join handler (challenge)', () => {
  let gateway: WebsocketsGateway;
  let assertCanJoin: jest.Mock<WsTableJoinService['assertCanJoin']>;
  let socket: {
    id: string;
    data: { user: { id: string } };
    join: jest.Mock<(room: string) => Promise<void> | void>;
    emit: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    assertCanJoin = jest.fn<WsTableJoinService['assertCanJoin']>();
    assertCanJoin.mockResolvedValue(undefined);
    gateway = new WebsocketsGateway(
      {
        getOrThrow: () => 'https://app.example.test',
      } as unknown as ConfigService,
      { verify: jest.fn() } as unknown as SessionService,
      { assertCanJoin } as unknown as WsTableJoinService,
    );
    socket = {
      id: 'sock-1',
      data: { user: { id: 'u1' } },
      join: jest.fn<(room: string) => Promise<void> | void>(),
      emit: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const handlerName = () => {
    const proto = WebsocketsGateway.prototype as unknown as Record<
      string,
      unknown
    >;
    const names = Object.getOwnPropertyNames(proto).filter(
      (n) =>
        typeof proto[n] === 'function' &&
        Reflect.getMetadata(MESSAGE_METADATA, proto[n] as object) ===
          WS_EVENTS.TABLE_JOIN,
    );
    expect(names).toHaveLength(1);
    return names[0];
  };
  const join = (payload: unknown) =>
    (
      gateway as unknown as Record<
        string,
        (data: unknown, client: AppSocket) => Promise<unknown>
      >
    )[handlerName()](payload, socket as unknown as AppSocket);

  const payload = { casinoId: CASINO_LYON, tableId: TABLE };

  it('exactly one handler is subscribed to "table:join"', () => {
    handlerName();
  });

  it('allowed -> joins exactly table:<tableId> and returns exactly { ok: true }', async () => {
    await expect(join(payload)).resolves.toStrictEqual({ ok: true });
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith(`table:${TABLE}`);
  });

  it('the room is built from the TABLE id, never the casino id', async () => {
    await join(payload);
    expect(String(socket.join.mock.calls[0][0])).not.toContain(CASINO_LYON);
  });

  it('asks the access check with (casinoId, tableId) in that order', async () => {
    await join(payload);
    expect(assertCanJoin).toHaveBeenCalledWith(CASINO_LYON, TABLE);
  });

  it('checks BEFORE joining', async () => {
    const order: string[] = [];
    assertCanJoin.mockImplementation(() => {
      order.push('check');
      return Promise.resolve();
    });
    socket.join.mockImplementation(() => {
      order.push('join');
    });
    await join(payload);
    expect(order).toEqual(['check', 'join']);
  });

  it('refused -> rejects with the refusal, never joins, never acks ok', async () => {
    const refused = new WebSocketsException('NOT_FOUND', 'table is deleted');
    assertCanJoin.mockRejectedValue(refused);
    await expect(join(payload)).rejects.toBe(refused);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('a DB failure propagates unchanged (filter -> INTERNAL), never joins', async () => {
    const boom = new Error('db down');
    assertCanJoin.mockRejectedValue(boom);
    await expect(join(payload)).rejects.toBe(boom);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('an async join failure is awaited: no { ok: true } for a join that failed', async () => {
    socket.join.mockImplementation(() =>
      Promise.reject(new Error('adapter down')),
    );
    await expect(join(payload)).rejects.toThrow('adapter down');
  });

  it('never emits anything itself (the reply is the ack)', async () => {
    await join(payload);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('the payload parameter is the DTO CLASS (otherwise nothing is validated)', () => {
    const types = Reflect.getMetadata(
      'design:paramtypes',
      WebsocketsGateway.prototype,
      handlerName(),
    ) as unknown[];
    expect(types[0]).toBe(TableJoinDto);
  });
});

// ====================================================================== DTO
describe('TableJoinDto validation (challenge)', () => {
  // Same options as the global pipe in app.config.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const meta: ArgumentMetadata = { type: 'body', metatype: TableJoinDto };
  const validate = (value: unknown) => pipe.transform(value, meta);

  it('valid payload passes', async () => {
    await expect(
      validate({ casinoId: CASINO_LYON, tableId: TABLE }),
    ).resolves.toBeInstanceOf(TableJoinDto);
  });

  it.each([
    ['missing tableId', { casinoId: CASINO_LYON }],
    ['missing casinoId', { tableId: TABLE }],
    ['empty object', {}],
    ['tableId not a UUID', { casinoId: CASINO_LYON, tableId: 'abc' }],
    ['casinoId not a UUID', { casinoId: '1', tableId: TABLE }],
    ['tableId is a number', { casinoId: CASINO_LYON, tableId: 42 }],
    ['tableId is an array', { casinoId: CASINO_LYON, tableId: [TABLE] }],
    ['tableId is an object', { casinoId: CASINO_LYON, tableId: { id: TABLE } }],
    ['tableId is null', { casinoId: CASINO_LYON, tableId: null }],
    ['extra field', { casinoId: CASINO_LYON, tableId: TABLE, admin: true }],
    [
      'UUID with surrounding spaces',
      { casinoId: CASINO_LYON, tableId: ` ${TABLE} ` },
    ],
    [
      'SQL-ish tableId',
      { casinoId: CASINO_LYON, tableId: `${TABLE}' OR '1'='1` },
    ],
  ])('%s -> BadRequestException', async (_l, value) => {
    await expect(validate(value)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['a string', 'table-123'],
    ['null', null],
    ['undefined', undefined],
    ['an array', [CASINO_LYON, TABLE]],
    ['a number', 7],
  ])('payload that is %s -> BadRequestException', async (_l, value) => {
    await expect(validate(value)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a __proto__ key does not sneak through', async () => {
    const value = JSON.parse(
      `{"casinoId":"${CASINO_LYON}","tableId":"${TABLE}","__proto__":{"admin":true}}`,
    ) as unknown;
    const out = (await validate(value).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (out) expect(out.admin).toBeUndefined();
  });
});
