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
  email: z.email(),
  first_name: z.string(),
  last_name: z.string(),
}).transform((data) => {
  const fullLogin = `${PREFIX}${data.login}`;
  return {
    providerAccountId: String(data.id),
    email: data.email.trim().toLowerCase(),
    login: fullLogin,
    firstName: data.first_name,
    lastName: data.last_name,
  };
}).refine((data) => data.login.length <= MAX_LEN, {
  message: `Full login is too long.`,
  path: ['login'],
});
export type FortyTwoProfile = z.infer<typeof fortyTwoProfileSchema>;