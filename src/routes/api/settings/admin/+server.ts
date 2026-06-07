import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb } from '$lib/server/db/index.js';
import { getSetting, setSetting } from '$lib/server/settings.js';

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

	const body = (await request.json().catch(() => ({}))) as { username?: string };
	const username = body.username?.trim() || '';

	if (!username) {
		error(400, 'Username is required');
	}

	const db = createDb(platform.env.DB);
	await setSetting(db, 'admin_username', username);
	return json({ username });
};
