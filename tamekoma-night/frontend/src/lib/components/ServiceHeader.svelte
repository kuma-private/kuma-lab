<script lang="ts">
	import { onMount } from 'svelte';
	import type { UserInfo } from '$lib/api';

	let user = $state<UserInfo | null>(null);
	let loaded = $state(false);

	onMount(async () => {
		try {
			const { getMe } = await import('$lib/api');
			user = await getMe();
		} catch {
			user = null;
		}
		loaded = true;
	});

	const handleLogout = async () => {
		try {
			await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
		} catch {}
		window.location.href = '/';
	};
</script>

<nav class="service-header">
	<a href="/" class="service-logo">
		<span class="logo-icon">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 18V5l12-2v13" />
				<circle cx="6" cy="18" r="3" />
				<circle cx="18" cy="16" r="3" />
			</svg>
		</span>
		Tamekoma Night
	</a>
	<div class="service-right">
		{#if loaded}
			{#if user}
				<span class="user-name">{user.name}</span>
				<button class="btn-logout" onclick={handleLogout}>ログアウト</button>
			{:else}
				<a href="/auth/google" class="btn-login">ログイン</a>
			{/if}
		{/if}
	</div>
</nav>

<style>
	.service-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-xl);
		height: 44px;
		background: var(--bg-deepest);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.service-logo {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--text-primary);
		text-decoration: none;
		letter-spacing: 0.02em;
	}

	.service-logo:hover {
		color: var(--accent-primary);
	}

	.logo-icon {
		display: flex;
		color: var(--accent-primary);
	}

	.service-right {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.user-name {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.btn-logout {
		padding: 3px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.72rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-logout:hover {
		border-color: var(--error);
		color: var(--error);
	}

	.btn-login {
		padding: 3px 14px;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--accent-primary);
		font-size: 0.78rem;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.15s;
	}

	.btn-login:hover {
		background: rgba(167, 139, 250, 0.1);
	}

	@media (max-width: 600px) {
		.service-header { padding: 0 var(--space-sm); }
		.service-logo { font-size: 0.78rem; }
		.btn-logout, .btn-login { padding: 6px 12px; }
	}
</style>
