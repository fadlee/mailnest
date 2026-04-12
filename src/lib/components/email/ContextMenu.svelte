<script lang="ts">
	import { emailStore } from '$lib/stores/email.svelte.js';
	import {
		Mail,
		MailOpen,
		Star,
		StarOff,
		Archive,
		Inbox,
		Trash2,
		RotateCcw,
		XCircle
	} from 'lucide-svelte';

	let menu = $derived(emailStore.contextMenu);
	let email = $derived(menu ? emailStore.emails.find((e) => e.id === menu.emailId) : null);

	function handleAction(action: () => void) {
		action();
		emailStore.closeContextMenu();
	}

	function handleClickOutside() {
		emailStore.closeContextMenu();
	}
</script>

{#if menu && email}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100]"
		onclick={handleClickOutside}
		oncontextmenu={(e) => { e.preventDefault(); handleClickOutside(); }}
		onkeydown={(e) => e.key === 'Escape' && handleClickOutside()}
		role="presentation"
	>
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="absolute z-[101] min-w-48 rounded-lg border border-border bg-popover p-1 shadow-lg"
			style="left: {menu.x}px; top: {menu.y}px;"
			onclick={(e) => e.stopPropagation()}
			role="menu"
		>
			<!-- Mark as Read / Unread -->
			<button
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
				onclick={() => handleAction(() => emailStore.toggleRead(email!.id))}
				role="menuitem"
			>
				{#if email.isRead}
					<MailOpen class="h-4 w-4 text-muted-foreground" />
					<span>Mark as unread</span>
				{:else}
					<Mail class="h-4 w-4 text-muted-foreground" />
					<span>Mark as read</span>
				{/if}
			</button>

			<!-- Star / Unstar -->
			<button
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
				onclick={() => handleAction(() => emailStore.toggleStar(email!.id))}
				role="menuitem"
			>
				{#if email.isStarred}
					<StarOff class="h-4 w-4 text-muted-foreground" />
					<span>Unstar</span>
				{:else}
					<Star class="h-4 w-4 text-muted-foreground" />
					<span>Star</span>
				{/if}
			</button>

			<div class="my-1 border-t border-border"></div>

			<!-- Context-aware folder actions -->
			{#if emailStore.currentFolder === 'trash'}
				<!-- In Trash: Restore + Permanently Delete -->
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
					onclick={() => handleAction(() => emailStore.moveToInbox(email!.id))}
					role="menuitem"
				>
					<RotateCcw class="h-4 w-4 text-muted-foreground" />
					<span>Restore to inbox</span>
				</button>
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
					onclick={() => {
						if (confirm('Permanently delete this email? This cannot be undone.')) {
							handleAction(() => emailStore.deleteEmail(email!.id));
						}
					}}
					role="menuitem"
				>
					<XCircle class="h-4 w-4" />
					<span>Delete permanently</span>
				</button>
			{:else if emailStore.currentFolder === 'archive'}
				<!-- In Archive: Move to Inbox + Trash -->
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
					onclick={() => handleAction(() => emailStore.moveToInbox(email!.id))}
					role="menuitem"
				>
					<Inbox class="h-4 w-4 text-muted-foreground" />
					<span>Move to inbox</span>
				</button>
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
					onclick={() => handleAction(() => emailStore.moveToTrash(email!.id))}
					role="menuitem"
				>
					<Trash2 class="h-4 w-4 text-muted-foreground" />
					<span>Move to trash</span>
				</button>
			{:else}
				<!-- In Inbox/Starred: Archive + Trash -->
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
					onclick={() => handleAction(() => emailStore.archiveEmail(email!.id))}
					role="menuitem"
				>
					<Archive class="h-4 w-4 text-muted-foreground" />
					<span>Archive</span>
				</button>
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent"
					onclick={() => handleAction(() => emailStore.moveToTrash(email!.id))}
					role="menuitem"
				>
					<Trash2 class="h-4 w-4 text-muted-foreground" />
					<span>Move to trash</span>
				</button>
			{/if}
		</div>
	</div>
{/if}
