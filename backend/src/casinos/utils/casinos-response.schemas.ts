import { z } from 'zod';

export const publicCasinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  adress: z.string(),
});

export const adminCasinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  adress: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date(),
});
