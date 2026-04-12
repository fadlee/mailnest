import type { Email, EmailAddress, Folder } from '$lib/types.js';
import * as api from '$lib/api.js';

class EmailStore {
	emails = $state<Email[]>([]);
	selectedEmailId = $state<string | null>(null);
	selectedIds = $state<Set<string>>(new Set());
	currentFolder = $state<Folder>('inbox');
	searchQuery = $state('');
	sidebarOpen = $state(true);
	loading = $state(false);
	error = $state<string | null>(null);
	initialized = $state(false);
	useApi = $state(false);
	folderCounts = $state<Record<string, { total: number; unread: number }>>({});

	// Address management
	addresses = $state<EmailAddress[]>([]);
	selectedAddress = $state<string | null>(null);

	// Context menu
	contextMenu = $state<{ x: number; y: number; emailId: string } | null>(null);

	get filteredEmails() {
		let filtered = this.emails;

		if (!this.useApi) {
			if (this.currentFolder === 'starred') {
				filtered = filtered.filter((e) => e.isStarred);
			} else {
				filtered = filtered.filter((e) => e.folder === this.currentFolder);
			}

			if (this.searchQuery) {
				const q = this.searchQuery.toLowerCase();
				filtered = filtered.filter(
					(e) =>
						e.subject.toLowerCase().includes(q) ||
						e.fromName.toLowerCase().includes(q) ||
						e.fromAddress.toLowerCase().includes(q) ||
						e.bodyText.toLowerCase().includes(q)
				);
			}

			if (this.selectedAddress) {
				filtered = filtered.filter((e) => e.toAddress === this.selectedAddress);
			}
		}

		return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}

	get selectedEmail() {
		if (!this.selectedEmailId) return null;
		return this.emails.find((e) => e.id === this.selectedEmailId) ?? null;
	}

	get currentAddress(): EmailAddress | null {
		if (!this.selectedAddress) return null;
		return this.addresses.find((a) => a.email === this.selectedAddress) ?? null;
	}

	get hasSelection() {
		return this.selectedIds.size > 0;
	}

	get allSelected() {
		const emails = this.filteredEmails;
		return emails.length > 0 && emails.every((e) => this.selectedIds.has(e.id));
	}

	get unreadCount() {
		return (folder: Folder) => {
			if (this.useApi && this.folderCounts[folder]) {
				return this.folderCounts[folder].unread;
			}
			if (folder === 'starred') {
				return this.emails.filter((e) => e.isStarred && !e.isRead).length;
			}
			return this.emails.filter((e) => e.folder === folder && !e.isRead).length;
		};
	}

	get totalCount() {
		return (folder: Folder) => {
			if (this.useApi && this.folderCounts[folder]) {
				return this.folderCounts[folder].total;
			}
			if (folder === 'starred') {
				return this.emails.filter((e) => e.isStarred).length;
			}
			return this.emails.filter((e) => e.folder === folder).length;
		};
	}

	// --- Local count helpers ---

	private adjustCount(folder: string, totalDelta: number, unreadDelta: number) {
		if (!this.folderCounts[folder]) {
			this.folderCounts[folder] = { total: 0, unread: 0 };
		}
		this.folderCounts = {
			...this.folderCounts,
			[folder]: {
				total: Math.max(0, this.folderCounts[folder].total + totalDelta),
				unread: Math.max(0, this.folderCounts[folder].unread + unreadDelta)
			}
		};
	}

	// --- Init ---

	async init() {
		try {
			const addrResult = await api.fetchAddresses();
			this.addresses = addrResult.addresses;

			if (this.addresses.length > 0) {
				this.selectedAddress = this.addresses[0].email;
			}

			this.useApi = true;
			await this.loadEmails();
			await this.loadCounts();
		} catch {
			this.useApi = false;
		}
		this.initialized = true;
	}

	async loadEmails() {
		this.loading = true;
		this.error = null;
		try {
			const address = this.selectedAddress || undefined;
			const result = await api.fetchEmails(this.currentFolder, this.searchQuery, 1, 50, address);
			this.emails = result.emails;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to load emails';
		} finally {
			this.loading = false;
		}
	}

	async loadCounts() {
		try {
			const address = this.selectedAddress || undefined;
			this.folderCounts = await api.fetchEmailCounts(address);
		} catch {
			// Ignore
		}
	}

	async loadAddresses() {
		try {
			const result = await api.fetchAddresses();
			this.addresses = result.addresses;
		} catch {
			// Ignore
		}
	}

	async refresh() {
		if (!this.useApi) return;
		await this.loadEmails();
		await this.loadCounts();
	}

	reset() {
		this.emails = [];
		this.selectedEmailId = null;
		this.selectedIds = new Set();
		this.currentFolder = 'inbox';
		this.searchQuery = '';
		this.folderCounts = {};
		this.addresses = [];
		this.selectedAddress = null;
		this.initialized = false;
		this.useApi = false;
		this.contextMenu = null;
	}

	// --- Selection ---

	async selectEmail(id: string) {
		this.selectedEmailId = id;
		const email = this.emails.find((e) => e.id === id);
		if (email && !email.isRead) {
			email.isRead = true;
			this.adjustCount(email.folder, 0, -1);
			if (email.isStarred) this.adjustCount('starred', 0, -1);
			if (this.useApi) {
				api.updateEmail(id, { isRead: true }).catch(console.error);
			}
		}
	}

	deselectEmail() {
		this.selectedEmailId = null;
	}

	toggleSelect(id: string) {
		const newSet = new Set(this.selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		this.selectedIds = newSet;
	}

	selectAll() {
		this.selectedIds = new Set(this.filteredEmails.map((e) => e.id));
	}

	deselectAll() {
		this.selectedIds = new Set();
	}

	isSelected(id: string) {
		return this.selectedIds.has(id);
	}

	// --- Single actions ---

	async toggleStar(id: string) {
		const email = this.emails.find((e) => e.id === id);
		if (!email) return;
		const newValue = !email.isStarred;
		email.isStarred = newValue;
		// Update starred count
		const unreadDelta = email.isRead ? 0 : (newValue ? 1 : -1);
		this.adjustCount('starred', newValue ? 1 : -1, unreadDelta);
		if (this.useApi) {
			try {
				await api.updateEmail(id, { isStarred: newValue });
			} catch {
				email.isStarred = !newValue;
				this.adjustCount('starred', newValue ? -1 : 1, -unreadDelta);
			}
		}
	}

	async toggleRead(id: string) {
		const email = this.emails.find((e) => e.id === id);
		if (!email) return;
		const newValue = !email.isRead;
		email.isRead = newValue;
		const delta = newValue ? -1 : 1; // read = -1 unread, unread = +1 unread
		this.adjustCount(email.folder, 0, delta);
		if (email.isStarred) this.adjustCount('starred', 0, delta);
		if (this.useApi) {
			try {
				await api.updateEmail(id, { isRead: newValue });
			} catch {
				email.isRead = !newValue;
				this.adjustCount(email.folder, 0, -delta);
				if (email.isStarred) this.adjustCount('starred', 0, -delta);
			}
		}
	}

	async moveToTrash(id: string) {
		const email = this.emails.find((e) => e.id === id);
		if (!email) return;
		const prevFolder = email.folder;
		const wasUnread = !email.isRead;
		email.folder = 'trash';
		if (this.selectedEmailId === id) this.selectedEmailId = null;
		this.adjustCount(prevFolder, -1, wasUnread ? -1 : 0);
		this.adjustCount('trash', 1, wasUnread ? 1 : 0);
		if (email.isStarred) this.adjustCount('starred', -1, wasUnread ? -1 : 0);
		if (this.useApi) {
			try {
				await api.updateEmail(id, { folder: 'trash' });
				await this.loadEmails();
			} catch {
				email.folder = prevFolder;
				this.adjustCount(prevFolder, 1, wasUnread ? 1 : 0);
				this.adjustCount('trash', -1, wasUnread ? -1 : 0);
				if (email.isStarred) this.adjustCount('starred', 1, wasUnread ? 1 : 0);
			}
		}
	}

	async archiveEmail(id: string) {
		const email = this.emails.find((e) => e.id === id);
		if (!email) return;
		const prevFolder = email.folder;
		const wasUnread = !email.isRead;
		email.folder = 'archive';
		if (this.selectedEmailId === id) this.selectedEmailId = null;
		this.adjustCount(prevFolder, -1, wasUnread ? -1 : 0);
		this.adjustCount('archive', 1, wasUnread ? 1 : 0);
		if (this.useApi) {
			try {
				await api.updateEmail(id, { folder: 'archive' });
				await this.loadEmails();
			} catch {
				email.folder = prevFolder;
				this.adjustCount(prevFolder, 1, wasUnread ? 1 : 0);
				this.adjustCount('archive', -1, wasUnread ? -1 : 0);
			}
		}
	}

	async moveToInbox(id: string) {
		const email = this.emails.find((e) => e.id === id);
		if (!email) return;
		const prevFolder = email.folder;
		const wasUnread = !email.isRead;
		email.folder = 'inbox';
		if (this.selectedEmailId === id) this.selectedEmailId = null;
		this.adjustCount(prevFolder, -1, wasUnread ? -1 : 0);
		this.adjustCount('inbox', 1, wasUnread ? 1 : 0);
		if (this.useApi) {
			try {
				await api.updateEmail(id, { folder: 'inbox' });
				await this.loadEmails();
			} catch {
				email.folder = prevFolder;
				this.adjustCount(prevFolder, 1, wasUnread ? 1 : 0);
				this.adjustCount('inbox', -1, wasUnread ? -1 : 0);
			}
		}
	}

	async deleteEmail(id: string) {
		const email = this.emails.find((e) => e.id === id);
		if (!email) return;
		if (this.selectedEmailId === id) this.selectedEmailId = null;
		const wasUnread = !email.isRead;
		this.emails = this.emails.filter((e) => e.id !== id);
		this.adjustCount(email.folder, -1, wasUnread ? -1 : 0);
		if (email.isStarred) this.adjustCount('starred', -1, wasUnread ? -1 : 0);
		this.selectedIds.delete(id);
		this.selectedIds = new Set(this.selectedIds);
		if (this.useApi) {
			try {
				await api.deleteEmail(id);
			} catch {
				this.emails = [...this.emails, email];
				this.adjustCount(email.folder, 1, wasUnread ? 1 : 0);
				if (email.isStarred) this.adjustCount('starred', 1, wasUnread ? 1 : 0);
			}
		}
	}

	// --- Bulk actions ---

	async bulkMarkRead() {
		const ids = [...this.selectedIds];
		const emails = this.emails.filter((e) => ids.includes(e.id) && !e.isRead);
		emails.forEach((e) => {
			this.adjustCount(e.folder, 0, -1);
			if (e.isStarred) this.adjustCount('starred', 0, -1);
			e.isRead = true;
		});
		this.deselectAll();
		if (this.useApi) {
			await api.bulkUpdateEmails(ids, { isRead: true }).catch(console.error);
		}
	}

	async bulkMarkUnread() {
		const ids = [...this.selectedIds];
		const emails = this.emails.filter((e) => ids.includes(e.id) && e.isRead);
		emails.forEach((e) => {
			this.adjustCount(e.folder, 0, 1);
			if (e.isStarred) this.adjustCount('starred', 0, 1);
			e.isRead = false;
		});
		this.deselectAll();
		if (this.useApi) {
			await api.bulkUpdateEmails(ids, { isRead: false }).catch(console.error);
		}
	}

	async bulkArchive() {
		const ids = [...this.selectedIds];
		const emails = this.emails.filter((e) => ids.includes(e.id));
		emails.forEach((e) => {
			const wasUnread = !e.isRead;
			this.adjustCount(e.folder, -1, wasUnread ? -1 : 0);
			this.adjustCount('archive', 1, wasUnread ? 1 : 0);
			e.folder = 'archive';
		});
		this.deselectAll();
		if (this.useApi) {
			await api.bulkUpdateEmails(ids, { folder: 'archive' }).catch(console.error);
			await this.loadEmails();
		}
	}

	async bulkTrash() {
		const ids = [...this.selectedIds];
		const emails = this.emails.filter((e) => ids.includes(e.id));
		emails.forEach((e) => {
			const wasUnread = !e.isRead;
			this.adjustCount(e.folder, -1, wasUnread ? -1 : 0);
			this.adjustCount('trash', 1, wasUnread ? 1 : 0);
			e.folder = 'trash';
		});
		this.deselectAll();
		if (this.useApi) {
			await api.bulkUpdateEmails(ids, { folder: 'trash' }).catch(console.error);
			await this.loadEmails();
		}
	}

	async bulkMoveToInbox() {
		const ids = [...this.selectedIds];
		const emails = this.emails.filter((e) => ids.includes(e.id));
		emails.forEach((e) => {
			const wasUnread = !e.isRead;
			this.adjustCount(e.folder, -1, wasUnread ? -1 : 0);
			this.adjustCount('inbox', 1, wasUnread ? 1 : 0);
			e.folder = 'inbox';
		});
		this.deselectAll();
		if (this.useApi) {
			await api.bulkUpdateEmails(ids, { folder: 'inbox' }).catch(console.error);
			await this.loadEmails();
		}
	}

	async bulkDelete() {
		const ids = [...this.selectedIds];
		const removed = this.emails.filter((e) => ids.includes(e.id));
		removed.forEach((e) => {
			const wasUnread = !e.isRead;
			this.adjustCount(e.folder, -1, wasUnread ? -1 : 0);
			if (e.isStarred) this.adjustCount('starred', -1, wasUnread ? -1 : 0);
		});
		this.emails = this.emails.filter((e) => !ids.includes(e.id));
		this.deselectAll();
		if (this.useApi) {
			await api.bulkDeleteEmails(ids).catch(console.error);
		}
	}

	// --- Navigation ---

	async setFolder(folder: Folder) {
		this.currentFolder = folder;
		this.selectedEmailId = null;
		this.deselectAll();
		if (this.useApi) {
			await this.loadEmails();
		}
	}

	async setAddress(email: string | null) {
		this.selectedAddress = email;
		this.selectedEmailId = null;
		this.currentFolder = 'inbox';
		this.deselectAll();
		if (this.useApi) {
			await this.loadEmails();
			await this.loadCounts();
		}
	}

	async search(query: string) {
		this.searchQuery = query;
		if (this.useApi) {
			await this.loadEmails();
		}
	}

	toggleSidebar() {
		this.sidebarOpen = !this.sidebarOpen;
	}

	// --- Context menu ---

	openContextMenu(x: number, y: number, emailId: string) {
		this.contextMenu = { x, y, emailId };
	}

	closeContextMenu() {
		this.contextMenu = null;
	}
}

export const emailStore = new EmailStore();
