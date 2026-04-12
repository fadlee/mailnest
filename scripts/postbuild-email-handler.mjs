/**
 * MailNest Post-Build Script
 *
 * Patches the SvelteKit-compiled _worker.js to inject a Cloudflare Email Worker
 * email() handler alongside the existing fetch() handler.
 *
 * This allows a single Worker to handle both HTTP requests (dashboard/API)
 * and inbound emails (via Cloudflare Email Routing catch-all).
 *
 * The injected email handler:
 * 1. Resolves the recipient against the D1 users table
 * 2. Reads the raw MIME content
 * 3. Self-calls the worker's fetch() to POST to /api/internal/receive-email
 *    (which handles full MIME parsing with postal-mime and storage)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerPath = resolve('.svelte-kit', 'cloudflare', '_worker.js');
const marker = '/* MAILNEST_EMAIL_HANDLER */';
const exportBlockPattern = /export\s*\{\s*worker_default as default\s*\};\s*$/m;

console.log('[MailNest] Patching _worker.js with email handler...');

const source = readFileSync(workerPath, 'utf8');

// Skip if already patched
if (source.includes(marker)) {
	console.log('[MailNest] Already patched. Skipping.');
	process.exit(0);
}

if (!exportBlockPattern.test(source)) {
	console.error('[MailNest] ERROR: Expected export block not found in _worker.js');
	console.error('[MailNest] Looking for: export { worker_default as default }');
	process.exit(1);
}

const injected = `${marker}

// === MailNest Email Handler (injected by postbuild script) ===

function __mailnestNormalizeAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const angleMatch = raw.match(/<([^>]+)>/);
  const addr = angleMatch ? angleMatch[1] : raw;
  return addr.split(',')[0].split(';')[0].replace(/\\s+/g, '');
}

async function __mailnestResolveRecipient(db, recipient, mailDomain) {
  // 1. Exact match
  const exact = await db
    .prepare('SELECT id, email FROM users WHERE lower(email) = ? AND password_hash IS NOT NULL LIMIT 1')
    .bind(recipient)
    .first();
  if (exact && exact.email) return { id: exact.id, email: exact.email };

  // 2. Local-part match
  const localPart = recipient.split('@')[0];
  if (!localPart) return null;

  const localMatch = await db
    .prepare(
      "SELECT id, email FROM users WHERE password_hash IS NOT NULL AND lower(substr(email, 1, instr(email, '@') - 1)) = ? LIMIT 1"
    )
    .bind(localPart)
    .first();
  if (localMatch && localMatch.email) return { id: localMatch.id, email: localMatch.email };

  // 3. Domain-corrected fallback
  if (mailDomain) {
    const corrected = localPart + '@' + mailDomain;
    const correctedMatch = await db
      .prepare('SELECT id, email FROM users WHERE lower(email) = ? AND password_hash IS NOT NULL LIMIT 1')
      .bind(corrected)
      .first();
    if (correctedMatch && correctedMatch.email) return { id: correctedMatch.id, email: correctedMatch.email };
  }

  return null;
}

async function __mailnestReadRawMime(message) {
  const raw = message && message.raw;
  if (!raw) return '';
  try {
    const text = await new Response(raw).text();
    return text.length > 500000 ? text.slice(0, 500000) : text;
  } catch {
    return '';
  }
}

function __mailnestGetHeader(message, name) {
  const headers = message && message.headers;
  if (!headers || typeof headers.get !== 'function') return '';
  return String(headers.get(name) || '').trim();
}

async function __mailnestHandleEmail(message, env, ctx, worker) {
  const mailDomain = String((env && env.MAIL_DOMAIN) || '').trim().toLowerCase();
  const internalSecret = String((env && env.INTERNAL_SECRET) || '').trim();

  // Get recipient address (prefer envelope, fallback to headers)
  const toEnvelope = (() => {
    try {
      const v = message && message.to;
      if (!v) return '';
      const parsed = JSON.parse(JSON.stringify(v));
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return '';
    }
  })();

  const candidates = [
    toEnvelope,
    message && String(message.to || ''),
    __mailnestGetHeader(message, 'delivered-to'),
    __mailnestGetHeader(message, 'x-original-to')
  ]
    .map((v) => __mailnestNormalizeAddress(v))
    .filter((v, i, arr) => v && arr.indexOf(v) === i);

  if (candidates.length === 0) {
    if (message && typeof message.setReject === 'function') message.setReject('Invalid recipient');
    console.warn('[MailNest] Rejected: no valid recipient address');
    return;
  }

  const db = env && env.DB;
  if (!db) {
    if (message && typeof message.setReject === 'function') message.setReject('Service unavailable');
    console.warn('[MailNest] Rejected: DB not available');
    return;
  }

  // Resolve recipient
  let resolved = null;
  for (const candidate of candidates) {
    resolved = await __mailnestResolveRecipient(db, candidate, mailDomain).catch(() => null);
    if (resolved) break;
  }

  if (!resolved) {
    if (message && typeof message.setReject === 'function') message.setReject('Unknown recipient');
    console.info('[MailNest] Rejected: unknown recipient ' + candidates.join(', '));
    return;
  }

  // Read raw MIME
  const rawMime = await __mailnestReadRawMime(message);
  const sender = String((message && message.from) || '').trim();
  const subject = __mailnestGetHeader(message, 'subject') || '(No Subject)';

  // Self-call to /api/internal/receive-email
  const payload = {
    sender,
    recipientEmail: resolved.email,
    recipientUserId: resolved.id,
    subject,
    rawMime,
    receivedAt: new Date().toISOString()
  };

  const headers = { 'content-type': 'application/json' };
  if (internalSecret) {
    headers['x-mailnest-internal-secret'] = internalSecret;
  }

  const internalRequest = new Request('https://mailnest.internal/api/internal/receive-email', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (worker && typeof worker.fetch === 'function') {
    try {
      const internalCtx = ctx && typeof ctx.waitUntil === 'function' ? ctx : { waitUntil() {} };
      const response = await worker.fetch(internalRequest, env, internalCtx);
      if (response.ok) {
        console.log('[MailNest] Email stored for ' + resolved.email + ' from ' + sender);
        return;
      }
      const errText = await response.text().catch(() => '');
      console.error('[MailNest] Internal receive-email failed: ' + response.status + ' ' + errText);
    } catch (error) {
      console.error('[MailNest] Internal receive-email exception: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

const worker_with_email = {
  ...worker_default,
  async email(message, env, ctx) {
    ctx.waitUntil(__mailnestHandleEmail(message, env, ctx, worker_default));
  }
};

export {
  worker_with_email as default
};
`;

const patched = source.replace(exportBlockPattern, injected);
writeFileSync(workerPath, patched, 'utf8');

console.log('[MailNest] Email handler injected successfully.');
