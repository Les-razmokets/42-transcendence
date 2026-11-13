// Loaded by Jest before every test file (see "setupFiles" in jest-e2e.json and jest.config.cjs).
// Turns rate limiting off so suites that log in many times from one address are not blocked (429).
// auth.throttle.e2e-spec.ts turns it back on for itself.
process.env.THROTTLE_DISABLED = 'true';
// Keeps the expiration cron out of test processes: suites that boot AppModule would otherwise
// each run it on the shared DB. Read once, when AppModule is loaded.
process.env.SCHEDULER_DISABLED = 'true';
// 42 OAuth: fixed fake values so tests never depend on real credentials and never reach 42.
// fortyTwoConfig throws at boot if any of these is missing. Set before ConfigModule loads
// ../.env, and ConfigModule never overrides a variable that is already set.
process.env.FORTY_TWO_UID = 'test-uid';
process.env.FORTY_TWO_SECRET = 'test-client-secret';
process.env.FORTY_TWO_CALLBACK_URL = 'http://localhost/api/auth/42/callback';
process.env.FORTY_TWO_BASE_URL = 'https://api.intra.test';
process.env.FORTY_TWO_AUTHORIZE = '/oauth/authorize';
process.env.FORTY_TWO_TOKEN = '/oauth/token';
process.env.FORTY_TWO_PROFILE = '/v2/me';
process.env.FORTY_TWO_TIMEOUT = '5000';
process.env.OAUTH_PENDING_SECRET = 'test-pending-secret-not-the-jwt-secret-0123456789';

export {}; // makes this file a module, which ts-jest with isolatedModules requires
