<script lang="ts">
	import { cn } from '$lib/utils/index.js';
	import { formatDate, getInitials, getAvatarColor, truncate } from '$lib/utils/index.js';
	import { emailStore } from '$lib/stores/email.svelte.js';
	import {
		Star,
		Paperclip,
		Archive,
		Trash2,
		Mail,
		MailOpen,
		Inbox,
		RotateCcw,
		XCircle,
		Loader2
	} from 'lucide-svelte';

	const folderLabels: Record<string, string> = {
		inbox: 'Inbox',
		starred: 'Starred',
		archive: 'Archive',
		trash: 'Trash'
	};

	const folderEmptyMessages: Record<string, { title: string; desc: string }> = {
		inbox: { title: 'Inbox is empty', desc: 'New emails will appear here' },
		starred: { title: 'No starred emails', desc: 'Star emails to find them easily' },
		archive: { title: 'No archived emails', desc: 'Archived emails will appear here' },
		trash: { title: 'Trash is empty', desc: 'Deleted emails will appear here' }
	};

	function handleContextMenu(e: MouseEvent, emailId: string) {
		e.preventDefault();
		emailStore.openContextMenu(e.clientX, e.clientY, emailId);
	}

	function handleCheckboxClick(e: MouseEvent, emailId: string) {
		e.stopPropagation();
		emailStore.toggleSelect(emailId);
	}
</script>

<div class="flex h-full flex-col border-r border-border bg-background">
	<!-- List header -->
	<div class="flex h-12 items-center gap-2 border-b border-border px-3">
		<!-- Select all checkbox -->
		<input
			type="checkbox"
			class="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary"
			checked={emailStore.allSelected && emailStore.filteredEmails.length > 0}
			indeterminate={emailStore.hasSelection && !emailStore.allSelected}
			onchange={() => {
				if (emailStore.allSelected) {
					emailStore.deselectAll();
				} else {
					emailStore.selectAll();
				}
			}}
		/>

		{#if emailStore.hasSelection}
			<!-- Bulk actions toolbar -->
			<div class="flex flex-1 items-center gap-0.5">
				<span class="mr-1 text-xs font-medium text-muted-foreground">
					{emailStore.selectedIds.size}
				</span>

				{#if emailStore.currentFolder === 'trash'}
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Restore to inbox"
						onclick={() => emailStore.bulkMoveToInbox()}
					>
						<RotateCcw class="h-3.5 w-3.5" />
					</button>
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						title="Delete permanently"
						onclick={() => {
							if (confirm(`Permanently delete ${emailStore.selectedIds.size} email(s)?`)) {
								emailStore.bulkDelete();
							}
						}}
					>
						<XCircle class="h-3.5 w-3.5" />
					</button>
				{:else if emailStore.currentFolder === 'archive'}
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Move to inbox"
						onclick={() => emailStore.bulkMoveToInbox()}
					>
						<Inbox class="h-3.5 w-3.5" />
					</button>
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Move to trash"
						onclick={() => emailStore.bulkTrash()}
					>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				{:else}
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Mark as read"
						onclick={() => emailStore.bulkMarkRead()}
					>
						<Mail class="h-3.5 w-3.5" />
					</button>
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Mark as unread"
						onclick={() => emailStore.bulkMarkUnread()}
					>
						<MailOpen class="h-3.5 w-3.5" />
					</button>
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Archive"
						onclick={() => emailStore.bulkArchive()}
					>
						<Archive class="h-3.5 w-3.5" />
					</button>
					<button
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Move to trash"
						onclick={() => emailStore.bulkTrash()}
					>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		{:else}
			<!-- Normal header -->
			<div class="flex flex-1 items-center gap-2">
				<h2 class="text-sm font-semibold text-foreground">
					{folderLabels[emailStore.currentFolder] ?? 'Inbox'}
				</h2>
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
					{emailStore.filteredEmails.length}
				</span>
			</div>
		{/if}
	</div>

	<!-- Email items -->
	<div class="flex-1 overflow-y-auto">
		{#if emailStore.loading && emailStore.emails.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
				<Loader2 class="mb-3 h-8 w-8 animate-spin opacity-50" />
				<p class="text-sm">Loading emails...</p>
			</div>
		{:else if emailStore.filteredEmails.length === 0}
			{@const emptyMsg = folderEmptyMessages[emailStore.currentFolder] || { title: 'No emails found', desc: '' }}
			<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
				<svg class="mb-3 h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
				</svg>
				<p class="text-sm font-medium">{emptyMsg.title}</p>
				{#if emptyMsg.desc}
					<p class="mt-1 text-xs">{emptyMsg.desc}</p>
				{/if}
			</div>
		{:else}
			{#each emailStore.filteredEmails as email (email.id)}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					class={cn(
						'flex w-full items-center gap-2 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-accent/50',
						emailStore.selectedEmailId === email.id && 'bg-accent',
						!email.isRead && 'bg-primary/[0.03]',
						emailStore.isSelected(email.id) && 'bg-primary/[0.06]'
					)}
					oncontextmenu={(e) => handleContextMenu(e, email.id)}
					role="row"
				>
					<!-- Checkbox -->
					<input
						type="checkbox"
						class="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary"
						checked={emailStore.isSelected(email.id)}
						onclick={(e) => handleCheckboxClick(e, email.id)}
					/>

					<!-- Email content (clickable) -->
					<button
						class="flex min-w-0 flex-1 gap-3 text-left"
						onclick={() => emailStore.selectEmail(email.id)}
					>
						<div
							class={cn(
								'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
								getAvatarColor(email.fromName)
							)}
						>
							{getInitials(email.fromName)}
						</div>

						<div class="min-w-0 flex-1">
							<div class="flex items-center justify-between gap-2">
								<span
									class={cn(
										'truncate text-sm',
										!email.isRead ? 'font-semibold text-foreground' : 'text-foreground/80'
									)}
								>
									{email.fromName}
								</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{formatDate(email.date)}
								</span>
							</div>
							<p
								class={cn(
									'truncate text-sm',
									!email.isRead ? 'font-medium text-foreground' : 'text-muted-foreground'
								)}
							>
								{email.subject}
							</p>
							<div class="mt-0.5 flex items-center gap-2">
								<p class="flex-1 truncate text-xs text-muted-foreground">
									{truncate(email.bodyText, 80)}
								</p>
								{#if email.attachments.length > 0}
									<Paperclip class="h-3 w-3 shrink-0 text-muted-foreground" />
								{/if}
							</div>
						</div>
					</button>

					<!-- Star -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						class={cn(
							'shrink-0 cursor-pointer rounded p-1 transition-colors',
							email.isStarred
								? 'text-amber-400 hover:text-amber-500'
								: 'text-muted-foreground/20 hover:text-amber-400'
						)}
						role="checkbox"
						tabindex={0}
						aria-checked={email.isStarred}
						onclick={(e: MouseEvent) => {
							e.stopPropagation();
							emailStore.toggleStar(email.id);
						}}
						onkeydown={(e: KeyboardEvent) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.stopPropagation();
								emailStore.toggleStar(email.id);
							}
						}}
					>
						<Star class={cn('h-4 w-4', email.isStarred && 'fill-current')} />
					</span>
				</div>
			{/each}
		{/if}
	</div>
</div>
