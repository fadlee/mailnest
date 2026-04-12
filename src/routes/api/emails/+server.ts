import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq, desc, like, or, and, sql } from 'drizzle-orm';

// GET /api/emails?folder=inbox&search=query&page=1&limit=50&address=user@example.com
export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) {
		return json({ emails: [], total: 0, message: 'Database not available' });
	}

	const db = createDb(platform.env.DB);
	const folder = url.searchParams.get('folder') || 'inbox';
	const search = url.searchParams.get('search') || '';
	const address = url.searchParams.get('address') || '';
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = (page - 1) * limit;

	try {
		const conditions = [];

		// Folder filter
		if (folder === 'starred') {
			conditions.push(eq(schema.emails.isStarred, true));
		} else {
			conditions.push(eq(schema.emails.folder, folder));
		}

		// Address filter
		if (address) {
			conditions.push(eq(schema.emails.toAddress, address));
		}

		// Search filter
		if (search) {
			conditions.push(
				or(
					like(schema.emails.subject, `%${search}%`),
					like(schema.emails.fromName, `%${search}%`),
					like(schema.emails.fromAddress, `%${search}%`),
					like(schema.emails.bodyText, `%${search}%`)
				)!
			);
		}

		const where = conditions.length > 1 ? and(...conditions) : conditions[0];

		const emails = await db
			.select()
			.from(schema.emails)
			.where(where)
			.orderBy(desc(schema.emails.date))
			.limit(limit)
			.offset(offset);

		// Get attachments for these emails
		const emailIds = emails.map((e) => e.id);
		let attachmentsList: (typeof schema.attachments.$inferSelect)[] = [];
		if (emailIds.length > 0) {
			attachmentsList = await db
				.select()
				.from(schema.attachments)
				.where(
					sql`${schema.attachments.emailId} IN (${sql.join(
						emailIds.map((id) => sql`${id}`),
						sql`, `
					)})`
				);
		}

		// Merge attachments into emails
		const emailsWithAttachments = emails.map((email) => ({
			...email,
			attachments: attachmentsList.filter((a) => a.emailId === email.id)
		}));

		// Count total
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.emails)
			.where(where);

		return json({
			emails: emailsWithAttachments,
			total: countResult[0]?.count || 0,
			page,
			limit
		});
	} catch (err) {
		console.error('Error fetching emails:', err);
		return json({ emails: [], total: 0, error: 'Failed to fetch emails' }, { status: 500 });
	}
};
