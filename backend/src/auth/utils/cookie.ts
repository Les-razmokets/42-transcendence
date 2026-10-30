import type { CookieOptions } from 'express';

export const COOKIE_NAME = 'access_token';

// helper function to build cookies with the right options
export function buildCookieOptions(
  lifetimeSeconds: number,
  secure: boolean,
): CookieOptions {
  return {
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie (protects against XSS attacks)
    sameSite: 'lax', // Restricts cookie sharing on cross-site requests (moderate protection against CSRF attacks)
    secure: secure, // Ensures the cookie is only transmitted over HTTPS (true in production)
    path: '/', // Specifies the URL path for which the cookie is valid (here, the entire site)
    maxAge: lifetimeSeconds * 1000, // Cookie lifetime in milliseconds
  };
}
