import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { decryptSecret } from '$lib/server/crypto.js';
import { createDb } from '$lib/server/db/index.js';
import { getSettings } from '$lib/server/settings.js';
import { sendTelegramMessage } from '$lib/server/telegram.js';

function getEnvString(env: unknown, key: string): string {
	const value = (env as Record<string, unknown> | undefined)?.[key];
	return typeof value === 'string' ? value : '';
}

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json().catch(() => ({}))) as { chatId?: string };
	const settings = await getSettings(db, [
		'telegram_bot_token_encrypted',
		'telegram_default_chat_id',
		'telegram_bot_username'
	]);
	const encryptedToken = settings.telegram_bot_token_encrypted;
	const chatId = (body.chatId || settings.telegram_default_chat_id || '').trim();

	if (!encryptedToken) {
		error(400, 'Telegram bot token is not configured');
	}
	if (!chatId) {
		error(400, 'Telegram chat ID is required');
	}

	const encryptionKey = getEnvString(platform.env, 'ENCRYPTION_KEY');
	if (!encryptionKey) {
		error(400, 'ENCRYPTION_KEY is required to send Telegram messages');
	}

	try {
		const token = await decryptSecret(encryptedToken, encryptionKey);
		const username = settings.telegram_bot_username ? `@${settings.telegram_bot_username}` : 'Telegram bot';
		await sendTelegramMessage(token, chatId, `MailNest Telegram forwarding is connected via ${username}.`);
		return json({ success: true });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Failed to send Telegram test message');
	}
};
