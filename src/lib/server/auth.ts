/**
 * Simple session-based authentication for MailNest.
 *
 * In production, consider using Cloudflare Access for zero-trust auth.
 * This is a simple fallback for self-hosted or development use.
 *
 * The admin password is stored as a hashed value in D1 settings table.
 * Sessions are stored as cookies with a signed token.
 */

import type { Cookies } from '@sveltejs/kit';

const SESSION_COOKIE = 'mailnest_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function createSession(): Promise<{ token: string; expires: Date }> {
	const token = crypto.randomUUID() + '-' + crypto.randomUUID();
	const expires = new Date(Date.now() + SESSION_DURATION);
	return { token, expires };
}

export function getSessionCookie(cookies: Cookies): string | null {
	return cookies.get(SESSION_COOKIE) || null;
}

export function setSessionCookie(cookies: Cookies, token: string, expires: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
