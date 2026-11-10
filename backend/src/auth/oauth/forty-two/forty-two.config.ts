import { registerAs } from "@nestjs/config";

export const fortyTwoConfig = registerAs('fortyTwo', () => {
  const clientId = process.env.FORTY_TWO_UID;
  const clientSecret = process.env.FORTY_TWO_SECRET;
  const callbackUrl = process.env.FORTY_TWO_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl)
    throw new Error('Missing FORTY_TWO_* variables.');

  return { clientId, clientSecret, callbackUrl };
})