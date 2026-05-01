# Telegram Forwarding Design

## Goal

Add a web-admin configurable Telegram forwarding feature for MailNest. When enabled, every incoming email is still stored in MailNest and then forwarded to a configured Telegram chat.

The feature uses the existing `settings` table for configuration. It does not add routing filters or change existing routing rule behavior in the first implementation.

## Current Project Context

Relevant existing code:

- `src/lib/server/db/schema.ts` defines the `settings` table as key/value storage.
- `src/routes/settings/+page.svelte` contains the current Settings admin page.
- `src/routes/api/internal/receive-email/+server.ts` parses and stores incoming email.
- `scripts/postbuild-email-handler.mjs` injects the Cloudflare Email Worker handler and self-calls `/api/internal/receive-email`.
- `routing_rules` exists, but email receive currently stores mail directly and does not execute routing rules.

## Scope

In scope:

- Add Telegram forwarding configuration to the web admin Settings page.
- Store Telegram configuration in the existing `settings` table.
- Encrypt the Telegram bot token before storing it.
- Validate bot tokens with Telegram `getMe` before saving.
- Send a test Telegram message from the admin UI/API.
- Forward every stored incoming email to the configured Telegram chat when enabled.
- Forward the full email body by default, split across multiple Telegram messages when needed.
- Keep email storage successful even if Telegram forwarding fails.

Out of scope for this implementation:

- Routing-rule based Telegram actions.
- Per-address, sender, subject, or body filtering.
- Attachment upload to Telegram.
- Custom message templates.
- Delivery log tables or per-email forwarding status UI.

## Configuration Model

Use the existing `settings` table with these keys:

- `telegram_enabled`: `true` or `false`.
- `telegram_bot_token_encrypted`: encrypted bot token.
- `telegram_bot_token_preview`: masked token identifier for UI display.
- `telegram_bot_username`: username returned by Telegram `getMe`.
- `telegram_default_chat_id`: destination chat ID for all forwarded emails.

Use a Worker secret for encryption:

- `ENCRYPTION_KEY`: secret key used to encrypt/decrypt Telegram bot tokens.

The bot token is never returned to the browser. Admin API responses only expose `telegram_bot_token_preview`, `telegram_bot_username`, `telegram_default_chat_id`, `telegram_enabled`, and whether the integration is configured.

## Encryption Requirements

Token encryption happens server-side before writing to `settings`.

The implementation should add a small server helper for encryption/decryption. The helper should work in Cloudflare Workers using Web Crypto APIs.

Expected behavior:

- Saving a new bot token requires `ENCRYPTION_KEY` to be configured.
- If `ENCRYPTION_KEY` is missing, the save request fails with a clear error.
- Sending Telegram messages requires successful decryption.
- If decryption fails, email storage remains successful and Telegram forwarding logs a warning.

## Admin API

Add Telegram-specific settings endpoints:

```text
GET  /api/settings/telegram
POST /api/settings/telegram
POST /api/settings/telegram/test
```

### GET `/api/settings/telegram`

Returns sanitized configuration:

```json
{
  "enabled": true,
  "configured": true,
  "botUsername": "mailnest_bot",
  "botTokenPreview": "123456...xYz",
  "defaultChatId": "-1001234567890"
}
```

### POST `/api/settings/telegram`

Accepts:

```json
{
  "enabled": true,
  "botToken": "123456:ABC...",
  "defaultChatId": "-1001234567890"
}
```

Behavior:

- `enabled` and `defaultChatId` update their settings directly.
- If `botToken` is present and non-empty, validate it with Telegram `getMe`.
- If validation succeeds, encrypt and store the token, store token preview, and store bot username.
- If `botToken` is omitted or empty, keep the existing token unchanged.
- Do not return the raw bot token.

### POST `/api/settings/telegram/test`

Accepts:

```json
{
  "chatId": "-1001234567890"
}
```

Behavior:

- Uses the stored encrypted token.
- Sends a short test message to the provided `chatId`, or the configured default chat ID if omitted.
- Returns success when Telegram accepts the message.
- Returns clear errors for missing token, missing chat ID, invalid token, or Telegram API failure.

## Admin UI

Add a "Telegram Forwarding" section to `src/routes/settings/+page.svelte`.

Fields and controls:

- Enabled toggle.
- Bot token password input.
- Bot username/status display.
- Default chat ID text input.
- Save button.
- Send test message button.

UI behavior:

- Show whether a bot token is already configured.
- Show token preview instead of the full token.
- Allow updating the chat ID without re-entering the bot token.
- Allow replacing the token by entering a new token.
- Show save/test errors in the section.
- Mention that the bot must be messaged directly or added to a group before Telegram can send to that chat.

## Email Forwarding Flow

Modify `src/routes/api/internal/receive-email/+server.ts` after the email and attachments have been stored.

Flow:

```text
Receive email
Parse MIME
Store email in D1
Store attachments in R2/D1 if present
Load Telegram settings
If Telegram is enabled and configured:
  Decrypt bot token
  Format full email message
  Split message into Telegram-safe chunks
  Send all chunks to default chat ID
Return success for email storage
```

Telegram forwarding is best-effort:

- A Telegram failure does not roll back email storage.
- A Telegram failure does not make `/api/internal/receive-email` return a failure.
- Failures are logged with enough context to debug, without logging raw bot tokens.

## Message Format

Default forwarding sends the full message body, not a truncated preview.

Telegram has a message length limit of roughly 4096 characters. The implementation should split long emails into multiple messages while preserving the full body text.

First message format:

```text
New email

To: support@example.com
From: Sender <sender@example.com>
Subject: Example subject
Date: 2026-05-01T10:30:00.000Z
Attachments: 2 file(s)

Body:
<full body starts here>
```

Continuation messages:

```text
New email continued (2/3)

<next body chunk>
```

Formatting rules:

- Use plain text for MVP; do not use Telegram HTML or Markdown parse mode.
- Prefer `bodyText` when present.
- If only HTML exists, derive a readable plain-text fallback with simple tag stripping.
- If the body is empty, send `(No text body)`.
- Include attachment count only; do not upload attachments to Telegram in this version.

## Telegram Service Helper

Add a server-only Telegram helper, likely `src/lib/server/telegram.ts`.

Responsibilities:

- Validate a bot token with `getMe`.
- Send a plain-text Telegram message using `sendMessage`.
- Split long messages into Telegram-safe chunks.
- Format email forwarding messages.
- Load and decrypt Telegram settings before sending.

The helper should expose a high-level function similar to:

```ts
forwardEmailToTelegram(db, env, email, attachmentCount)
```

This keeps the receive-email route focused on storage and delegates Telegram-specific logic.

## Settings Helper

Add a server-only settings helper, likely `src/lib/server/settings.ts`.

Responsibilities:

- Read one setting by key.
- Read several settings as a key/value object.
- Upsert a setting.
- Hide Drizzle key/value table details from feature code.

This reduces repeated settings-table boilerplate across the Telegram API and email forwarding path.

## Error Handling

Admin API errors:

- Missing database returns service unavailable.
- Missing `ENCRYPTION_KEY` when saving token returns a clear configuration error.
- Invalid Telegram bot token returns a validation error.
- Missing chat ID for test send returns a validation error.
- Telegram API failures return the Telegram error message when safe.

Email receive errors:

- Telegram settings missing: skip forwarding.
- Telegram disabled: skip forwarding.
- Token decrypt error: log warning and skip forwarding.
- Telegram send error: log warning and continue.
- Message chunk failure: log warning and continue email processing.

## Security

- Never expose the raw bot token to the frontend.
- Never log the raw bot token.
- Store only encrypted token material in `settings`.
- Store a masked token preview only for admin visibility.
- Require existing admin authentication for all Telegram settings endpoints.
- Keep `ENCRYPTION_KEY` out of git and configure it as a Worker secret.

## Testing And Verification

Automated checks where practical:

- Typecheck the project.
- Test settings helper behavior if there is an existing test setup.
- Test message splitting to ensure long bodies are not truncated.
- Test formatter output for body text, HTML fallback, empty body, and attachment count.

Manual verification:

- Save invalid bot token and confirm the UI/API rejects it.
- Save valid bot token and confirm only a preview is returned.
- Send a test message to a valid chat ID.
- Send a test message to an invalid chat ID and confirm a useful error.
- Receive a short email and confirm it is stored and forwarded.
- Receive a long email over Telegram's single-message limit and confirm all chunks arrive.
- Disable Telegram forwarding and confirm incoming email is stored but not forwarded.
- Temporarily break Telegram credentials and confirm email storage still succeeds.

## Future Extensions

This design intentionally keeps routing rules unchanged. Later, the Telegram helper can be reused to add routing-rule actions such as:

- Forward only selected recipients to Telegram.
- Forward only matching sender domains or subjects.
- Send different rules to different chat IDs.
- Add per-email delivery logs.
- Add custom templates.
- Upload selected attachments to Telegram.
