import { eq, inArray } from 'drizzle-orm';
import { schema } from '$lib/server/db/index.js';
import type { createDb } from '$lib/server/db/index.js';

type Db = ReturnType<typeof createDb>;

export async function getSetting(db: Db, key: string): Promise<string | null> {
	const row = await db
		.select({ value: schema.settings.value })
		.from(schema.settings)
		.where(eq(schema.settings.key, key))
		.limit(1);

	return row[0]?.value ?? null;
}

export async function getSettings(db: Db, keys: string[]): Promise<Record<string, string>> {
	if (keys.length === 0) return {};

	const rows = await db
		.select({ key: schema.settings.key, value: schema.settings.value })
		.from(schema.settings)
		.where(inArray(schema.settings.key, keys));

	return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
	await db
		.insert(schema.settings)
		.values({ key, value, updatedAt: new Date().toISOString() })
		.onConflictDoUpdate({
			target: schema.settings.key,
			set: { value, updatedAt: new Date().toISOString() }
		});
}

export async function setSettings(db: Db, values: Record<string, string>): Promise<void> {
	for (const [key, value] of Object.entries(values)) {
		await setSetting(db, key, value);
	}
}
