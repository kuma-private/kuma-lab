<script lang="ts">
	import { onMount } from 'svelte';
	import type { UserInfo } from '$lib/api';
	import HelpModal from '$lib/components/HelpModal.svelte';

	let user = $state<UserInfo | null>(null);
	let loaded = $state(false);
	let helpOpen = $state(false);
	let menuOpen = $state(false);

	onMount(async () => {
		try {
			const { getMe } = await import('$lib/api');
			user = await getMe();
		} catch {
			user = null;
		}
		loaded = true;
	});

	const getInitial = (name: string): string => {
		return name.charAt(0).toUpperCase();
	};

	const handleLogout = async () => {
		menuOpen = false;
		try {
			await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
		} catch {}
		window.location.href = '/';
	};

	const handleClickOutside = (event: MouseEvent) => {
		const target = event.target as HTMLElement;
		if (!target.closest('.avatar-menu-wrapper')) {
			menuOpen = false;
		}
	};
</script>

<svelte:window onclick={handleClickOutside} />

<nav class="service-header">
	<a href="/" class="service-logo">
		<span class="logo-icon">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 18V5l12-2v13" />
				<circle cx="6" cy="18" r="3" />
				<circle cx="18" cy="16" r="3" />
			</svg>
		</span>
		Cadenza.fm
	</a>
	<div class="service-right">
		<button class="btn-help" onclick={() => helpOpen = true} title="ヘルプ">?</button>
		{#if loaded}
			{#if user}
				<div class="avatar-menu-wrapper">
					<button
						class="avatar-btn"
						onclick={() => menuOpen = !menuOpen}
						aria-expanded={menuOpen}
						aria-haspopup="true"
						title={user.name}
					>
						{getInitial(user.name)}
					</button>
					{#if menuOpen}
						<div class="avatar-dropdown" role="menu">
							<a href="/me" class="dropdown-item" role="menuitem" onclick={() => menuOpen = false}>マイページ</a>
							<button class="dropdown-item dropdown-item--logout" role="menuitem" onclick={handleLogout}>ログアウト</button>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/auth/google" class="btn-login">ログイン</a>
			{/if}
		{/if}
	</div>
</nav>

<HelpModal open={helpOpen} onclose={() => helpOpen = false} />

<style>
	.service-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-xl);
		height: 44px;
		background: var(--bg-deepest);
		border-bottom: 1px solid var(--border-subtle);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
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
		background: rgba(232, 168, 76, 0.1);
	}

	.btn-help {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-default);
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.btn-help:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(232, 168, 76, 0.08);
	}

	/* Avatar button */
	.avatar-menu-wrapper {
		position: relative;
	}

	.avatar-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background: var(--accent-primary);
		color: #fff;
		font-family: var(--font-display);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.avatar-btn:hover {
		background: #d09440;
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.3);
	}

	/* Dropdown */
	.avatar-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 160px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-elevated);
		z-index: var(--z-dropdown);
		overflow: hidden;
		animation: dropdown-in 0.12s ease-out;
	}

	@keyframes dropdown-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-item {
		display: block;
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		font-size: 0.82rem;
		color: var(--text-secondary);
		text-decoration: none;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-sans);
		transition: all 0.12s;
	}

	.dropdown-item:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.dropdown-item--logout {
		color: var(--error);
		border-top: 1px solid var(--border-subtle);
	}

	.dropdown-item--logout:hover {
		background: rgba(224, 96, 80, 0.08);
	}

	@media (max-width: 600px) {
		.service-header {
			padding: 0 var(--space-md);
			height: 42px;
		}
		.service-logo { font-size: 0.74rem; }
		.btn-login {
			padding: 6px 12px;
			min-height: 44px;
		}
		.btn-help {
			width: 40px;
			height: 40px;
			font-size: 0.85rem;
			margin-right: 2px;
		}
		.avatar-btn {
			width: 36px;
			height: 36px;
		}
		.service-right {
			gap: var(--space-sm);
		}
	}
</style>
