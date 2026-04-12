<script lang="ts">
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/stores/theme.svelte.js';
	import {
		ArrowLeft,
		Plus,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Shield,
		Mail,
		Sun,
		Moon,
		Save,
		AtSign,
		UserPlus,
		Crown
	} from 'lucide-svelte';
	import { cn } from '$lib/utils/index.js';
	import * as api from '$lib/api.js';
	import type { EmailAddress } from '$lib/types.js';

	// --- Email Addresses ---
	let addresses = $state<EmailAddress[]>([]);
	let mailDomain = $state('example.com');
	let addressLoading = $state(false);
	let showAddAddress = $state(false);
	let addressError = $state('');
	let newAddress = $state({ username: '', displayName: '', role: 'member' });

	// --- Routing Rules ---
	interface Rule {
		id: string;
		name: string;
		pattern: string;
		matchType: string;
		action: string;
		destination?: string;
		priority: number;
		enabled: boolean;
	}

	let rules = $state<Rule[]>([]);
	let ruleLoading = $state(false);
	let showAddRule = $state(false);
	let newRule = $state({
		name: '',
		pattern: '',
		matchType: 'exact',
		action: 'store',
		destination: '',
		priority: 0
	});

	onMount(async () => {
		await Promise.all([loadAddresses(), loadRules()]);
	});

	// --- Address functions ---
	async function loadAddresses() {
		addressLoading = true;
		try {
			const result = await api.fetchAddresses();
			addresses = result.addresses;
			mailDomain = result.domain || 'example.com';
		} catch {
			addresses = [];
		} finally {
			addressLoading = false;
		}
	}

	async function addAddress() {
		if (!newAddress.username) {
			addressError = 'Username is required';
			return;
		}
		addressError = '';
		try {
			await api.createAddress({
				username: newAddress.username,
				displayName: newAddress.displayName || undefined,
				role: newAddress.role
			});
			newAddress = { username: '', displayName: '', role: 'member' };
			showAddAddress = false;
			await loadAddresses();
		} catch (err) {
			addressError = err instanceof Error ? err.message : 'Failed to add address';
		}
	}

	async function removeAddress(id: string, email: string) {
		if (!confirm(`Delete ${email}? All emails for this address will also be deleted.`)) return;
		try {
			await api.deleteAddress(id);
			addresses = addresses.filter((a) => a.id !== id);
		} catch (err) {
			console.error('Failed to delete address:', err);
		}
	}

	// --- Rule functions ---
	async function loadRules() {
		ruleLoading = true;
		try {
			const result = await api.fetchRoutingRules();
			rules = result.rules as Rule[];
		} catch {
			rules = [];
		} finally {
			ruleLoading = false;
		}
	}

	async function addRule() {
		if (!newRule.name || !newRule.pattern) return;
		try {
			await api.createRoutingRule({
				name: newRule.name,
				pattern: newRule.pattern,
				matchType: newRule.matchType,
				action: newRule.action,
				destination: newRule.destination || undefined,
				priority: newRule.priority
			});
			newRule = { name: '', pattern: '', matchType: 'exact', action: 'store', destination: '', priority: 0 };
			showAddRule = false;
			await loadRules();
		} catch (err) {
			console.error('Failed to add rule:', err);
		}
	}

	async function toggleRule(rule: Rule) {
		try {
			await api.updateRoutingRule(rule.id, { enabled: !rule.enabled });
			rule.enabled = !rule.enabled;
		} catch (err) {
			console.error('Failed to toggle rule:', err);
		}
	}

	async function removeRule(id: string) {
		try {
			await api.deleteRoutingRule(id);
			rules = rules.filter((r) => r.id !== id);
		} catch (err) {
			console.error('Failed to delete rule:', err);
		}
	}
</script>

<svelte:head>
	<title>Settings - MailNest</title>
</svelte:head>

<div class="flex h-screen flex-col bg-background">
	<!-- Header -->
	<header class="flex h-14 items-center gap-3 border-b border-border px-4">
		<a
			href="/"
			class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<h1 class="text-lg font-semibold text-foreground">Settings</h1>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl space-y-8 p-6">

			<!-- ==================== EMAIL ADDRESSES ==================== -->
			<section>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="flex items-center gap-2 text-base font-semibold text-foreground">
						<AtSign class="h-5 w-5" />
						Email Addresses
					</h2>
					<button
						class="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						onclick={() => (showAddAddress = !showAddAddress)}
					>
						<UserPlus class="h-4 w-4" />
						Add Address
					</button>
				</div>

				<p class="mb-4 text-sm text-muted-foreground">
					Manage email addresses for <code class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">@{mailDomain}</code>.
					Emails sent to these addresses will appear in the inbox.
					Cloudflare Email Routing catch-all must point to this Worker.
				</p>

				<!-- Add address form -->
				{#if showAddAddress}
					<div class="mb-4 rounded-lg border border-border bg-card p-4">
						<h3 class="mb-3 font-medium text-card-foreground">New Email Address</h3>
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label for="addr-username" class="mb-1 block text-sm font-medium text-foreground">Username</label>
								<div class="flex items-center">
									<input
										id="addr-username"
										type="text"
										placeholder="e.g. info"
										class="w-full rounded-l-md border border-r-0 border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
										bind:value={newAddress.username}
									/>
									<span class="rounded-r-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
										@{mailDomain}
									</span>
								</div>
							</div>
							<div>
								<label for="addr-display" class="mb-1 block text-sm font-medium text-foreground">Display Name</label>
								<input
									id="addr-display"
									type="text"
									placeholder="e.g. Info Desk"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={newAddress.displayName}
								/>
							</div>
							<div>
								<label for="addr-role" class="mb-1 block text-sm font-medium text-foreground">Role</label>
								<select
									id="addr-role"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={newAddress.role}
								>
									<option value="member">Member</option>
									<option value="admin">Admin</option>
								</select>
							</div>
						</div>

						{#if addressError}
							<p class="mt-2 text-sm text-destructive">{addressError}</p>
						{/if}

						<div class="mt-4 flex gap-2">
							<button
								class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
								onclick={addAddress}
							>
								<Save class="h-4 w-4" />
								Create Address
							</button>
							<button
								class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
								onclick={() => { showAddAddress = false; addressError = ''; }}
							>
								Cancel
							</button>
						</div>
					</div>
				{/if}

				<!-- Addresses list -->
				<div class="space-y-2">
					{#if addressLoading}
						<div class="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
							Loading addresses...
						</div>
					{:else if addresses.length === 0}
						<div class="rounded-lg border border-border bg-card p-8 text-center">
							<Mail class="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
							<p class="text-sm text-muted-foreground">No email addresses configured yet.</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Add an address to start receiving emails.
							</p>
						</div>
					{:else}
						{#each addresses as addr (addr.id)}
							<div class="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
									<Mail class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium text-card-foreground">{addr.email}</span>
										{#if addr.role === 'admin'}
											<span class="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
												<Crown class="h-3 w-3" />
												Admin
											</span>
										{:else}
											<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
												Member
											</span>
										{/if}
									</div>
									{#if addr.displayName}
										<p class="mt-0.5 text-sm text-muted-foreground">{addr.displayName}</p>
									{/if}
								</div>
								<button
									class="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									onclick={() => removeAddress(addr.id, addr.email)}
									title="Delete address"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<!-- ==================== APPEARANCE ==================== -->
			<section>
				<h2 class="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
					{#if themeStore.isDark}
						<Moon class="h-5 w-5" />
					{:else}
						<Sun class="h-5 w-5" />
					{/if}
					Appearance
				</h2>
				<div class="rounded-lg border border-border bg-card p-4">
					<div class="flex items-center justify-between">
						<div>
							<p class="font-medium text-card-foreground">Dark Mode</p>
							<p class="text-sm text-muted-foreground">Toggle between light and dark theme</p>
						</div>
						<button
							class="text-foreground"
							onclick={() => {
								themeStore.toggle();
								themeStore.save();
							}}
						>
							{#if themeStore.isDark}
								<ToggleRight class="h-8 w-8 text-primary" />
							{:else}
								<ToggleLeft class="h-8 w-8 text-muted-foreground" />
							{/if}
						</button>
					</div>
				</div>
			</section>

			<!-- ==================== ROUTING RULES ==================== -->
			<section>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="flex items-center gap-2 text-base font-semibold text-foreground">
						<Shield class="h-5 w-5" />
						Email Routing Rules
					</h2>
					<button
						class="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						onclick={() => (showAddRule = !showAddRule)}
					>
						<Plus class="h-4 w-4" />
						Add Rule
					</button>
				</div>

				<!-- Add rule form -->
				{#if showAddRule}
					<div class="mb-4 rounded-lg border border-border bg-card p-4">
						<h3 class="mb-3 font-medium text-card-foreground">New Routing Rule</h3>
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label for="rule-name" class="mb-1 block text-sm font-medium text-foreground">Name</label>
								<input
									id="rule-name"
									type="text"
									placeholder="e.g. Forward newsletters"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={newRule.name}
								/>
							</div>
							<div>
								<label for="rule-pattern" class="mb-1 block text-sm font-medium text-foreground">Pattern</label>
								<input
									id="rule-pattern"
									type="text"
									placeholder="e.g. newsletter@* or *@domain.com"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={newRule.pattern}
								/>
							</div>
							<div>
								<label for="rule-match" class="mb-1 block text-sm font-medium text-foreground">Match Type</label>
								<select
									id="rule-match"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={newRule.matchType}
								>
									<option value="exact">Exact</option>
									<option value="contains">Contains</option>
									<option value="wildcard">Wildcard</option>
									<option value="regex">Regex</option>
								</select>
							</div>
							<div>
								<label for="rule-action" class="mb-1 block text-sm font-medium text-foreground">Action</label>
								<select
									id="rule-action"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={newRule.action}
								>
									<option value="store">Store in inbox</option>
									<option value="forward">Forward</option>
									<option value="reject">Reject</option>
									<option value="drop">Drop (silent)</option>
								</select>
							</div>
							{#if newRule.action === 'forward'}
								<div class="sm:col-span-2">
									<label for="rule-dest" class="mb-1 block text-sm font-medium text-foreground">Forward to</label>
									<input
										id="rule-dest"
										type="email"
										placeholder="forward@example.com"
										class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
										bind:value={newRule.destination}
									/>
								</div>
							{/if}
						</div>
						<div class="mt-4 flex gap-2">
							<button
								class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
								onclick={addRule}
							>
								<Save class="h-4 w-4" />
								Save Rule
							</button>
							<button
								class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
								onclick={() => (showAddRule = false)}
							>
								Cancel
							</button>
						</div>
					</div>
				{/if}

				<!-- Rules list -->
				<div class="space-y-2">
					{#if ruleLoading}
						<div class="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
							Loading rules...
						</div>
					{:else if rules.length === 0}
						<div class="rounded-lg border border-border bg-card p-8 text-center">
							<Shield class="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
							<p class="text-sm text-muted-foreground">No routing rules configured yet.</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Add rules to control how incoming emails are processed.
							</p>
						</div>
					{:else}
						{#each rules as rule (rule.id)}
							<div
								class={cn(
									'flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-opacity',
									!rule.enabled && 'opacity-50'
								)}
							>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium text-card-foreground">{rule.name}</span>
										<span
											class={cn(
												'rounded-full px-2 py-0.5 text-xs font-medium',
												rule.action === 'store' && 'bg-blue-500/10 text-blue-500',
												rule.action === 'forward' && 'bg-green-500/10 text-green-500',
												rule.action === 'reject' && 'bg-red-500/10 text-red-500',
												rule.action === 'drop' && 'bg-gray-500/10 text-gray-500'
											)}
										>
											{rule.action}
										</span>
									</div>
									<p class="mt-0.5 text-sm text-muted-foreground">
										{rule.matchType}: <code class="rounded bg-muted px-1">{rule.pattern}</code>
										{#if rule.destination}
											&rarr; {rule.destination}
										{/if}
									</p>
								</div>
								<button
									class="text-foreground"
									onclick={() => toggleRule(rule)}
									title={rule.enabled ? 'Disable' : 'Enable'}
								>
									{#if rule.enabled}
										<ToggleRight class="h-6 w-6 text-primary" />
									{:else}
										<ToggleLeft class="h-6 w-6 text-muted-foreground" />
									{/if}
								</button>
								<button
									class="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									onclick={() => removeRule(rule.id)}
									title="Delete rule"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<!-- ==================== ABOUT ==================== -->
			<section>
				<h2 class="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
					<Mail class="h-5 w-5" />
					About
				</h2>
				<div class="rounded-lg border border-border bg-card p-4">
					<p class="font-medium text-card-foreground">MailNest v0.1.0</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Where your emails come home. Receive-only email inbox powered by Cloudflare Workers, D1, and R2.
					</p>
					<p class="mt-2 text-xs text-muted-foreground">
						Setup: Cloudflare Dashboard &rarr; Email Routing &rarr; Catch-all &rarr; Send to Worker &rarr; mailnest
					</p>
				</div>
			</section>
		</div>
	</div>
</div>
