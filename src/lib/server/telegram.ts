import { decryptSecret } from '$lib/server/crypto.js';
import { getSettings } from '$lib/server/settings.js';
import type { createDb } from '$lib/server/db/index.js';

type Db = ReturnType<typeof createDb>;

type EnvLike = Record<string, unknown>;

export interface StoredEmailForTelegram {
	id: string;
	fromAddress: string;
	fromName: string;
	toAddress: string;
	subject: string;
	bodyText: string;
	bodyHtml: string | null;
	date: string;
}

export interface TelegramConfig {
	enabled: boolean;
	configured: boolean;
	botUsername: string | null;
	botTokenPreview: string | null;
	defaultChatId: string | null;
}

export interface TelegramChatOption {
	id: string;
	type: string;
	title: string;
	username: string | null;
}

interface TelegramSettings extends TelegramConfig {
	encryptedToken: string | null;
}

interface TelegramApiResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
}

interface TelegramUpdateChat {
	id: number | string;
	type?: string;
	title?: string;
	username?: string;
	first_name?: string;
	last_name?: string;
}

interface TelegramUpdate {
	message?: { chat?: TelegramUpdateChat };
	edited_message?: { chat?: TelegramUpdateChat };
	channel_post?: { chat?: TelegramUpdateChat };
	my_chat_member?: { chat?: TelegramUpdateChat };
}

const TELEGRAM_LIMIT = 4096;
const SAFE_CHUNK_SIZE = 3900;

const SETTING_KEYS = [
	'telegram_enabled',
	'telegram_bot_token_encrypted',
	'telegram_bot_token_preview',
	'telegram_bot_username',
	'telegram_default_chat_id'
];

export async function loadTelegramConfig(db: Db): Promise<TelegramConfig> {
	const settings = await loadTelegramSettings(db);
	return {
		enabled: settings.enabled,
		configured: settings.configured,
		botUsername: settings.botUsername,
		botTokenPreview: settings.botTokenPreview,
		defaultChatId: settings.defaultChatId
	};
}

async function loadTelegramSettings(db: Db): Promise<TelegramSettings> {
	const settings = await getSettings(db, SETTING_KEYS);
	const encryptedToken = settings.telegram_bot_token_encrypted || null;
	const defaultChatId = settings.telegram_default_chat_id || null;

	return {
		enabled: settings.telegram_enabled === 'true',
		configured: Boolean(encryptedToken && defaultChatId),
		encryptedToken,
		botUsername: settings.telegram_bot_username || null,
		botTokenPreview: settings.telegram_bot_token_preview || null,
		defaultChatId
	};
}

export async function validateTelegramBot(token: string): Promise<{ username: string | null }> {
	const result = await telegramRequest<{ username?: string }>(token, 'getMe', {});
	return { username: result.username || null };
}

export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
	await telegramRequest(token, 'sendMessage', {
		chat_id: chatId,
		text,
		disable_web_page_preview: true
	});
}

export async function listTelegramChats(token: string): Promise<TelegramChatOption[]> {
	const updates = await telegramRequest<TelegramUpdate[]>(token, 'getUpdates', {});
	const chats = new Map<string, TelegramChatOption>();

	for (const update of updates) {
		const chat =
			update.message?.chat ||
			update.edited_message?.chat ||
			update.channel_post?.chat ||
			update.my_chat_member?.chat;

		if (!chat) continue;

		const id = String(chat.id);
		chats.set(id, {
			id,
			type: chat.type || 'unknown',
			title: getChatTitle(chat),
			username: chat.username || null
		});
	}

	return [...chats.values()];
}

export async function forwardEmailToTelegram(params: {
	db: Db;
	env: EnvLike;
	email: StoredEmailForTelegram;
	attachmentCount: number;
}): Promise<void> {
	const settings = await loadTelegramSettings(params.db);
	if (!settings.enabled || !settings.configured || !settings.encryptedToken || !settings.defaultChatId) {
		console.info(
			`[MailNest] Telegram forwarding skipped for email=${params.email.id}: enabled=${settings.enabled} configured=${settings.configured} hasToken=${Boolean(settings.encryptedToken)} hasChat=${Boolean(settings.defaultChatId)}`
		);
		return;
	}

	try {
		const encryptionKey = getEnvString(params.env, 'ENCRYPTION_KEY');
		const token = await decryptSecret(settings.encryptedToken, encryptionKey);
		const chunks = formatTelegramEmailMessages(params.email, params.attachmentCount);

		for (const chunk of chunks) {
			await sendTelegramMessage(token, settings.defaultChatId, chunk);
		}
	} catch (err) {
		console.warn(
			`[MailNest] Telegram forwarding failed for email=${params.email.id}: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

export function formatTelegramEmailMessages(email: StoredEmailForTelegram, attachmentCount: number): string[] {
	const from = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
	const body = normalizeEmailBody(email.bodyText, email.bodyHtml);
	const headerLines = [
		`New email to ${email.toAddress}`,
		'',
		`From: ${from}`,
		`To: ${email.toAddress}`,
		`Subject: ${email.subject || '(No Subject)'}`,
		...(attachmentCount > 0 ? [`Attachments: ${attachmentCount}`] : []),
		''
	];
	const header = headerLines.join('\n');

	const firstPrefix = `${header}\n`;
	const firstBodySize = Math.max(500, SAFE_CHUNK_SIZE - firstPrefix.length);
	const bodyChunks = splitText(body, firstBodySize, SAFE_CHUNK_SIZE);
	const total = bodyChunks.length;

	return bodyChunks.map((chunk, index) => {
		if (index === 0) return `${firstPrefix}${chunk}`.slice(0, TELEGRAM_LIMIT);
		return `New email continued (${index + 1}/${total})\n\n${chunk}`.slice(0, TELEGRAM_LIMIT);
	});
}

export function normalizeEmailBody(bodyText: string, bodyHtml: string | null): string {
	const text = cleanExtractedText(bodyText);
	if (text) return text;

	const html = (bodyHtml || '').trim();
	if (!html) return '(No text body)';

	return htmlToReadableText(html) || '(No text body)';
}

function htmlToReadableText(html: string): string {
	const withLinks = html.replace(
		/<a\b[^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
		(_match, href: string, label: string) => {
			const text = stripInlineHtml(label);
			const url = decodeHtmlEntities(href.trim());
			if (!text) return url;
			if (!url || text === url) return text;
			return `${text} (${url})`;
		}
	);

	const stripped = withLinks
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<\/?(?:h[1-6]|table|thead|tbody|tfoot)\b[^>]*>/gi, '\n\n')
		.replace(/<br\s*\/?\s*>/gi, '\n')
		.replace(/<li\b[^>]*>/gi, '\n- ')
		.replace(/<\/li>/gi, '\n')
		.replace(/<\/?(?:p|section|article|header|footer|blockquote)\b[^>]*>/gi, '\n\n')
		.replace(/<\/?(?:div|tr)\b[^>]*>/gi, '\n')
		.replace(/<\/t[dh]>/gi, ' ')
		.replace(/<t[dh]\b[^>]*>/gi, ' ')
		.replace(/<[^>]+>/g, '');

	return cleanExtractedText(decodeHtmlEntities(stripped));
}

function stripInlineHtml(value: string): string {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();
}

function cleanExtractedText(value: string): string {
	const lines = value
		.replace(/\r/g, '')
		.split('\n')
		.map((line) => line.replace(/[\t ]+/g, ' ').trim())
		.filter(Boolean);

	const cleaned: string[] = [];
	for (const line of lines) {
		if (cleaned[cleaned.length - 1] === line) continue;
		cleaned.push(line);
	}

	return cleaned.join('\n').trim();
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function splitText(text: string, firstChunkSize: number, nextChunkSize: number): string[] {
	const chunks: string[] = [];
	let remaining = text || '(No text body)';
	let size = firstChunkSize;

	while (remaining.length > 0) {
		if (remaining.length <= size) {
			chunks.push(remaining);
			break;
		}

		let cutAt = remaining.lastIndexOf('\n', size);
		if (cutAt < Math.floor(size * 0.6)) cutAt = remaining.lastIndexOf(' ', size);
		if (cutAt < Math.floor(size * 0.6)) cutAt = size;

		chunks.push(remaining.slice(0, cutAt).trimEnd());
		remaining = remaining.slice(cutAt).trimStart();
		size = nextChunkSize;
	}

	return chunks.length > 0 ? chunks : ['(No text body)'];
}

async function telegramRequest<T>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
	const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const data = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null;

	if (!response.ok || !data?.ok) {
		throw new Error(data?.description || `Telegram ${method} failed with HTTP ${response.status}`);
	}

	return data.result as T;
}

function getEnvString(env: EnvLike, key: string): string {
	const value = env[key];
	return typeof value === 'string' ? value : '';
}

function getChatTitle(chat: TelegramUpdateChat): string {
	if (chat.title) return chat.title;
	if (chat.username) return `@${chat.username}`;
	return [chat.first_name, chat.last_name].filter(Boolean).join(' ') || String(chat.id);
}
