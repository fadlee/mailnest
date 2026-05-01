import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createSecretPreview, encryptSecret } from '$lib/server/crypto.js';
import { createDb } from '$lib/server/db/index.js';
import { setSettings } from '$lib/server/settings.js';
import { loadTelegramConfig, validateTelegramBot } from '$lib/server/telegram.js';

function getEnvString(env: unknown, key: string): string {
	const value = (env as Record<string, unknown> | undefined)?.[key];
	return typeof value === 'string' ? value : '';
}

export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	return json(await loadTelegramConfig(db));
};

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		enabled?: boolean;
		botToken?: string;
		defaultChatId?: string;
	};

	const updates: Record<string, string> = {
		telegram_enabled: body.enabled ? 'true' : 'false',
		telegram_default_chat_id: (body.defaultChatId || '').trim()
	};

	const botToken = (body.botToken || '').trim();
	if (botToken) {
		const encryptionKey = getEnvString(platform.env, 'ENCRYPTION_KEY');
		if (!encryptionKey) {
			error(400, 'ENCRYPTION_KEY is required before saving a Telegram bot token');
		}

		const bot = await validateTelegramBot(botToken).catch((err) => {
			error(400, err instanceof Error ? err.message : 'Invalid Telegram bot token');
		});

		updates.telegram_bot_token_encrypted = await encryptSecret(botToken, encryptionKey);
		updates.telegram_bot_token_preview = createSecretPreview(botToken);
		updates.telegram_bot_username = bot.username || '';
	}

	await setSettings(db, updates);
	return json(await loadTelegramConfig(db));
};
