import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import {
	hashPassword,
	createSession,
	setSessionCookie,
	clearSessionCookie,
	getSessionCookie
} from '$lib/server/auth.js';
import { getSetting, setSetting } from '$lib/server/settings.js';
import { eq, like } from 'drizzle-orm';

// POST /api/auth - Login
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as { username?: string; password?: string };
	const username = body.username?.trim();

	if (!username) {
		error(400, 'Username is required');
	}
	if (!body.password) {
		error(400, 'Password is required');
	}

	try {
		const [existingPassword, configuredUsername] = await Promise.all([
			getSetting(db, 'admin_password_hash'),
			getSetting(db, 'admin_username')
		]);

		if (!existingPassword) {
			error(403, 'Admin password not configured. Please run install.sh first.');
		}
		if (!configuredUsername) {
			error(403, 'Admin username not configured. Please run install.sh first.');
		}

		const passwordHash = await hashPassword(body.password);
		if (username !== configuredUsername || passwordHash !== existingPassword) {
			error(401, 'Invalid username or password');
		}

		// Create session
		const session = await createSession();

		await db
			.insert(schema.settings)
			.values({
				key: `session_${session.token}`,
				value: session.expires.toISOString(),
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: schema.settings.key,
				set: {
					value: session.expires.toISOString(),
					updatedAt: new Date().toISOString()
				}
			});

		setSessionCookie(cookies, session.token, session.expires);

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Auth error:', err);
		error(500, 'Authentication failed');
	}
};

// PUT /api/auth - Reset password (requires secret key)
export const PUT: RequestHandler = async ({ request, cookies, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		secretKey?: string;
		username?: string;
		password?: string;
		confirmPassword?: string;
	};
	const username = body.username?.trim();

	if (!body.secretKey) {
		error(400, 'Secret key is required');
	}
	if (!username) {
		error(400, 'Username is required');
	}
	if (!body.password) {
		error(400, 'New password is required');
	}
	if (body.password !== body.confirmPassword) {
		error(400, 'Passwords do not match');
	}

	try {
		// Validate secret key
		const [secretSetting] = await db
			.select()
			.from(schema.settings)
			.where(eq(schema.settings.key, 'setup_secret_hash'))
			.limit(1);

		if (!secretSetting) {
			error(403, 'Secret key not configured. Use ./reset-password.sh from terminal instead.');
		}

		const secretHash = await hashPassword(body.secretKey);
		if (secretHash !== secretSetting.value) {
			error(401, 'Invalid secret key');
		}

		const passwordHash = await hashPassword(body.password);
		const now = new Date().toISOString();

		await Promise.all([
			setSetting(db, 'admin_username', username),
			db
				.insert(schema.settings)
				.values({ key: 'admin_password_hash', value: passwordHash, updatedAt: now })
				.onConflictDoUpdate({
					target: schema.settings.key,
					set: { value: passwordHash, updatedAt: now }
				})
		]);

		// Clear all existing sessions
		const sessions = await db
			.select({ key: schema.settings.key })
			.from(schema.settings)
			.where(like(schema.settings.key, 'session_%'));

		for (const s of sessions) {
			await db.delete(schema.settings).where(eq(schema.settings.key, s.key));
		}

		// Create new session for this user
		const session = await createSession();

		await db.insert(schema.settings).values({
			key: `session_${session.token}`,
			value: session.expires.toISOString(),
			updatedAt: now
		});

		setSessionCookie(cookies, session.token, session.expires);

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Reset password error:', err);
		error(500, 'Password reset failed');
	}
};

// DELETE /api/auth - Logout
export const DELETE: RequestHandler = async ({ cookies, platform }) => {
	const token = getSessionCookie(cookies);

	if (token && platform?.env?.DB) {
		const db = createDb(platform.env.DB);
		try {
			await db.delete(schema.settings).where(eq(schema.settings.key, `session_${token}`));
		} catch {
			// Ignore cleanup errors
		}
	}

	clearSessionCookie(cookies);
	return json({ success: true });
};

// GET /api/auth - Check session
export const GET: RequestHandler = async ({ cookies, platform }) => {
	if (!platform?.env?.DB) {
		return json({ authenticated: false });
	}

	const db = createDb(platform.env.DB);
	const token = getSessionCookie(cookies);

	if (!token) {
		return json({ authenticated: false });
	}

	try {
		const [session] = await db
			.select()
			.from(schema.settings)
			.where(eq(schema.settings.key, `session_${token}`))
			.limit(1);

		if (!session) {
			clearSessionCookie(cookies);
			return json({ authenticated: false });
		}

		if (new Date(session.value) < new Date()) {
			await db.delete(schema.settings).where(eq(schema.settings.key, `session_${token}`));
			clearSessionCookie(cookies);
			return json({ authenticated: false });
		}

		return json({ authenticated: true });
	} catch {
		return json({ authenticated: false });
	}
};
