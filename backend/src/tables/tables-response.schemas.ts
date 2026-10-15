import { z } from 'zod';

// response schema for a seat inside a table
export const seatSchema = z.object({
  seatNumber: z.number(),
});

export const tableSchema = z.object({
  id: z.string(),
  casinoId: z.string(),
  name: z.string(),
  smallBlind: z.number(),
  bigBlind: z.number(),
  maxSeats: z.number(),
  status: z.string(),
  moneyOnTable: z.number(),
  seats: z.array(seatSchema),
});
export type Table = z.infer<typeof tableSchema>;