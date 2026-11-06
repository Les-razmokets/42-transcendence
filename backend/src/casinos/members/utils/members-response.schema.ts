import { CasinoRole } from '@transcendence/shared';
import { z } from 'zod';

export const publicMemberSchema = z.object({
  role: z.string(),
  pseudo: z.string(),
})
export type PublicMember = z.infer<typeof publicMemberSchema>;