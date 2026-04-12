<script lang="ts">
	import { cn } from '$lib/utils/index.js';
	import { formatDate, getInitials, getAvatarColor } from '$lib/utils/index.js';
	import { emailStore } from '$lib/stores/email.svelte.js';
	import DOMPurify from 'isomorphic-dompurify';
	import {
		ArrowLeft,
		Star,
		Trash2,
		Archive,
		Inbox,
		RotateCcw,
		XCircle,
		Paperclip,
		Download,
		Mail,
		MailOpen
	} from 'lucide-svelte';

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function getFileIcon(contentType: string): string {
		if (contentType.startsWith('image/')) return '🖼️';
		if (contentType === 'application/pdf') return '📄';
		if (contentType.includes('zip') || contentType.includes('archive')) return '📦';
		if (contentType.includes('spreadsheet') || contentType.includes('excel')) return '📊';
		if (contentType.includes('document') || contentType.includes('word')) return '📝';
		return '📎';
	}

	function sanitizeHtml(html: string): string {
		return DOMPurify.sanitize(html, {
			ALLOWED_TAGS: [
				'p', 'br', 'b', 'i', 'u', 'em', 'strong', 'a', 'img',
				'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
				'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
				'table', 'thead', 'tbody', 'tr', 'th', 'td',
				'div', 'span', 'hr', 'sub', 'sup', 'small'
			],
			ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'class', 'target', 'width', 'height'],
			ALLOW_DATA_ATTR: false
		});
	}

	function downloadAttachment(attachmentId: string, filename: string) {
		const link = document.createElement('a');
		link.href = `/api/attachments/${attachmentId}`;
		link.download = filename;
		link.click();
	}

	function handlePermanentDelete(id: string) {
		if (confirm('Permanently delete this email? This cannot be undone.')) {
			emailStore.deleteEmail(id);
		}
	}
</script>

{#if emailStore.selectedEmail}
	{@const email = emailStore.selectedEmail}
	<div class="flex h-full flex-col bg-background">
		<!-- Toolbar -->
		<div class="flex h-12 items-center gap-1 border-b border-border px-3">
			<button
				class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
				onclick={() => emailStore.deselectEmail()}
				title="Back"
			>
				<ArrowLeft class="h-4 w-4" />
			</button>

			<div class="flex-1"></div>

			<!-- Mark as read/unread -->
			<button
				class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
				onclick={() => emailStore.toggleRead(email.id)}
				title={email.isRead ? 'Mark as unread' : 'Mark as read'}
			>
				{#if email.isRead}
					<Mail class="h-4 w-4" />
				{:else}
					<MailOpen class="h-4 w-4" />
				{/if}
			</button>

			<!-- Star -->
			<button
				class={cn(
					'rounded-md p-2 transition-colors',
					email.isStarred
						? 'text-amber-400 hover:text-amber-500'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'
				)}
				onclick={() => emailStore.toggleStar(email.id)}
				title={email.isStarred ? 'Unstar' : 'Star'}
			>
				<Star class={cn('h-4 w-4', email.isStarred && 'fill-current')} />
			</button>

			<!-- Context-aware folder actions -->
			{#if emailStore.currentFolder === 'trash'}
				<!-- Trash: Restore + Permanently Delete -->
				<button
					class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={() => emailStore.moveToInbox(email.id)}
					title="Restore to inbox"
				>
					<RotateCcw class="h-4 w-4" />
				</button>
				<button
					class="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					onclick={() => handlePermanentDelete(email.id)}
					title="Delete permanently"
				>
					<XCircle class="h-4 w-4" />
				</button>
			{:else if emailStore.currentFolder === 'archive'}
				<!-- Archive: Move to Inbox + Trash -->
				<button
					class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={() => emailStore.moveToInbox(email.id)}
					title="Move to inbox"
				>
					<Inbox class="h-4 w-4" />
				</button>
				<button
					class="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					onclick={() => emailStore.moveToTrash(email.id)}
					title="Move to trash"
				>
					<Trash2 class="h-4 w-4" />
				</button>
			{:else}
				<!-- Inbox/Starred: Archive + Trash -->
				<button
					class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={() => emailStore.archiveEmail(email.id)}
					title="Archive"
				>
					<Archive class="h-4 w-4" />
				</button>
				<button
					class="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					onclick={() => emailStore.moveToTrash(email.id)}
					title="Move to trash"
				>
					<Trash2 class="h-4 w-4" />
				</button>
			{/if}
		</div>

		<!-- Email content -->
		<div class="flex-1 overflow-y-auto">
			<div class="mx-auto max-w-3xl p-4 md:p-6">
				<!-- Subject -->
				<h1 class="mb-4 text-xl font-semibold text-foreground md:text-2xl">
					{email.subject}
				</h1>

				<!-- Sender info -->
				<div class="mb-6 flex items-start gap-3">
					<div
						class={cn(
							'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
							getAvatarColor(email.fromName)
						)}
					>
						{getInitials(email.fromName)}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="font-medium text-foreground">{email.fromName}</span>
							<span class="text-xs text-muted-foreground">
								&lt;{email.fromAddress}&gt;
							</span>
						</div>
						<div class="flex items-center gap-1 text-xs text-muted-foreground">
							<span>to {email.toAddress}</span>
							<span class="mx-1">·</span>
							<span>{formatDate(email.date)}</span>
						</div>
					</div>
				</div>

				<!-- Attachments -->
				{#if email.attachments.length > 0}
					<div class="mb-6 rounded-lg border border-border p-3">
						<div class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
							<Paperclip class="h-4 w-4" />
							<span>{email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}</span>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each email.attachments as attachment}
								<button
									class="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm transition-colors hover:bg-muted"
									onclick={() => downloadAttachment(attachment.id, attachment.filename)}
								>
									<span>{getFileIcon(attachment.contentType)}</span>
									<div class="text-left">
										<p class="font-medium text-foreground">{attachment.filename}</p>
										<p class="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
									</div>
									<Download class="ml-1 h-3.5 w-3.5 text-muted-foreground" />
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Body (sanitized) -->
				<div class="prose prose-sm dark:prose-invert max-w-none">
					{#if email.bodyHtml}
						{@html sanitizeHtml(email.bodyHtml)}
					{:else}
						<pre class="whitespace-pre-wrap font-sans">{email.bodyText}</pre>
					{/if}
				</div>
			</div>
		</div>
	</div>
{:else}
	<!-- Empty state -->
	<div class="flex h-full flex-col items-center justify-center bg-background text-muted-foreground">
		<svg class="mb-4 h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="1"
				d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
			/>
		</svg>
		<p class="text-lg font-medium">Select an email to read</p>
		<p class="mt-1 text-sm">Choose from the list on the left</p>
	</div>
{/if}
