import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq, asc } from 'drizzle-orm';

// GET /api/routing-rules
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) {
		return json({ rules: [] });
	}

	const db = createDb(platform.env.DB);

	try {
		const rules = await db
			.select()
			.from(schema.routingRules)
			.orderBy(asc(schema.routingRules.priority));

		return json({ rules });
	} catch (err) {
		console.error('Error fetching routing rules:', err);
		return json({ rules: [] }, { status: 500 });
	}
};

// POST /api/routing-rules - Create new rule
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		name: string;
		pattern: string;
		matchType?: string;
		action?: string;
		destination?: string;
		priority?: number;
	};

	if (!body.name || !body.pattern) {
		error(400, 'Name and pattern are required');
	}

	try {
		const id = crypto.randomUUID();
		await db.insert(schema.routingRules).values({
			id,
			name: body.name,
			pattern: body.pattern,
			matchType: body.matchType || 'exact',
			action: body.action || 'store',
			destination: body.destination || null,
			priority: body.priority || 0,
			enabled: true
		});

		return json({ id, success: true }, { status: 201 });
	} catch (err) {
		console.error('Error creating routing rule:', err);
		error(500, 'Failed to create routing rule');
	}
};
