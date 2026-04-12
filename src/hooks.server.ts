import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionCookie, clearSessionCookie } from '$lib/server/auth.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/login/reset', '/api/auth', '/api/internal'];

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Skip auth check for public routes and static assets
	if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) || pathname.startsWith('/_app')) {
		return resolve(event);
	}

	// If D1 is not available (local dev without wrangler), skip auth
	if (!event.platform?.env?.DB) {
		return resolve(event);
	}

	const token = getSessionCookie(event.cookies);

	if (!token) {
		// Check if password has been set up yet
		const db = createDb(event.platform.env.DB);
		try {
			const [setting] = await db
				.select()
				.from(schema.settings)
				.where(eq(schema.settings.key, 'admin_password_hash'))
				.limit(1);

			if (!setting) {
				// No password set yet - allow access to setup
				// The login page will handle first-time setup
			}
		} catch {
			// DB not ready yet, skip auth
			return resolve(event);
		}

		throw redirect(303, '/login');
	}

	// Validate session
	const db = createDb(event.platform.env.DB);
	try {
		const [session] = await db
			.select()
			.from(schema.settings)
			.where(eq(schema.settings.key, `session_${token}`))
			.limit(1);

		if (!session || new Date(session.value) < new Date()) {
			// Session expired or invalid
			clearSessionCookie(event.cookies);
			if (session) {
				await db.delete(schema.settings).where(eq(schema.settings.key, `session_${token}`));
			}
			throw redirect(303, '/login');
		}
	} catch (err) {
		// Re-throw redirects
		if (err && typeof err === 'object' && 'status' in err) throw err;
		// DB error, skip auth
		return resolve(event);
	}

	return resolve(event);
};
