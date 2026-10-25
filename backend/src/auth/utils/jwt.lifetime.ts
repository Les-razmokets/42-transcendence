import { ConfigService } from '@nestjs/config';

export function getJwtLifetimeSeconds(config: ConfigService): number {
  const value = Number(config.getOrThrow<string>('JWT_EXPIRES_IN_SECONDS'));
  if (!Number.isInteger(value) || value <= 0)
    throw new Error('JWT_EXPIRES_IN_SECONDS must be a positive integer');
  return value;
}