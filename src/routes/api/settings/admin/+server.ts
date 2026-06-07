import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { getSetting, setSetting } from '$lib/server/settings.js';
import { hashPassword } from '$lib/server/auth.js';

export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const username = (await getSetting(db, 'admin_username')) || '';
	return json({ username });
};

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const body = (await request.json().catch(() => ({}))) as {
		username?: string;
		currentPassword?: string;
		newPassword?: string;
		confirmPassword?: string;
	};
	const username = body.username?.trim() || '';
	const db = createDb(platform.env.DB);

	if (body.newPassword !== undefined || body.confirmPassword !== undefined || body.currentPassword !== undefined) {
		if (!body.currentPassword) {
			error(400, 'Current password is required');
		}
		if (!body.newPassword) {
			error(400, 'New password is required');
		}
		if (body.newPassword !== body.confirmPassword) {
			error(400, 'Passwords do not match');
		}

		const existingPassword = await getSetting(db, 'admin_password_hash');
		if (!existingPassword) {
			error(403, 'Admin password not configured');
		}

		const currentPasswordHash = await hashPassword(body.currentPassword);
		if (currentPasswordHash !== existingPassword) {
			error(401, 'Current password is incorrect');
		}

		const nextPasswordHash = await hashPassword(body.newPassword);
		await setSetting(db, 'admin_password_hash', nextPasswordHash);
		return json({ success: true });
	}

	if (!username) {
		error(400, 'Username is required');
	}

	await setSetting(db, 'admin_username', username);
	return json({ username });
};
