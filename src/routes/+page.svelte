<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import EmailList from '$lib/components/email/EmailList.svelte';
	import EmailDetail from '$lib/components/email/EmailDetail.svelte';
	import ContextMenu from '$lib/components/email/ContextMenu.svelte';
	import { emailStore } from '$lib/stores/email.svelte.js';
	import { Loader2 } from 'lucide-svelte';

	let pollInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		emailStore.init();

		pollInterval = setInterval(() => {
			if (emailStore.useApi && !emailStore.loading) {
				emailStore.refresh();
			}
		}, 30000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});
</script>

<svelte:head>
	<title>MailNest - Where your emails come home</title>
	<meta name="description" content="MailNest - A Cloudflare-powered email router & inbox dashboard" />
</svelte:head>

{#if !emailStore.initialized}
	<div class="flex h-screen w-screen items-center justify-center bg-background">
		<div class="flex flex-col items-center gap-3 text-muted-foreground">
			<Loader2 class="h-8 w-8 animate-spin" />
			<p class="text-sm">Loading MailNest...</p>
		</div>
	</div>
{:else}
	<div class="flex h-screen w-screen overflow-hidden">
		<Sidebar />

		<div class="flex min-w-0 flex-1 flex-col">
			<Header />

			<div class="flex min-h-0 flex-1">
				<div
					class="w-full shrink-0 md:w-80 lg:w-96"
					class:hidden={emailStore.selectedEmailId !== null}
					class:md:block={true}
				>
					<EmailList />
				</div>

				<div
					class="min-w-0 flex-1"
					class:hidden={emailStore.selectedEmailId === null}
					class:md:block={true}
				>
					<EmailDetail />
				</div>
			</div>
		</div>
	</div>

	<ContextMenu />
{/if}
