<script lang="ts">
	import { cn } from '$lib/utils/index.js';
	import { emailStore } from '$lib/stores/email.svelte.js';
	import { getInitials, getAvatarColor } from '$lib/utils/index.js';
	import type { Folder } from '$lib/types.js';
	import {
		Inbox,
		Star,
		Trash2,
		Archive,
		X,
		Mail,
		ChevronUp,
		ChevronDown,
		Users,
		Crown
	} from 'lucide-svelte';

	const folders: { id: Folder; name: string; icon: typeof Inbox }[] = [
		{ id: 'inbox', name: 'Inbox', icon: Inbox },
		{ id: 'starred', name: 'Starred', icon: Star },
		{ id: 'archive', name: 'Archive', icon: Archive },
		{ id: 'trash', name: 'Trash', icon: Trash2 }
	];

	let showSwitcher = $state(false);

	function handleFolderClick(folderId: Folder) {
		emailStore.setFolder(folderId);
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			emailStore.sidebarOpen = false;
		}
	}

	function handleAddressSelect(email: string | null) {
		emailStore.setAddress(email);
		showSwitcher = false;
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			emailStore.sidebarOpen = false;
		}
	}

	// Close switcher when clicking outside
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.address-switcher')) {
			showSwitcher = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<!-- Mobile overlay -->
{#if emailStore.sidebarOpen}
	<div
		class="fixed inset-0 z-40 bg-black/50 md:hidden"
		role="button"
		tabindex="-1"
		onclick={() => (emailStore.sidebarOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (emailStore.sidebarOpen = false)}
	></div>
{/if}

<aside
	class={cn(
		'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:relative md:z-0 md:translate-x-0',
		emailStore.sidebarOpen ? 'translate-x-0' : '-translate-x-full'
	)}
>
	<!-- Brand -->
	<div class="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
		<div class="flex items-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
				<Mail class="h-4 w-4 text-sidebar-primary-foreground" />
			</div>
			<span class="text-lg font-semibold text-sidebar-foreground">MailNest</span>
		</div>
		<button
			class="rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
			onclick={() => (emailStore.sidebarOpen = false)}
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<!-- Folders -->
	<nav class="flex-1 space-y-1 overflow-y-auto p-3">
		{#each folders as folder}
			{@const unread = emailStore.unreadCount(folder.id)}
			<button
				class={cn(
					'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
					emailStore.currentFolder === folder.id
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
				)}
				onclick={() => handleFolderClick(folder.id)}
			>
				<folder.icon class="h-4 w-4 shrink-0" />
				<span class="flex-1 text-left">{folder.name}</span>
				{#if unread > 0}
					<span
						class="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-xs font-semibold text-sidebar-primary-foreground"
					>
						{unread}
					</span>
				{/if}
			</button>
		{/each}
	</nav>

	<!-- Address Switcher -->
	<div class="address-switcher relative border-t border-sidebar-border p-3">
		<!-- Dropdown (opens upward) -->
		{#if showSwitcher}
			<div class="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-sidebar-border bg-sidebar p-2 shadow-lg">
				<div class="max-h-64 overflow-y-auto">
					<!-- All Inboxes -->
					<button
						class={cn(
							'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
							emailStore.selectedAddress === null
								? 'bg-sidebar-accent text-sidebar-accent-foreground'
								: 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
						)}
						onclick={() => handleAddressSelect(null)}
					>
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary">
							<Users class="h-4 w-4" />
						</div>
						<div class="flex-1 text-left">
							<p class="font-medium">All Inboxes</p>
							<p class="text-xs text-sidebar-foreground/50">{emailStore.addresses.length} addresses</p>
						</div>
					</button>

					{#if emailStore.addresses.length > 0}
						<div class="my-1.5 border-t border-sidebar-border"></div>
					{/if}

					<!-- Address list -->
					{#each emailStore.addresses as addr (addr.id)}
						<button
							class={cn(
								'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
								emailStore.selectedAddress === addr.email
									? 'bg-sidebar-accent text-sidebar-accent-foreground'
									: 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
							)}
							onclick={() => handleAddressSelect(addr.email)}
						>
							<div
								class={cn(
									'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
									getAvatarColor(addr.email)
								)}
							>
								{getInitials(addr.displayName || addr.email.split('@')[0])}
							</div>
							<div class="min-w-0 flex-1 text-left">
								<div class="flex items-center gap-1.5">
									<p class="truncate font-medium">{addr.email}</p>
									{#if addr.role === 'admin'}
										<Crown class="h-3 w-3 shrink-0 text-amber-500" />
									{/if}
								</div>
								{#if addr.displayName}
									<p class="truncate text-xs text-sidebar-foreground/50">{addr.displayName}</p>
								{/if}
							</div>
						</button>
					{/each}

					{#if emailStore.addresses.length === 0}
						<p class="px-3 py-2 text-xs text-sidebar-foreground/50">
							No addresses configured. Go to Settings to add one.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Current address button -->
		<button
			class="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-accent/50"
			onclick={(e: MouseEvent) => { e.stopPropagation(); showSwitcher = !showSwitcher; }}
		>
			{#if emailStore.selectedAddress === null}
				<!-- All Inboxes -->
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary">
					<Users class="h-4 w-4" />
				</div>
				<div class="flex-1 overflow-hidden text-left">
					<p class="truncate text-sm font-medium text-sidebar-foreground">All Inboxes</p>
					<p class="truncate text-xs text-sidebar-foreground/60">{emailStore.addresses.length} addresses</p>
				</div>
			{:else if emailStore.currentAddress}
				<!-- Specific address -->
				<div
					class={cn(
						'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
						getAvatarColor(emailStore.currentAddress.email)
					)}
				>
					{getInitials(emailStore.currentAddress.displayName || emailStore.currentAddress.email.split('@')[0])}
				</div>
				<div class="flex-1 overflow-hidden text-left">
					<p class="truncate text-sm font-medium text-sidebar-foreground">{emailStore.currentAddress.email}</p>
					<p class="truncate text-xs text-sidebar-foreground/60">{emailStore.currentAddress.displayName || emailStore.currentAddress.role}</p>
				</div>
			{:else}
				<!-- Fallback -->
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
					MN
				</div>
				<div class="flex-1 overflow-hidden text-left">
					<p class="truncate text-sm font-medium text-sidebar-foreground">MailNest</p>
					<p class="truncate text-xs text-sidebar-foreground/60">No addresses</p>
				</div>
			{/if}
			{#if showSwitcher}
				<ChevronUp class="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
			{:else}
				<ChevronDown class="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
			{/if}
		</button>
	</div>
</aside>
