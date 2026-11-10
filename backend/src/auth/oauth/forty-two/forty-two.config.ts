import { registerAs } from "@nestjs/config";

export const fortyTwoConfig = registerAs('fortyTwo', () => {
  const clientId = process.env.FORTY_TWO_UID;
  const clientSecret = process.env.FORTY_TWO_SECRET;
  const callbackUrl = process.env.FORTY_TWO_CALLBACK_URL;
  const baseUrl = process.env.FORTY_TWO_BASE_URL;

  if (!clientId || !clientSecret || !callbackUrl || !baseUrl)
    throw new Error('Missing FORTY_TWO_* variables.');

  return { clientId, clientSecret, callbackUrl, baseUrl};
})