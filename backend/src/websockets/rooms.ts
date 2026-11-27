/**
 * Socket.IO room names, built in ONE place.
 *
 * A room is a server-side group of sockets: `server.to(room).emit(...)` reaches every
 * socket in it. Always build names with these helpers, never by hand: a typo in a
 * room name does not fail, the message simply reaches nobody.
 *
 * Each kind of room has its own prefix ("user:", later "table:", "casino:"), so ids
 * from different tables can never collide, even with hand-written UUIDs in the seed.
 */

// Personal room of a user: every connected tab of that user joins it
// (see WebsocketsGateway.handleConnection). Used for notifications and to reach
// all sockets of one user. Keyed by the user id: immutable and not personal data,
// unlike the pseudo (can change) or the email.
export function userRoom(id: string): string {
  return `user:${id}`;
}

export function tableRoom(id: string): string {
  return `table:${id}`;
}

export function casinoStaffRoom(id: string): string {
  return `casino:${id}:staff`;
}