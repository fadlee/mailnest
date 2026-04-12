import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';

// DELETE /api/addresses/:id - Remove an email address
export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);

	try {
		// Check if user exists
		const [user] = await db
			.select({ id: schema.users.id, role: schema.users.role })
			.from(schema.users)
			.where(eq(schema.users.id, params.id))
			.limit(1);

		if (!user) {
			error(404, 'Email address not found');
		}

		// Don't allow deleting the last admin
		if (user.role === 'admin') {
			const adminCount = await db
				.select({ id: schema.users.id })
				.from(schema.users)
				.where(eq(schema.users.role, 'admin'));

			if (adminCount.length <= 1) {
				error(400, 'Cannot delete the last admin account');
			}
		}

		// Delete user (cascades to emails via FK)
		await db.delete(schema.users).where(eq(schema.users.id, params.id));

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Error deleting address:', err);
		error(500, 'Failed to delete email address');
	}
};

// PATCH /api/addresses/:id - Update email address (displayName, role)
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const body = (await request.json()) as {
		displayName?: string;
		role?: string;
	};

	try {
		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (body.displayName !== undefined) updateData.displayName = body.displayName;
		if (body.role !== undefined) updateData.role = body.role;

		await db
			.update(schema.users)
			.set(updateData)
			.where(eq(schema.users.id, params.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error updating address:', err);
		error(500, 'Failed to update email address');
	}
};
