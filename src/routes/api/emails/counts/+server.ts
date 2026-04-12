import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq, and, sql } from 'drizzle-orm';

// GET /api/emails/counts?address=user@example.com - Get unread counts per folder
export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) {
		return json({
			inbox: { total: 0, unread: 0 },
			starred: { total: 0, unread: 0 },
			archive: { total: 0, unread: 0 },
			trash: { total: 0, unread: 0 }
		});
	}

	const db = createDb(platform.env.DB);
	const address = url.searchParams.get('address') || '';

	try {
		// Build address condition
		const addressCondition = address
			? eq(schema.emails.toAddress, address)
			: undefined;

		// Folder counts
		const folderQuery = db
			.select({
				folder: schema.emails.folder,
				total: sql<number>`count(*)`,
				unread: sql<number>`sum(case when ${schema.emails.isRead} = 0 then 1 else 0 end)`
			})
			.from(schema.emails);

		const folderCounts = addressCondition
			? await folderQuery.where(addressCondition).groupBy(schema.emails.folder)
			: await folderQuery.groupBy(schema.emails.folder);

		// Starred counts
		const starredCondition = addressCondition
			? and(eq(schema.emails.isStarred, true), addressCondition)
			: eq(schema.emails.isStarred, true);

		const starredCount = await db
			.select({
				total: sql<number>`count(*)`,
				unread: sql<number>`sum(case when ${schema.emails.isRead} = 0 then 1 else 0 end)`
			})
			.from(schema.emails)
			.where(starredCondition);

		const counts: Record<string, { total: number; unread: number }> = {};
		for (const row of folderCounts) {
			counts[row.folder] = { total: row.total, unread: row.unread || 0 };
		}
		counts['starred'] = {
			total: starredCount[0]?.total || 0,
			unread: starredCount[0]?.unread || 0
		};

		return json(counts);
	} catch (err) {
		console.error('Error fetching counts:', err);
		return json({});
	}
};
