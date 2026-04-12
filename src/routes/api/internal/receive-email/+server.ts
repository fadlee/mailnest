import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';
import PostalMime from 'postal-mime';

/**
 * POST /api/internal/receive-email
 *
 * Internal endpoint called by the injected email() handler via self-call.
 * Receives raw MIME email data, parses it with postal-mime, and stores in D1 + R2.
 *
 * Protected by x-mailnest-internal-secret header.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	// Validate internal secret
	const internalSecret = (platform.env as unknown as Record<string, string>).INTERNAL_SECRET || '';
	if (internalSecret) {
		const providedSecret = request.headers.get('x-mailnest-internal-secret') || '';
		if (providedSecret !== internalSecret) {
			error(403, 'Forbidden');
		}
	}

	const body = (await request.json()) as {
		sender: string;
		recipientEmail: string;
		recipientUserId: string;
		subject: string;
		rawMime: string;
		receivedAt: string;
	};

	if (!body.recipientEmail || !body.recipientUserId) {
		error(400, 'Missing recipient info');
	}

	const db = createDb(platform.env.DB);

	try {
		const emailId = crypto.randomUUID();
		const now = body.receivedAt || new Date().toISOString();

		// Parse MIME with postal-mime
		let parsed: Awaited<ReturnType<PostalMime['parse']>> | null = null;
		if (body.rawMime) {
			const parser = new PostalMime();
			const encoder = new TextEncoder();
			parsed = await parser.parse(encoder.encode(body.rawMime));
		}

		const fromAddress = body.sender || parsed?.from?.address || '';
		const fromName = parsed?.from?.name || fromAddress.split('@')[0] || '';
		const subject = parsed?.subject || body.subject || '(No Subject)';
		const bodyText = parsed?.text || '';
		const bodyHtml = parsed?.html || null;
		const date = parsed?.date ? new Date(parsed.date).toISOString() : now;
		const messageId = parsed?.messageId || `<${emailId}@mailnest>`;

		const threadId =
			parsed?.headers?.find((h) => h.key === 'references')?.value?.split(/\s+/)[0] ||
			messageId ||
			emailId;

		// Store email in D1
		await db
			.insert(schema.emails)
			.values({
				id: emailId,
				userId: body.recipientUserId,
				messageId,
				fromAddress,
				fromName,
				toAddress: body.recipientEmail,
				ccAddress: parsed?.cc?.map((c) => c.address).join(', ') || null,
				bccAddress: null,
				replyTo: parsed?.replyTo?.map((r) => r.address).join(', ') || null,
				subject,
				bodyText,
				bodyHtml,
				date,
				receivedAt: now,
				isRead: false,
				isStarred: false,
				folder: 'inbox',
				rawSize: body.rawMime?.length || 0,
				inReplyTo: parsed?.headers?.find((h) => h.key === 'in-reply-to')?.value || null,
				references: parsed?.headers?.find((h) => h.key === 'references')?.value || null,
				threadId,
				createdAt: now,
				updatedAt: now
			});

		// Store attachments
		if (parsed?.attachments && parsed.attachments.length > 0) {
			for (const attachment of parsed.attachments) {
				const attachmentId = crypto.randomUUID();
				let r2Key: string | null = null;

				// Upload to R2 if available
				if (platform.env.R2) {
					r2Key = `emails/${emailId}/attachments/${attachmentId}/${attachment.filename || 'unnamed'}`;
					await platform.env.R2.put(r2Key, attachment.content, {
						httpMetadata: {
							contentType: attachment.mimeType || 'application/octet-stream'
						},
						customMetadata: {
							emailId,
							filename: attachment.filename || 'unnamed'
						}
					});
				}

				await db.insert(schema.attachments).values({
					id: attachmentId,
					emailId,
					filename: attachment.filename || 'unnamed',
					contentType: attachment.mimeType || 'application/octet-stream',
					size:
						typeof attachment.content === 'string'
							? attachment.content.length
							: (attachment.content as ArrayBuffer).byteLength,
					r2Key,
					createdAt: now
				});
			}
		}

		console.log(
			`[MailNest] Email stored: ${emailId} for=${body.recipientEmail} from=${fromAddress} subject="${subject}" attachments=${parsed?.attachments?.length || 0}`
		);

		return json({ success: true, emailId });
	} catch (err) {
		console.error('[MailNest] Failed to store email:', err);
		error(500, 'Failed to store email');
	}
};
