import { z } from 'zod';

// Public view of the casino informations
export const publicCasinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
});
export type PublicCasino = z.infer<typeof publicCasinoSchema>;

// Admin view of the casino informations
export const adminCasinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type AdminCasino = z.infer<typeof adminCasinoSchema>;
