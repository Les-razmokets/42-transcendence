import { Server, Socket, DefaultEventsMap } from 'socket.io';
import { VerifiedSession } from '../auth/utils/verified.session';
import { WsClientToServerEvents, WsServerToClientEvents } from '@transcendence/shared';

/*
 * Typed versions of the Socket.IO Server and Socket. Use AppServer / AppSocket
 * everywhere in the backend instead of the raw Server / Socket, otherwise
 * `socket.data` is `any` and typos are not caught.
 *
 * Socket.IO takes 4 positional generics:
 *   1. ClientToServerEvents  events the client emits
 *   2. ServerToClientEvents  events the server emits
 *   3. InterServerEvents     messages between several backend instances (serverSideEmit);
 *                            unused: we run a single backend
 *   4. SocketData            the type of socket.data (below)
 * DefaultEventsMap means "not typed yet".
 */
export type AppServer = Server<
  WsClientToServerEvents,
  WsServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
export type AppSocket = Socket<
  WsClientToServerEvents,
  WsServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

/**
 * Per-connection state kept in the server's memory (`socket.data`).
 * It is NEVER sent to the client, which is why this type lives in the backend and
 * not in @transcendence/shared: shared is for what travels over the wire.
 */
export interface SocketData {
  // Set by the handshake middleware: always present in handlers and handleConnection.
  user: VerifiedSession;
  // Set in handleConnection, after the middleware: undefined until then.
  // NodeJS.Timeout, not number: in Node, setTimeout returns an object.
  expiryTimer?: NodeJS.Timeout;
}
