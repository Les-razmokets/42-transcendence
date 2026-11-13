import { registerAs } from "@nestjs/config";

export const fortyTwoConfig = registerAs('fortyTwo', () => {
  const clientId = process.env.FORTY_TWO_UID;
  const clientSecret = process.env.FORTY_TWO_SECRET;
  const callbackUrl = process.env.FORTY_TWO_CALLBACK_URL;
  const baseUrl = process.env.FORTY_TWO_BASE_URL;
  const authUrl = `${baseUrl}${process.env.FORTY_TWO_AUTHORIZE}`;
  const tokenUrl = `${baseUrl}${process.env.FORTY_TWO_TOKEN}`;
  const profileUrl = `${baseUrl}${process.env.FORTY_TWO_PROFILE}`;
  const timeout: number = Number(process.env.FORTY_TWO_TIMEOUT);

  if (
    !clientId
    || !clientSecret
    || !callbackUrl
    || !baseUrl
    || !process.env.FORTY_TWO_AUTHORIZE
    || !process.env.FORTY_TWO_TOKEN
    || !process.env.FORTY_TWO_PROFILE
    || !timeout
  )
    throw new Error('Missing FORTY_TWO_* variables.');

  return { clientId, clientSecret, callbackUrl, baseUrl, authUrl, tokenUrl, profileUrl, timeout};
})