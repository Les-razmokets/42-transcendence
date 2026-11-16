// Pseudo rules shared by register (backend DTO), the 42 profile schema, and the front-end forms.
export const PSEUDO_MAX_LEN = 20;
export const PSEUDO_PATTERN = /^[a-z0-9_-]+$/;
// Reserved: only accounts created through 42 OAuth get a pseudo starting with it (register refuses it).
export const OAUTH_PSEUDO_PREFIX = '42';
