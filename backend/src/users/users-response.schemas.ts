import { z } from 'zod';

export const publicUserSchema = z.object({
	pseudo: z.string(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;