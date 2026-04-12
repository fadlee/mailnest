export interface Email {
	id: string;
	messageId: string;
	fromAddress: string;
	fromName: string;
	toAddress: string;
	subject: string;
	bodyText: string;
	bodyHtml: string;
	date: string;
	isRead: boolean;
	isStarred: boolean;
	folder: Folder;
	attachments: Attachment[];
}

export interface Attachment {
	id: string;
	emailId: string;
	filename: string;
	contentType: string;
	size: number;
	r2Key?: string;
}

export type Folder = 'inbox' | 'starred' | 'trash' | 'archive';

export interface EmailAddress {
	id: string;
	email: string;
	displayName: string;
	role: 'admin' | 'member';
	createdAt: string;
}
