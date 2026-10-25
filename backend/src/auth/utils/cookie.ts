import type { CookieOptions } from 'express';

export const COOKIE_NAME = 'access_token';

export function buildCookieOptions(lifetimeSeconds: number, secure: boolean): CookieOptions {
	return {
	httpOnly: true,
    	sameSite: 'lax',
    	secure: secure,
    	path: '/',
   	maxAge: lifetimeSeconds * 1000,
	}
}