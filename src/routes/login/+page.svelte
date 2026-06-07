<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Mail, Lock, Eye, EyeOff, User } from 'lucide-svelte';

	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let error = $state('');
	let loading = $state(false);
	let checkingAuth = $state(true);

	onMount(async () => {
		try {
			const res = await fetch('/api/auth');
			const data = (await res.json()) as { authenticated: boolean };
			if (data.authenticated) {
				goto('/');
				return;
			}
		} catch {
			// Ignore
		}
		checkingAuth = false;
	});

	async function handleSubmit() {
		if (!username) {
			error = 'Username is required';
			return;
		}
		if (!password) {
			error = 'Password is required';
			return;
		}

		error = '';
		loading = true;

		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			if (res.ok) {
				goto('/');
			} else {
				const data = (await res.json()) as { message?: string };
				error = data.message || 'Invalid password';
			}
		} catch {
			error = 'Connection failed. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Login - MailNest</title>
</svelte:head>

{#if checkingAuth}
	<div class="flex min-h-screen items-center justify-center bg-background">
		<div class="flex flex-col items-center gap-3 text-muted-foreground">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"></div>
			<p class="text-sm">Checking session...</p>
		</div>
	</div>
{:else}
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
				<h2 class="mb-1 text-lg font-semibold text-card-foreground">Welcome back</h2>
				<p class="mb-6 text-sm text-muted-foreground">
					Enter your username and password to access your inbox.
				</p>

				<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
					<div class="space-y-4">
						<div>
							<label for="username" class="mb-1.5 block text-sm font-medium text-foreground">
								Username
							</label>
							<div class="relative">
								<User class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<input
									id="username"
									type="text"
									placeholder="Enter your username"
									class="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
									bind:value={username}
								/>
							</div>
						</div>
						<div>
							<label for="password" class="mb-1.5 block text-sm font-medium text-foreground">
								Password
							</label>
							<div class="relative">
								<Lock class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<input
									id="password"
									type={showPassword ? 'text' : 'password'}
									placeholder="Enter your password"
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

						{#if error}
							<p class="text-sm text-destructive">{error}</p>
						{/if}

						<button
							type="submit"
							class="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
							disabled={loading}
						>
							{loading ? 'Signing in...' : 'Sign In'}
						</button>
					</div>
				</form>

				<div class="mt-4 text-center">
					<a href="/login/reset" class="text-sm text-muted-foreground hover:text-foreground">
						Forgot password?
					</a>
				</div>
			</div>

			<p class="mt-6 text-center text-xs text-muted-foreground">
				Secured by Cloudflare Workers
			</p>
		</div>
	</div>
{/if}
