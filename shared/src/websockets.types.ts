import { z } from 'zod';

export const wsErrorCodeSchema = z.enum([
  'NOT_FOUND',
  'INVALID',
  'INTERNAL',
  'RATE_LIMITED',
]);

export type WsErrorCode = z.infer<typeof wsErrorCodeSchema>;

export const wsAckSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    code: wsErrorCodeSchema,
  }),
]);

export type WsAck = z.infer<typeof wsAckSchema>;

export const WS_EVENTS = {
  TABLE_JOIN: 'table:join',
  TABLE_LEAVE: 'table:leave',
  STAFF_JOIN: 'staff:join',
  STAFF_LEAVE: 'staff:leave',
  PING: 'ping',
  PONG: 'pong',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface TableJoinPayload {
  tableId: string;
  casinoId: string;
}

export interface TableLeavePayload {
  tableId: string;
}

export interface StaffJoinPayload {
  casinoId: string;
}

export interface StaffLeavePayload {
  casinoId: string;
}

export interface WsClientToServerEvents {
  [WS_EVENTS.TABLE_JOIN]: (
    payload: TableJoinPayload,
    ack: (res: WsAck) => void,
  ) => void;
  [WS_EVENTS.TABLE_LEAVE]: (payload: TableLeavePayload) => void;
  [WS_EVENTS.STAFF_JOIN]: (
    payload: StaffJoinPayload,
    ack: (res: WsAck) => void,
  ) => void;
  [WS_EVENTS.STAFF_LEAVE]: (payload: StaffLeavePayload) => void;
  [WS_EVENTS.PING]: (payload: string) => void;
}

export interface WsServerToClientEvents {
  [WS_EVENTS.PONG]: (
    payload: { message: string },
  ) => void;
}