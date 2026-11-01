import { z } from 'zod';

export const pingSchema = z.object({ ok: z.boolean() });
export type Ping = z.infer<typeof pingSchema>;