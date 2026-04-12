import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';

// GET /api/attachments/:id - Download attachment from R2
export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);

	try {
		const [attachment] = await db
			.select()
			.from(schema.attachments)
			.where(eq(schema.attachments.id, params.id))
			.limit(1);

		if (!attachment) {
			error(404, 'Attachment not found');
		}

		// R2 not configured - attachment metadata exists but file is not stored
		if (!platform.env.R2) {
			return json(
				{
					error: 'R2 storage not configured. Attachment file is not available for download.',
					attachment: {
						filename: attachment.filename,
						contentType: attachment.contentType,
						size: attachment.size
					}
				},
				{ status: 501 }
			);
		}

		if (!attachment.r2Key) {
			error(404, 'Attachment file not stored (R2 was not configured when email was received)');
		}

		const object = await platform.env.R2.get(attachment.r2Key);
		if (!object) {
			error(404, 'Attachment file not found in storage');
		}

		const headers = new Headers();
		headers.set('Content-Type', attachment.contentType);
		headers.set('Content-Disposition', `attachment; filename="${attachment.filename}"`);
		if (object.size) {
			headers.set('Content-Length', String(object.size));
		}

		return new Response(object.body, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Error downloading attachment:', err);
		error(500, 'Failed to download attachment');
	}
};
