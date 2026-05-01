# Telegram Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build web-admin configurable Telegram forwarding that stores every incoming email as usual, then forwards the full message body to a configured Telegram chat.

**Architecture:** Store Telegram configuration in the existing D1 `settings` table, with the bot token encrypted using a Worker `ENCRYPTION_KEY` secret. Add focused server helpers for settings, encryption, and Telegram; expose Telegram admin endpoints; add a Settings UI section; call the forwarding helper after email storage succeeds.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Cloudflare Workers, D1, Drizzle ORM, Web Crypto API, Telegram Bot API, TypeScript, Bun.

---

## File Structure

- Create `src/lib/server/settings.ts`: key/value settings table helper used by API and Telegram forwarding.
- Create `src/lib/server/crypto.ts`: Cloudflare-compatible AES-GCM encryption/decryption helper for bot tokens.
- Create `src/lib/server/telegram.ts`: Telegram settings loading, token validation, message formatting/splitting, and email forwarding.
- Create `src/routes/api/settings/telegram/+server.ts`: admin API for reading and saving Telegram settings.
- Create `src/routes/api/settings/telegram/test/+server.ts`: admin API for test messages.
- Modify `src/routes/api/internal/receive-email/+server.ts`: call Telegram forwarding after email and attachment storage succeeds.
- Modify `src/lib/api.ts`: frontend API functions and types for Telegram settings.
- Modify `src/routes/settings/+page.svelte`: add Telegram Forwarding admin UI section.
- Modify `wrangler.toml.example`: document `ENCRYPTION_KEY` as a secret, not a checked-in var.
- Modify `README.md`: add setup notes for Telegram forwarding and `ENCRYPTION_KEY`.

---

### Task 1: Settings Helper

**Files:**
- Create: `src/lib/server/settings.ts`

- [ ] **Step 1: Create the settings helper**

Create `src/lib/server/settings.ts` with this content:

```ts
import { eq, inArray } from 'drizzle-orm';
import { schema } from '$lib/server/db/index.js';
import type { createDb } from '$lib/server/db/index.js';

type Db = ReturnType<typeof createDb>;

export async function getSetting(db: Db, key: string): Promise<string | null> {
	const row = await db
		.select({ value: schema.settings.value })
		.from(schema.settings)
		.where(eq(schema.settings.key, key))
		.limit(1);

	return row[0]?.value ?? null;
}

export async function getSettings(db: Db, keys: string[]): Promise<Record<string, string>> {
	if (keys.length === 0) return {};

	const rows = await db
		.select({ key: schema.settings.key, value: schema.settings.value })
		.from(schema.settings)
		.where(inArray(schema.settings.key, keys));

	return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
	await db
		.insert(schema.settings)
		.values({ key, value, updatedAt: new Date().toISOString() })
		.onConflictDoUpdate({
			target: schema.settings.key,
			set: { value, updatedAt: new Date().toISOString() }
		});
}

export async function setSettings(db: Db, values: Record<string, string>): Promise<void> {
	for (const [key, value] of Object.entries(values)) {
		await setSetting(db, key, value);
	}
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS. If it fails because existing unrelated local changes affect the project, record the error before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/settings.ts
git commit -m "feat(settings): add server settings helper"
```

---

### Task 2: Encryption Helper

**Files:**
- Create: `src/lib/server/crypto.ts`

- [ ] **Step 1: Create the encryption helper**

Create `src/lib/server/crypto.ts` with this content:

```ts
const VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(value: string): Uint8Array {
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
	const binary = atob(padded);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
	if (!secret.trim()) {
		throw new Error('ENCRYPTION_KEY is required to encrypt Telegram bot tokens');
	}

	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
	return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
	const key = await deriveAesKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));

	return [VERSION, base64UrlEncode(iv), base64UrlEncode(new Uint8Array(ciphertext))].join('.');
}

export async function decryptSecret(encrypted: string, secret: string): Promise<string> {
	const [version, ivValue, ciphertextValue] = encrypted.split('.');
	if (version !== VERSION || !ivValue || !ciphertextValue) {
		throw new Error('Encrypted secret format is invalid');
	}

	const key = await deriveAesKey(secret);
	const iv = base64UrlDecode(ivValue);
	const ciphertext = base64UrlDecode(ciphertextValue);
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

	return decoder.decode(plaintext);
}

export function createSecretPreview(value: string): string {
	if (value.length <= 12) return 'configured';
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/crypto.ts
git commit -m "feat(security): add secret encryption helper"
```

---

### Task 3: Telegram Server Helper

**Files:**
- Create: `src/lib/server/telegram.ts`

- [ ] **Step 1: Create Telegram helper**

Create `src/lib/server/telegram.ts` with this content:

```ts
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

interface TelegramSettings extends TelegramConfig {
	encryptedToken: string | null;
}

interface TelegramApiResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
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

export async function forwardEmailToTelegram(params: {
	db: Db;
	env: EnvLike;
	email: StoredEmailForTelegram;
	attachmentCount: number;
}): Promise<void> {
	const settings = await loadTelegramSettings(params.db);
	if (!settings.enabled || !settings.configured || !settings.encryptedToken || !settings.defaultChatId) {
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
	const header = [
		'New email',
		'',
		`To: ${email.toAddress}`,
		`From: ${from}`,
		`Subject: ${email.subject || '(No Subject)'}`,
		`Date: ${email.date}`,
		`Attachments: ${attachmentCount} file(s)`,
		'',
		'Body:'
	].join('\n');

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
	const text = bodyText.trim();
	if (text) return text;

	const html = (bodyHtml || '').trim();
	if (!html) return '(No text body)';

	const stripped = html
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<br\s*\/?\s*>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return stripped || '(No text body)';
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
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/telegram.ts
git commit -m "feat(telegram): add forwarding helper"
```

---

### Task 4: Telegram Settings API

**Files:**
- Create: `src/routes/api/settings/telegram/+server.ts`

- [ ] **Step 1: Create settings API route**

Create `src/routes/api/settings/telegram/+server.ts` with this content:

```ts
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
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/settings/telegram/+server.ts
git commit -m "feat(telegram): add settings api"
```

---

### Task 5: Telegram Test Message API

**Files:**
- Create: `src/routes/api/settings/telegram/test/+server.ts`

- [ ] **Step 1: Create test API route**

Create `src/routes/api/settings/telegram/test/+server.ts` with this content:

```ts
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
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/settings/telegram/test/+server.ts
git commit -m "feat(telegram): add test message api"
```

---

### Task 6: Forward Stored Emails To Telegram

**Files:**
- Modify: `src/routes/api/internal/receive-email/+server.ts`

- [ ] **Step 1: Add import**

In `src/routes/api/internal/receive-email/+server.ts`, add this import near the existing imports:

```ts
import { forwardEmailToTelegram } from '$lib/server/telegram.js';
```

- [ ] **Step 2: Track attachment count**

Find:

```ts
		// Store attachments
		if (parsed?.attachments && parsed.attachments.length > 0) {
```

Replace it with:

```ts
		const attachmentCount = parsed?.attachments?.length || 0;

		// Store attachments
		if (parsed?.attachments && parsed.attachments.length > 0) {
```

- [ ] **Step 3: Call Telegram forwarding after attachments are stored**

Find this block near the end:

```ts
		console.log(
			`[MailNest] Email stored: ${emailId} for=${body.recipientEmail} from=${fromAddress} subject="${subject}" attachments=${parsed?.attachments?.length || 0}`
		);

		return json({ success: true, emailId });
```

Replace it with:

```ts
		await forwardEmailToTelegram({
			db,
			env: platform.env as unknown as Record<string, unknown>,
			email: {
				id: emailId,
				fromAddress,
				fromName,
				toAddress: body.recipientEmail,
				subject,
				bodyText,
				bodyHtml,
				date
			},
			attachmentCount
		});

		console.log(
			`[MailNest] Email stored: ${emailId} for=${body.recipientEmail} from=${fromAddress} subject="${subject}" attachments=${attachmentCount}`
		);

		return json({ success: true, emailId });
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/internal/receive-email/+server.ts
git commit -m "feat(telegram): forward incoming emails"
```

---

### Task 7: Frontend API Client

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add Telegram API types and functions**

In `src/lib/api.ts`, after the `request<T>` helper and before the `// Emails` comment, add:

```ts
export interface TelegramSettings {
	enabled: boolean;
	configured: boolean;
	botUsername: string | null;
	botTokenPreview: string | null;
	defaultChatId: string | null;
}

export interface TelegramSettingsInput {
	enabled: boolean;
	botToken?: string;
	defaultChatId: string;
}

export async function fetchTelegramSettings() {
	return request<TelegramSettings>('/settings/telegram');
}

export async function saveTelegramSettings(data: TelegramSettingsInput) {
	return request<TelegramSettings>('/settings/telegram', {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

export async function sendTelegramTestMessage(chatId?: string) {
	return request<{ success: boolean }>('/settings/telegram/test', {
		method: 'POST',
		body: JSON.stringify({ chatId })
	});
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(telegram): add frontend api client"
```

---

### Task 8: Settings Page UI

**Files:**
- Modify: `src/routes/settings/+page.svelte`

- [ ] **Step 1: Add Telegram icon import**

In the `lucide-svelte` import list in `src/routes/settings/+page.svelte`, add `Send` after `Crown`:

```ts
		Crown,
		Send
```

- [ ] **Step 2: Add Telegram state**

After the email address state block and before `// --- Routing Rules ---`, add:

```ts
	// --- Telegram Forwarding ---
	let telegramLoading = $state(false);
	let telegramSaving = $state(false);
	let telegramTesting = $state(false);
	let telegramError = $state('');
	let telegramSuccess = $state('');
	let telegramSettings = $state<api.TelegramSettings | null>(null);
	let telegramForm = $state({ enabled: false, botToken: '', defaultChatId: '' });
```

- [ ] **Step 3: Load Telegram settings on mount**

Find:

```ts
	onMount(async () => {
		await Promise.all([loadAddresses(), loadRules()]);
	});
```

Replace with:

```ts
	onMount(async () => {
		await Promise.all([loadAddresses(), loadRules(), loadTelegramSettings()]);
	});
```

- [ ] **Step 4: Add Telegram functions**

After `loadAddresses()` and before `addAddress()`, add:

```ts
	async function loadTelegramSettings() {
		telegramLoading = true;
		telegramError = '';
		try {
			telegramSettings = await api.fetchTelegramSettings();
			telegramForm = {
				enabled: telegramSettings.enabled,
				botToken: '',
				defaultChatId: telegramSettings.defaultChatId || ''
			};
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to load Telegram settings';
		} finally {
			telegramLoading = false;
		}
	}

	async function saveTelegramForwarding() {
		telegramSaving = true;
		telegramError = '';
		telegramSuccess = '';
		try {
			telegramSettings = await api.saveTelegramSettings({
				enabled: telegramForm.enabled,
				botToken: telegramForm.botToken || undefined,
				defaultChatId: telegramForm.defaultChatId
			});
			telegramForm.botToken = '';
			telegramForm.defaultChatId = telegramSettings.defaultChatId || '';
			telegramSuccess = 'Telegram settings saved.';
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to save Telegram settings';
		} finally {
			telegramSaving = false;
		}
	}

	async function testTelegramForwarding() {
		telegramTesting = true;
		telegramError = '';
		telegramSuccess = '';
		try {
			await api.sendTelegramTestMessage(telegramForm.defaultChatId || undefined);
			telegramSuccess = 'Test message sent.';
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to send test message';
		} finally {
			telegramTesting = false;
		}
	}
```

- [ ] **Step 5: Add Telegram UI section**

In the markup, insert this section after the Email Addresses section and before the Appearance section:

```svelte
			<!-- ==================== TELEGRAM FORWARDING ==================== -->
			<section>
				<h2 class="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
					<Send class="h-5 w-5" />
					Telegram Forwarding
				</h2>
				<div class="rounded-lg border border-border bg-card p-4">
					{#if telegramLoading}
						<p class="text-sm text-muted-foreground">Loading Telegram settings...</p>
					{:else}
						<div class="mb-4 flex items-center justify-between gap-4">
							<div>
								<p class="font-medium text-card-foreground">Forward all incoming emails</p>
								<p class="text-sm text-muted-foreground">
									Emails are still stored in MailNest. When enabled, the full message body is also sent to Telegram.
								</p>
							</div>
							<button
								class="text-foreground"
								onclick={() => (telegramForm.enabled = !telegramForm.enabled)}
								title={telegramForm.enabled ? 'Disable Telegram forwarding' : 'Enable Telegram forwarding'}
							>
								{#if telegramForm.enabled}
									<ToggleRight class="h-8 w-8 text-primary" />
								{:else}
									<ToggleLeft class="h-8 w-8 text-muted-foreground" />
								{/if}
							</button>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label for="telegram-token" class="mb-1 block text-sm font-medium text-foreground">Bot Token</label>
								<input
									id="telegram-token"
									type="password"
									placeholder={telegramSettings?.configured ? 'Leave blank to keep existing token' : '123456:ABC...'}
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={telegramForm.botToken}
								/>
								{#if telegramSettings?.botTokenPreview}
									<p class="mt-1 text-xs text-muted-foreground">Configured: {telegramSettings.botTokenPreview}</p>
								{/if}
							</div>
							<div>
								<label for="telegram-chat" class="mb-1 block text-sm font-medium text-foreground">Default Chat ID</label>
								<input
									id="telegram-chat"
									type="text"
									placeholder="e.g. -1001234567890"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={telegramForm.defaultChatId}
								/>
							</div>
						</div>

						<div class="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
							Create a bot with @BotFather, then message the bot or add it to a group before sending a test. Group chat IDs usually start with <code>-100</code>.
							{#if telegramSettings?.botUsername}
								<br />Connected bot: <span class="font-medium text-foreground">@{telegramSettings.botUsername}</span>
							{/if}
						</div>

						{#if telegramError}
							<p class="mt-3 text-sm text-destructive">{telegramError}</p>
						{/if}
						{#if telegramSuccess}
							<p class="mt-3 text-sm text-green-600 dark:text-green-400">{telegramSuccess}</p>
						{/if}

						<div class="mt-4 flex flex-wrap gap-2">
							<button
								class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
								disabled={telegramSaving}
								onclick={saveTelegramForwarding}
							>
								<Save class="h-4 w-4" />
								{telegramSaving ? 'Saving...' : 'Save Telegram Settings'}
							</button>
							<button
								class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
								disabled={telegramTesting || !telegramForm.defaultChatId}
								onclick={testTelegramForwarding}
							>
								{telegramTesting ? 'Sending...' : 'Send Test Message'}
							</button>
						</div>
					{/if}
				</div>
			</section>
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/settings/+page.svelte
git commit -m "feat(telegram): add settings ui"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `wrangler.toml.example`

- [ ] **Step 1: Document secret in `wrangler.toml.example`**

Open `wrangler.toml.example`. Add this comment near the vars/secrets area, keeping existing style:

```toml
# Telegram bot tokens are encrypted before being stored in D1.
# Configure this as a Worker secret, not as a checked-in var:
#   bunx wrangler secret put ENCRYPTION_KEY
```

- [ ] **Step 2: Document Telegram setup in README**

Add this section to `README.md` near setup/configuration instructions:

```md
## Telegram Forwarding

MailNest can forward every incoming email to a Telegram chat after storing it in the inbox.

1. Create a Telegram bot with `@BotFather`.
2. Configure an encryption key as a Worker secret:

   ```bash
   bunx wrangler secret put ENCRYPTION_KEY
   ```

3. Deploy MailNest, then open Settings -> Telegram Forwarding.
4. Enter the bot token and default chat ID.
5. Send a test message from the Settings page.

The bot token is encrypted before it is stored in the D1 `settings` table. The raw token is never returned to the browser.

Telegram limits one message to about 4096 characters. MailNest forwards the full email body by splitting long emails across multiple Telegram messages.
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md wrangler.toml.example
git commit -m "docs: document telegram forwarding"
```

---

### Task 10: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run project checks**

Run:

```bash
bun run check
bun run build
```

Expected: both commands PASS.

- [ ] **Step 2: Inspect git history and status**

Run:

```bash
git log --oneline -8
git status --short
```

Expected: recent commits include all Telegram implementation commits. Working tree may still contain unrelated pre-existing user changes; do not stage or modify them.

- [ ] **Step 3: Manual verification checklist**

Use this checklist after deploying or running with a configured Cloudflare environment:

```text
[ ] Set ENCRYPTION_KEY via wrangler secret.
[ ] Open Settings -> Telegram Forwarding.
[ ] Saving an invalid bot token fails with a useful error.
[ ] Saving a valid bot token succeeds and only shows token preview.
[ ] Test message arrives in Telegram.
[ ] Incoming short email is stored and forwarded.
[ ] Incoming long email is stored and arrives as multiple Telegram chunks.
[ ] Disabling Telegram stores email without forwarding.
[ ] Breaking Telegram chat ID does not prevent email storage.
```

- [ ] **Step 4: Final commit only if verification changes files**

If verification required code or docs changes, commit them with a Conventional Commit message. If no files changed, do not create an empty commit.
