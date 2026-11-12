import { MAX } from 'class-validator';
import z from 'zod';

const PREFIX = '42';
const MAX_LEN = 20;

export const tokenResponseSchema = z.object({
    access_token: z.string(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const fortyTwoProfileSchema = z.object({
  id: z.number(),
  login: z.string(),
  email: z.email().min(1),
  firstName: z.string(),
  lastName: z.string(),
}).transform((data) => {
  const fullLogin = `${PREFIX}${data.login}`;
  return {
    providerAccountId: String(data.id),
    email: data.email.trim().toLowerCase(),
    login: fullLogin,
    firstName: data.firstName,
    lastName: data.lastName,
  };
}).refine((data) => data.login.length <= MAX_LEN, {
  message: `Full login is too long.`,
  path: ['login'],
});
export type FortyTwoProfile = z.infer<typeof fortyTwoProfileSchema>;