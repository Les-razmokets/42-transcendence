import { Server, Socket, DefaultEventsMap } from 'socket.io';
import { VerifiedSession } from '../auth/utils/verified.session';

export type AppServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
export type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

export interface SocketData {
  user: VerifiedSession;
  expiryTimer?: NodeJS.Timeout;
}
