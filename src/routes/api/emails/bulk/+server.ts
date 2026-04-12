import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq, sql } from 'drizzle-orm';

// PATCH /api/emails/bulk - Bulk update emails
export const PATCH: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		ids: string[];
		isRead?: boolean;
		isStarred?: boolean;
		folder?: string;
	};

	if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
		error(400, 'ids array is required');
	}

	try {
		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (typeof body.isRead === 'boolean') updateData.isRead = body.isRead;
		if (typeof body.isStarred === 'boolean') updateData.isStarred = body.isStarred;
		if (typeof body.folder === 'string') updateData.folder = body.folder;

		// Update each email (D1 doesn't support IN clause well with Drizzle)
		for (const id of body.ids) {
			await db.update(schema.emails).set(updateData).where(eq(schema.emails.id, id));
		}

		return json({ success: true, updated: body.ids.length });
	} catch (err) {
		console.error('Error bulk updating emails:', err);
		error(500, 'Failed to bulk update emails');
	}
};

// DELETE /api/emails/bulk - Bulk delete emails
export const DELETE: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as { ids: string[] };

	if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
		error(400, 'ids array is required');
	}

	try {
		// Delete attachments from R2 first
		if (platform.env.R2) {
			for (const id of body.ids) {
				const attachments = await db
					.select()
					.from(schema.attachments)
					.where(eq(schema.attachments.emailId, id));
				for (const att of attachments) {
					if (att.r2Key) await platform.env.R2.delete(att.r2Key);
				}
			}
		}

		// Delete emails (cascades to attachments)
		for (const id of body.ids) {
			await db.delete(schema.emails).where(eq(schema.emails.id, id));
		}

		return json({ success: true, deleted: body.ids.length });
	} catch (err) {
		console.error('Error bulk deleting emails:', err);
		error(500, 'Failed to bulk delete emails');
	}
};
