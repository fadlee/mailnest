<script lang="ts">
	import { goto } from '$app/navigation';
	import { emailStore } from '$lib/stores/email.svelte.js';
	import { themeStore } from '$lib/stores/theme.svelte.js';
	import { Menu, Search, Sun, Moon, Settings, RefreshCw, LogOut, X } from 'lucide-svelte';

	let searchTimer: ReturnType<typeof setTimeout>;
	let loggingOut = $state(false);

	function handleSearch(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		emailStore.searchQuery = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			emailStore.search(value);
		}, 300);
	}

	function clearSearch() {
		emailStore.searchQuery = '';
		emailStore.search('');
	}

	async function handleRefresh() {
		await emailStore.refresh();
	}

	async function handleLogout() {
		loggingOut = true;
		try {
			await fetch('/api/auth', { method: 'DELETE' });
		} catch {
			// Ignore
		}
		emailStore.reset();
		goto('/login');
	}
</script>

<header class="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-4">
	<button
		class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
		onclick={() => emailStore.toggleSidebar()}
	>
		<Menu class="h-5 w-5" />
	</button>

	<div class="relative flex flex-1 items-center">
		<Search class="absolute left-3 h-4 w-4 text-muted-foreground" />
		<input
			type="text"
			placeholder="Search emails..."
			class="h-9 w-full max-w-md rounded-lg border border-input bg-secondary/50 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
			value={emailStore.searchQuery}
			oninput={handleSearch}
		/>
		{#if emailStore.searchQuery}
			<button
				class="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
				onclick={clearSearch}
			>
				<X class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>

	<div class="flex items-center gap-1">
		<button
			class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			class:animate-spin={emailStore.loading}
			title="Refresh"
			onclick={handleRefresh}
		>
			<RefreshCw class="h-4 w-4" />
		</button>

		<button
			class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			title="Toggle theme"
			onclick={() => { themeStore.toggle(); themeStore.save(); }}
		>
			{#if themeStore.isDark}
				<Sun class="h-4 w-4" />
			{:else}
				<Moon class="h-4 w-4" />
			{/if}
		</button>

		<a
			href="/settings"
			class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			title="Settings"
		>
			<Settings class="h-4 w-4" />
		</a>

		<button
			class="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
			title="Logout"
			disabled={loggingOut}
			onclick={handleLogout}
		>
			<LogOut class="h-4 w-4" />
		</button>
	</div>
</header>
