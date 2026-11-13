import { OAUTH_PSEUDO_PREFIX, PSEUDO_MAX_LEN, PSEUDO_PATTERN } from '@transcendence/shared';
import z from 'zod';

export const tokenResponseSchema = z.object({
    access_token: z.string(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const fortyTwoProfileSchema = z.object({
  id: z.number(),
  login: z.string()
    .trim()
    .toLowerCase()
    .regex(PSEUDO_PATTERN)
    .max(PSEUDO_MAX_LEN - OAUTH_PSEUDO_PREFIX.length),
  email: z.email(),
  first_name: z.string(),
  last_name: z.string(),
}).transform((data) => {
  const fullLogin = `${OAUTH_PSEUDO_PREFIX}${data.login}`;
  return {
    providerAccountId: String(data.id),
    email: data.email.trim().toLowerCase(),
    login: fullLogin,
    firstName: data.first_name,
    lastName: data.last_name,
  };
});
export type FortyTwoProfile = z.infer<typeof fortyTwoProfileSchema>;

export const pendingSignupSchema = z.object({
  typ: z.literal('oauth_pending'),
  providerAccountId: z.string(),
  email: z.email(),
  login: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});
export type PendingSignup = z.infer<typeof pendingSignupSchema>;
