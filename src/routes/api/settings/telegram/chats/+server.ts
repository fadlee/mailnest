import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { decryptSecret } from '$lib/server/crypto.js';
import { createDb } from '$lib/server/db/index.js';
import { getSettings } from '$lib/server/settings.js';
import { listTelegramChats } from '$lib/server/telegram.js';

function getEnvString(env: unknown, key: string): string {
	const value = (env as Record<string, unknown> | undefined)?.[key];
	return typeof value === 'string' ? value : '';
}

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const body = (await request.json().catch(() => ({}))) as { botToken?: string };
	let token = (body.botToken || '').trim();

	if (!token) {
		const db = createDb(platform.env.DB);
		const settings = await getSettings(db, ['telegram_bot_token_encrypted']);
		const encryptedToken = settings.telegram_bot_token_encrypted;

		if (!encryptedToken) {
			error(400, 'Telegram bot token is not configured');
		}

		const encryptionKey = getEnvString(platform.env, 'ENCRYPTION_KEY');
		if (!encryptionKey) {
			error(400, 'ENCRYPTION_KEY is required to read Telegram bot token');
		}

		token = await decryptSecret(encryptedToken, encryptionKey);
	}

	try {
		return json({ chats: await listTelegramChats(token) });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Failed to get Telegram chats');
	}
};
