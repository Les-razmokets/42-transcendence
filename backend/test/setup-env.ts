// Loaded by Jest before every test file (see "setupFiles" in jest-e2e.json and jest.config.cjs).
// Turns rate limiting off so suites that log in many times from one address are not blocked (429).
// auth.throttle.e2e-spec.ts turns it back on for itself.
process.env.THROTTLE_DISABLED = 'true';
// Keeps the expiration cron out of test processes: suites that boot AppModule would otherwise
// each run it on the shared DB. Read once, when AppModule is loaded.
process.env.SCHEDULER_DISABLED = 'true';

export {}; // makes this file a module, which ts-jest with isolatedModules requires
