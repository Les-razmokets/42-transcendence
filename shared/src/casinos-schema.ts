import { z } from 'zod';
import { isoDate } from './dates.js';

export const publicCasinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
});

export const adminCasinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type PublicCasino = z.infer<typeof publicCasinoSchema>;
export type AdminCasino = z.infer<typeof adminCasinoSchema>;
export type AdminCasinoInput = z.input<typeof adminCasinoSchema>;
