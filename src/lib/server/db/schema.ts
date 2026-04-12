import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Users / Email Addresses
// Each user represents an email address that can receive mail.
// The catch-all rule in Cloudflare sends all emails to the Worker,
// and the Worker checks this table to decide whether to accept or reject.
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	displayName: text('display_name'),
	passwordHash: text('password_hash'), // null = disabled/soft-deleted
	role: text('role').notNull().default('member'), // 'admin' | 'member'
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const emails = sqliteTable('emails', {
	id: text('id').primaryKey(),
	userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
	messageId: text('message_id').notNull(),
	fromAddress: text('from_address').notNull(),
	fromName: text('from_name').notNull().default(''),
	toAddress: text('to_address').notNull(),
	ccAddress: text('cc_address'),
	bccAddress: text('bcc_address'),
	replyTo: text('reply_to'),
	subject: text('subject').notNull().default('(No Subject)'),
	bodyText: text('body_text').notNull().default(''),
	bodyHtml: text('body_html'),
	date: text('date').notNull(),
	receivedAt: text('received_at').notNull(),
	isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
	isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
	folder: text('folder').notNull().default('inbox'),
	rawSize: integer('raw_size').default(0),
	inReplyTo: text('in_reply_to'),
	references: text('references_header'),
	threadId: text('thread_id'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const attachments = sqliteTable('attachments', {
	id: text('id').primaryKey(),
	emailId: text('email_id')
		.notNull()
		.references(() => emails.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	contentType: text('content_type').notNull(),
	size: integer('size').notNull().default(0),
	r2Key: text('r2_key'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const routingRules = sqliteTable('routing_rules', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	pattern: text('pattern').notNull(),
	matchType: text('match_type').notNull().default('exact'),
	action: text('action').notNull().default('store'),
	destination: text('destination'),
	priority: integer('priority').notNull().default(0),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});
