import { OAUTH_PSEUDO_PREFIX, PSEUDO_MAX_LEN, PSEUDO_PATTERN } from '@transcendence/shared';
import z from 'zod';

// Trust boundary with 42: everything 42 sends is validated here before reaching our code.

// response of POST /oauth/token: only the access token is kept
export const tokenResponseSchema = z.object({
    access_token: z.string(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

// response of GET /v2/me, mapped to our own field names.
// The login must pass our pseudo rules once prefixed with "42", hence the length minus the prefix.
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

// payload of the pending signup token, checked in completeFortyTwoSignup.
// typ tells it apart from any other JWT; unknown claims (iat, exp…) are dropped.
export const pendingSignupSchema = z.object({
  typ: z.literal('oauth_pending'),
  providerAccountId: z.string(),
  email: z.email(),
  login: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});
export type PendingSignup = z.infer<typeof pendingSignupSchema>;
