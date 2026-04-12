import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';

// GET /api/emails/:id - Get single email
export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);

	try {
		const [email] = await db
			.select()
			.from(schema.emails)
			.where(eq(schema.emails.id, params.id))
			.limit(1);

		if (!email) {
			error(404, 'Email not found');
		}

		const emailAttachments = await db
			.select()
			.from(schema.attachments)
			.where(eq(schema.attachments.emailId, email.id));

		return json({ ...email, attachments: emailAttachments });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Error fetching email:', err);
		error(500, 'Failed to fetch email');
	}
};

// PATCH /api/emails/:id - Update email (read, starred, folder)
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		isRead?: boolean;
		isStarred?: boolean;
		folder?: string;
	};

	try {
		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (typeof body.isRead === 'boolean') updateData.isRead = body.isRead;
		if (typeof body.isStarred === 'boolean') updateData.isStarred = body.isStarred;
		if (typeof body.folder === 'string') updateData.folder = body.folder;

		await db
			.update(schema.emails)
			.set(updateData)
			.where(eq(schema.emails.id, params.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error updating email:', err);
		error(500, 'Failed to update email');
	}
};

// DELETE /api/emails/:id - Delete email permanently
export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);

	try {
		// Delete attachments from R2 first
		if (platform.env.R2) {
			const emailAttachments = await db
				.select()
				.from(schema.attachments)
				.where(eq(schema.attachments.emailId, params.id));

			for (const att of emailAttachments) {
				if (att.r2Key) {
					await platform.env.R2.delete(att.r2Key);
				}
			}
		}

		// Delete email (cascades to attachments)
		await db.delete(schema.emails).where(eq(schema.emails.id, params.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting email:', err);
		error(500, 'Failed to delete email');
	}
};
