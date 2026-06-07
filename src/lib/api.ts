import type { Email, EmailAddress } from '$lib/types.js';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: {
			'Content-Type': 'application/json',
			...options?.headers
		},
		...options
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({ message: res.statusText }));
		throw new Error((err as { message?: string }).message || `HTTP ${res.status}`);
	}

	return res.json() as Promise<T>;
}

export interface TelegramSettings {
	enabled: boolean;
	includeLinks: boolean;
	configured: boolean;
	botUsername: string | null;
	botTokenPreview: string | null;
	defaultChatId: string | null;
}

export interface TelegramSettingsInput {
	enabled: boolean;
	includeLinks: boolean;
	botToken?: string;
	defaultChatId: string;
}

export interface TelegramChatOption {
	id: string;
	type: string;
	title: string;
	username: string | null;
}

export interface AdminSettings {
	username: string;
}

export async function fetchAdminSettings() {
	return request<AdminSettings>('/settings/admin');
}

export async function saveAdminSettings(data: AdminSettings) {
	return request<AdminSettings>('/settings/admin', {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

export async function fetchTelegramSettings() {
	return request<TelegramSettings>('/settings/telegram');
}

export async function saveTelegramSettings(data: TelegramSettingsInput) {
	return request<TelegramSettings>('/settings/telegram', {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

export async function sendTelegramTestMessage(chatId?: string) {
	return request<{ success: boolean }>('/settings/telegram/test', {
		method: 'POST',
		body: JSON.stringify({ chatId })
	});
}

export async function fetchTelegramChats(botToken?: string) {
	return request<{ chats: TelegramChatOption[] }>('/settings/telegram/chats', {
		method: 'POST',
		body: JSON.stringify({ botToken })
	});
}

// Emails
export async function fetchEmails(
	folder: string = 'inbox',
	search: string = '',
	page: number = 1,
	limit: number = 50,
	address?: string
): Promise<{ emails: Email[]; total: number }> {
	const params = new URLSearchParams({ folder, search, page: String(page), limit: String(limit) });
	if (address) params.set('address', address);
	return request(`/emails?${params}`);
}

export async function updateEmail(
	id: string,
	data: { isRead?: boolean; isStarred?: boolean; folder?: string }
): Promise<{ success: boolean }> {
	return request(`/emails/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(data)
	});
}

export async function deleteEmail(id: string): Promise<{ success: boolean }> {
	return request(`/emails/${id}`, { method: 'DELETE' });
}

// Bulk operations
export async function bulkUpdateEmails(
	ids: string[],
	data: { isRead?: boolean; isStarred?: boolean; folder?: string }
): Promise<{ success: boolean }> {
	return request('/emails/bulk', {
		method: 'PATCH',
		body: JSON.stringify({ ids, ...data })
	});
}

export async function bulkDeleteEmails(ids: string[]): Promise<{ success: boolean }> {
	return request('/emails/bulk', {
		method: 'DELETE',
		body: JSON.stringify({ ids })
	});
}

export async function fetchEmailCounts(
	address?: string
): Promise<Record<string, { total: number; unread: number }>> {
	const params = address ? `?address=${encodeURIComponent(address)}` : '';
	return request(`/emails/counts${params}`);
}

// Routing Rules
export interface RoutingRuleInput {
	name: string;
	pattern: string;
	matchType?: string;
	action?: string;
	destination?: string;
	priority?: number;
}

export async function fetchRoutingRules() {
	return request<{ rules: Array<RoutingRuleInput & { id: string; enabled: boolean }> }>(
		'/routing-rules'
	);
}

export async function createRoutingRule(data: RoutingRuleInput) {
	return request<{ id: string; success: boolean }>('/routing-rules', {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

export async function updateRoutingRule(id: string, data: Partial<RoutingRuleInput & { enabled: boolean }>) {
	return request<{ success: boolean }>(`/routing-rules/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(data)
	});
}

export async function deleteRoutingRule(id: string) {
	return request<{ success: boolean }>(`/routing-rules/${id}`, { method: 'DELETE' });
}

// Email Addresses
export async function fetchAddresses() {
	return request<{ addresses: EmailAddress[]; domain: string }>('/addresses');
}

export async function createAddress(data: {
	username: string;
	displayName?: string;
	password?: string;
	role?: string;
}) {
	return request<{ id: string; email: string; success: boolean }>('/addresses', {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

export async function deleteAddress(id: string) {
	return request<{ success: boolean }>(`/addresses/${id}`, { method: 'DELETE' });
}
