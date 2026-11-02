// Loaded by Jest before every e2e test file (see "setupFiles" in jest-e2e.json).
// Turns rate limiting off so suites that log in many times from one address are not blocked (429).
// auth.throttle.e2e-spec.ts turns it back on for itself.
process.env.THROTTLE_DISABLED = 'true';

export {}; // makes this file a module, which ts-jest with isolatedModules requires
