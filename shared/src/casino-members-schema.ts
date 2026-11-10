import { z } from 'zod';
import { CasinoRole } from './enums.js';

export const publicMemberSchema = z.object({
  role: z.enum(CasinoRole),
  pseudo: z.string(),
})
export type PublicMember = z.infer<typeof publicMemberSchema>;