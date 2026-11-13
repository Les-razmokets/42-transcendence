import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fortyTwoConfig } from '../forty-two.config';

/*
 * registerAs() returns the factory itself, so we can call it directly with a
 * controlled process.env. setup-env.ts fills every variable with a fake value.
 */

const KEYS = [
  'FORTY_TWO_UID',
  'FORTY_TWO_SECRET',
  'FORTY_TWO_CALLBACK_URL',
  'FORTY_TWO_BASE_URL',
  'FORTY_TWO_AUTHORIZE',
  'FORTY_TWO_TOKEN',
  'FORTY_TWO_PROFILE',
  'FORTY_TWO_TIMEOUT',
  'OAUTH_PENDING_SECRET',
] as const;

describe('fortyTwoConfig', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('builds the full URLs from the base URL and the paths', () => {
    process.env.FORTY_TWO_BASE_URL = 'https://api.intra.test';
    process.env.FORTY_TWO_AUTHORIZE = '/oauth/authorize';
    process.env.FORTY_TWO_TOKEN = '/oauth/token';
    process.env.FORTY_TWO_PROFILE = '/v2/me';

    const config = fortyTwoConfig();

    expect(config.authUrl).toBe('https://api.intra.test/oauth/authorize');
    expect(config.tokenUrl).toBe('https://api.intra.test/oauth/token');
    expect(config.profileUrl).toBe('https://api.intra.test/v2/me');
  });

  it('parses the timeout as a number', () => {
    process.env.FORTY_TWO_TIMEOUT = '3000';
    expect(fortyTwoConfig().timeout).toBe(3000);
  });

  it('exposes the pending secret', () => {
    process.env.OAUTH_PENDING_SECRET = 'pending';
    expect(fortyTwoConfig().pendingSecret).toBe('pending');
  });

  it.each(KEYS)('throws at boot when %s is missing', (key) => {
    delete process.env[key];
    expect(() => fortyTwoConfig()).toThrow(/FORTY_TWO/);
  });

  it.each(['abc', '0', ''])(
    'throws when FORTY_TWO_TIMEOUT is %p (not a positive number)',
    (value) => {
      process.env.FORTY_TWO_TIMEOUT = value;
      expect(() => fortyTwoConfig()).toThrow();
    },
  );
});
