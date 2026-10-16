import { z } from 'zod';

// response schema for a seat inside a table
export const seatSchema = z.object({
  id: z.string(),
  seatNumber: z.number(),
  status: z.enum(['FREE', 'OCCUPIED']),
});

// response schema for a poker table
// dates are not exposed:
// - createdAt / updatedAt / moneyUpdatedAt: not needed by the front for now
// - deletedAt: deleted tables and seats are never returned, so always null
export const tableSchema = z.object({
  id: z.string(),
  casinoId: z.string(),
  name: z.string(),
  smallBlind: z.number(),
  bigBlind: z.number(),
  maxSeats: z.number(),
  status: z.enum(['OPEN', 'PAUSED']),
  moneyOnTable: z.number(),
  seats: z.array(seatSchema),
  variant: z.enum(['TEXAS_HOLDEM', 'OMAHA']),
});
export type Table = z.infer<typeof tableSchema>;

export const tableSchemaArray = z.array(tableSchema);
