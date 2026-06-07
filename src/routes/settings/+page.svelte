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
		Crown,
		Send,
		User,
		KeyRound
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

	// --- Admin Credentials ---
	let adminLoading = $state(false);
	let adminSaving = $state(false);
	let adminError = $state('');
	let adminSuccess = $state('');
	let adminForm = $state({ username: '' });

	// --- Telegram Forwarding ---
	let telegramLoading = $state(false);
	let telegramSaving = $state(false);
	let telegramTesting = $state(false);
	let telegramChatsLoading = $state(false);
	let telegramError = $state('');
	let telegramSuccess = $state('');
	let telegramSettings = $state<api.TelegramSettings | null>(null);
	let telegramChats = $state<api.TelegramChatOption[]>([]);
	let telegramForm = $state({ enabled: false, includeLinks: false, botToken: '', defaultChatId: '' });

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
		await Promise.all([loadAddresses(), loadRules(), loadTelegramSettings(), loadAdminSettings()]);
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

	async function loadAdminSettings() {
		adminLoading = true;
		adminError = '';
		try {
			const settings = await api.fetchAdminSettings();
			adminForm.username = settings.username;
		} catch (err) {
			adminError = err instanceof Error ? err.message : 'Failed to load admin settings';
		} finally {
			adminLoading = false;
		}
	}

	async function saveAdminSettings() {
		if (!adminForm.username.trim()) {
			adminError = 'Username is required';
			adminSuccess = '';
			return;
		}

		adminSaving = true;
		adminError = '';
		adminSuccess = '';
		try {
			const settings = await api.saveAdminSettings({ username: adminForm.username.trim() });
			adminForm.username = settings.username;
			adminSuccess = 'Admin username saved.';
		} catch (err) {
			adminError = err instanceof Error ? err.message : 'Failed to save admin settings';
		} finally {
			adminSaving = false;
		}
	}

	async function loadTelegramSettings() {
		telegramLoading = true;
		telegramError = '';
		try {
			telegramSettings = await api.fetchTelegramSettings();
			telegramForm = {
				enabled: telegramSettings.enabled,
				includeLinks: telegramSettings.includeLinks,
				botToken: '',
				defaultChatId: telegramSettings.defaultChatId || ''
			};
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to load Telegram settings';
		} finally {
			telegramLoading = false;
		}
	}

	async function saveTelegramForwarding() {
		telegramSaving = true;
		telegramError = '';
		telegramSuccess = '';
		try {
			telegramSettings = await api.saveTelegramSettings({
				enabled: telegramForm.enabled,
				includeLinks: telegramForm.includeLinks,
				botToken: telegramForm.botToken || undefined,
				defaultChatId: telegramForm.defaultChatId
			});
			telegramForm.botToken = '';
			telegramForm.defaultChatId = telegramSettings.defaultChatId || '';
			telegramSuccess = 'Telegram settings saved.';
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to save Telegram settings';
		} finally {
			telegramSaving = false;
		}
	}

	async function testTelegramForwarding() {
		telegramTesting = true;
		telegramError = '';
		telegramSuccess = '';
		try {
			await api.sendTelegramTestMessage(telegramForm.defaultChatId || undefined);
			telegramSuccess = 'Test message sent.';
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to send test message';
		} finally {
			telegramTesting = false;
		}
	}

	async function getTelegramChats() {
		telegramChatsLoading = true;
		telegramError = '';
		telegramSuccess = '';
		telegramChats = [];
		try {
			const result = await api.fetchTelegramChats(telegramForm.botToken || undefined);
			telegramChats = result.chats;
			if (telegramChats.length === 0) {
				telegramError = 'No chats found. Send a message to the bot or add it to a group, then try again.';
			}
		} catch (err) {
			telegramError = err instanceof Error ? err.message : 'Failed to get Telegram chats';
		} finally {
			telegramChatsLoading = false;
		}
	}

	function useTelegramChat(chat: api.TelegramChatOption) {
		telegramForm.defaultChatId = chat.id;
		telegramSuccess = `Selected ${chat.title}.`;
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

			<!-- ==================== ADMIN CREDENTIALS ==================== -->
			<section>
				<h2 class="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
					<KeyRound class="h-5 w-5" />
					Admin Credentials
				</h2>
				<div class="rounded-lg border border-border bg-card p-4">
					{#if adminLoading}
						<p class="text-sm text-muted-foreground">Loading admin settings...</p>
					{:else}
						<div>
							<label for="admin-username" class="mb-1 block text-sm font-medium text-foreground">Admin Username</label>
							<div class="relative">
								<User class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<input
									id="admin-username"
									type="text"
									placeholder="Enter admin username"
									class="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={adminForm.username}
								/>
							</div>
							<p class="mt-2 text-xs text-muted-foreground">
								This username is used on the login page and stored in the `settings` table as `admin_username`.
							</p>
						</div>

						{#if adminError}
							<p class="mt-3 text-sm text-destructive">{adminError}</p>
						{/if}
						{#if adminSuccess}
							<p class="mt-3 text-sm text-green-600 dark:text-green-400">{adminSuccess}</p>
						{/if}

						<div class="mt-4 flex flex-wrap gap-2">
							<button
								class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
								disabled={adminSaving}
								onclick={saveAdminSettings}
							>
								<Save class="h-4 w-4" />
								{adminSaving ? 'Saving...' : 'Save Admin Username'}
							</button>
							<a
								href="/login/reset"
								class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
							>
								Reset password & username
							</a>
						</div>
					{/if}
				</div>
			</section>

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

			<!-- ==================== TELEGRAM FORWARDING ==================== -->
			<section>
				<h2 class="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
					<Send class="h-5 w-5" />
					Telegram Forwarding
				</h2>
				<div class="rounded-lg border border-border bg-card p-4">
					{#if telegramLoading}
						<p class="text-sm text-muted-foreground">Loading Telegram settings...</p>
					{:else}
						<div class="mb-4 flex items-center justify-between gap-4">
							<div>
								<p class="font-medium text-card-foreground">Forward all incoming emails</p>
								<p class="text-sm text-muted-foreground">
									Emails are still stored in MailNest. When enabled, the full message body is also sent to Telegram.
								</p>
							</div>
							<button
								class="text-foreground"
								onclick={() => (telegramForm.enabled = !telegramForm.enabled)}
								title={telegramForm.enabled ? 'Disable Telegram forwarding' : 'Enable Telegram forwarding'}
							>
								{#if telegramForm.enabled}
									<ToggleRight class="h-8 w-8 text-primary" />
								{:else}
									<ToggleLeft class="h-8 w-8 text-muted-foreground" />
								{/if}
							</button>
						</div>

						<div class="mb-4 flex items-center justify-between gap-4 rounded-md border border-border bg-background p-3">
							<div>
								<p class="font-medium text-card-foreground">Forward links</p>
								<p class="text-sm text-muted-foreground">
									Include links found in the email body. Turn off to forward text only.
								</p>
							</div>
							<button
								class="text-foreground"
								onclick={() => (telegramForm.includeLinks = !telegramForm.includeLinks)}
								title={telegramForm.includeLinks ? 'Disable forwarded links' : 'Enable forwarded links'}
							>
								{#if telegramForm.includeLinks}
									<ToggleRight class="h-8 w-8 text-primary" />
								{:else}
									<ToggleLeft class="h-8 w-8 text-muted-foreground" />
								{/if}
							</button>
						</div>

						<div>
							<label for="telegram-token" class="mb-1 block text-sm font-medium text-foreground">Bot Token</label>
							<input
								id="telegram-token"
								type="password"
								placeholder={telegramSettings?.configured ? 'Leave blank to keep existing token' : '123456:ABC...'}
								class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
								bind:value={telegramForm.botToken}
							/>
							{#if telegramSettings?.botTokenPreview}
								<p class="mt-1 text-xs text-muted-foreground">Configured: {telegramSettings.botTokenPreview}</p>
							{/if}
						</div>

						{#if telegramForm.botToken || telegramSettings?.botTokenPreview}
							<div class="mt-3 space-y-3 rounded-md border border-border bg-background p-3">
								<div class="flex flex-wrap items-end gap-2">
									<div class="min-w-56 flex-1">
										<label for="telegram-chat" class="mb-1 block text-sm font-medium text-foreground">Default Chat ID</label>
										<input
											id="telegram-chat"
											type="text"
											placeholder="Click Get Chat ID"
											class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
											bind:value={telegramForm.defaultChatId}
										/>
									</div>
									<button
										class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
										disabled={telegramChatsLoading}
										onclick={getTelegramChats}
									>
										{telegramChatsLoading ? 'Loading...' : 'Get Chat ID'}
									</button>
								</div>
								<p class="text-xs text-muted-foreground">Send a message to the bot, or add it to a group, then click Get Chat ID.</p>

								{#if telegramChats.length > 0}
									<div class="space-y-2">
										{#each telegramChats as chat (chat.id)}
											<button
												class="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
												onclick={() => useTelegramChat(chat)}
											>
												<span>
													<span class="font-medium text-foreground">{chat.title}</span>
													<span class="ml-2 text-xs text-muted-foreground">{chat.type}</span>
												</span>
												<code class="text-xs text-muted-foreground">{chat.id}</code>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						<div class="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
							Create a bot with @BotFather and paste the token here. The Chat ID field appears after a token is entered or configured.
							{#if telegramSettings?.botUsername}
								<br />Connected bot: <span class="font-medium text-foreground">@{telegramSettings.botUsername}</span>
							{/if}
						</div>

						{#if telegramError}
							<p class="mt-3 text-sm text-destructive">{telegramError}</p>
						{/if}
						{#if telegramSuccess}
							<p class="mt-3 text-sm text-green-600 dark:text-green-400">{telegramSuccess}</p>
						{/if}

						<div class="mt-4 flex flex-wrap gap-2">
							<button
								class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
								disabled={telegramSaving}
								onclick={saveTelegramForwarding}
							>
								<Save class="h-4 w-4" />
								{telegramSaving ? 'Saving...' : 'Save Telegram Settings'}
							</button>
							<button
								class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
								disabled={telegramTesting || !telegramForm.defaultChatId}
								onclick={testTelegramForwarding}
							>
								{telegramTesting ? 'Sending...' : 'Send Test Message'}
							</button>
						</div>
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
