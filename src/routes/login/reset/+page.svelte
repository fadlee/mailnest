<script lang="ts">
	import { goto } from '$app/navigation';
	import { Mail, Lock, Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-svelte';

	let secretKey = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let error = $state('');
	let loading = $state(false);

	async function handleReset() {
		error = '';

		if (!secretKey) {
			error = 'Secret key is required';
			return;
		}
		if (!password) {
			error = 'New password is required';
			return;
		}
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;

		try {
			const res = await fetch('/api/auth', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ secretKey, password, confirmPassword })
			});

			if (res.ok) {
				goto('/');
			} else {
				const data = (await res.json()) as { message?: string };
				error = data.message || 'Reset failed';
			}
		} catch {
			error = 'Connection failed. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - MailNest</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<div class="w-full max-w-sm">
		<!-- Logo -->
		<div class="mb-8 text-center">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
				<Mail class="h-8 w-8 text-primary-foreground" />
			</div>
			<h1 class="text-2xl font-bold text-foreground">MailNest</h1>
			<p class="mt-1 text-sm text-muted-foreground">Where your emails come home</p>
		</div>

		<!-- Form -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
			<h2 class="mb-1 text-lg font-semibold text-card-foreground">Reset Password</h2>
			<p class="mb-6 text-sm text-muted-foreground">
				Enter your secret key (from installation) and a new password.
			</p>

			<form onsubmit={(e) => { e.preventDefault(); handleReset(); }}>
				<div class="space-y-4">
					<!-- Secret Key -->
					<div>
						<label for="secretKey" class="mb-1.5 block text-sm font-medium text-foreground">
							Secret Key
						</label>
						<div class="relative">
							<KeyRound class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								id="secretKey"
								type="text"
								placeholder="Enter the secret key from install"
								class="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
								bind:value={secretKey}
							/>
						</div>
					</div>

					<!-- New Password -->
					<div>
						<label for="password" class="mb-1.5 block text-sm font-medium text-foreground">
							New Password
						</label>
						<div class="relative">
							<Lock class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								id="password"
								type={showPassword ? 'text' : 'password'}
								placeholder="Enter new password"
								class="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
								bind:value={password}
							/>
							<button
								type="button"
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								onclick={() => (showPassword = !showPassword)}
							>
								{#if showPassword}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>

					<!-- Confirm Password -->
					<div>
						<label for="confirmPassword" class="mb-1.5 block text-sm font-medium text-foreground">
							Confirm Password
						</label>
						<div class="relative">
							<Lock class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								id="confirmPassword"
								type={showPassword ? 'text' : 'password'}
								placeholder="Confirm new password"
								class="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
								bind:value={confirmPassword}
							/>
						</div>
					</div>

					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}

					<button
						type="submit"
						class="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						disabled={loading}
					>
						{loading ? 'Resetting...' : 'Reset & Sign In'}
					</button>
				</div>
			</form>

			<div class="mt-4 text-center">
				<a href="/login" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
					<ArrowLeft class="h-3.5 w-3.5" />
					Back to login
				</a>
			</div>
		</div>

		<p class="mt-6 text-center text-xs text-muted-foreground">
			Don't have the secret key? Use <code class="rounded bg-muted px-1">./reset-password.sh</code> from terminal.
		</p>
	</div>
</div>
