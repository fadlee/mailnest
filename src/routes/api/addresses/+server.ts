import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createDb, schema } from '$lib/server/db/index.js';
import { asc, eq } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth.js';

// GET /api/addresses - List all email addresses
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) {
		return json({ addresses: [], domain: '' });
	}

	const db = createDb(platform.env.DB);
	const domain = platform.env.MAIL_DOMAIN || 'example.com';

	try {
		const addresses = await db
			.select({
				id: schema.users.id,
				email: schema.users.email,
				displayName: schema.users.displayName,
				role: schema.users.role,
				createdAt: schema.users.createdAt
			})
			.from(schema.users)
			.orderBy(asc(schema.users.createdAt));

		// Filter out soft-deleted users (passwordHash = null means disabled)
		// We still show them but mark them

		return json({ addresses, domain });
	} catch (err) {
		console.error('Error fetching addresses:', err);
		return json({ addresses: [], domain: '' }, { status: 500 });
	}
};

// POST /api/addresses - Create a new email address
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		error(503, 'Database not available');
	}

	const db = createDb(platform.env.DB);
	const domain = platform.env.MAIL_DOMAIN || 'example.com';
	const body = (await request.json()) as {
		username: string;
		displayName?: string;
		password?: string;
		role?: string;
	};

	if (!body.username) {
		error(400, 'Username is required');
	}

	// Sanitize username: lowercase, alphanumeric + dots + hyphens + underscores
	const username = body.username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
	if (!username) {
		error(400, 'Invalid username');
	}

	const email = `${username}@${domain}`;

	try {
		// Check if email already exists
		const existing = await db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.limit(1);

		if (existing.length > 0) {
			error(409, `Email address ${email} already exists`);
		}

		const id = crypto.randomUUID();
		// Generate a random password if none provided
		const password = body.password || crypto.randomUUID().slice(0, 16);
		const passwordHash = await hashPassword(password);

		await db.insert(schema.users).values({
			id,
			email,
			displayName: body.displayName || username,
			passwordHash,
			role: body.role === 'admin' ? 'admin' : 'member'
		});

		return json({ id, email, success: true }, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Error creating address:', err);
		error(500, 'Failed to create email address');
	}
};
