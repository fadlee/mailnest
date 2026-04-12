import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';

// PATCH /api/routing-rules/:id - Update rule
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		name?: string;
		pattern?: string;
		matchType?: string;
		action?: string;
		destination?: string;
		priority?: number;
		enabled?: boolean;
	};

	try {
		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (body.name !== undefined) updateData.name = body.name;
		if (body.pattern !== undefined) updateData.pattern = body.pattern;
		if (body.matchType !== undefined) updateData.matchType = body.matchType;
		if (body.action !== undefined) updateData.action = body.action;
		if (body.destination !== undefined) updateData.destination = body.destination;
		if (body.priority !== undefined) updateData.priority = body.priority;
		if (body.enabled !== undefined) updateData.enabled = body.enabled;

		await db
			.update(schema.routingRules)
			.set(updateData)
			.where(eq(schema.routingRules.id, params.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error updating routing rule:', err);
		error(500, 'Failed to update routing rule');
	}
};

// DELETE /api/routing-rules/:id
export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);

	try {
		await db.delete(schema.routingRules).where(eq(schema.routingRules.id, params.id));
		return json({ success: true });
	} catch (err) {
		console.error('Error deleting routing rule:', err);
		error(500, 'Failed to delete routing rule');
	}
};
