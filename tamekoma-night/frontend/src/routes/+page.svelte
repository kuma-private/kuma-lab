<script lang="ts">
	import { onMount } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import ThreadList from '$lib/components/ThreadList.svelte';

	const store = createAppStore();
	let threadFilter = $state('all');
	let authChecked = $state(false);

	onMount(async () => {
		await store.checkLogin();
		authChecked = true;
		if (store.loggedIn) {
			store.loadThreads();
		}
	});

	const filteredThreads = $derived.by(() => {
		if (threadFilter === 'all') return store.threads;
		const userId = store.user?.sub || '';
		if (threadFilter === 'mine') return store.threads.filter(t => t.createdBy === userId);
		if (threadFilter === 'shared') return store.threads.filter(t => t.visibility === 'shared' || t.visibility === 'public');
		return store.threads;
	});

	const handleNewSession = async () => {
		const result = await store.createThread({ title: '無題のスコア' });
		if (result) {
			window.location.href = `/thread/${result.id}`;
		}
	};
</script>

<svelte:head>
	<title>Tamekoma Night</title>
</svelte:head>

<div class="page-bg" aria-hidden="true">
	<div class="bg-stars"></div>
	<div class="bg-city"></div>
	<div class="orb orb-1"></div>
	<div class="orb orb-2"></div>
</div>

<div class="page">
	{#if !authChecked}
		<div class="loading-full">
			<div class="loading-spinner"></div>
		</div>
	{:else if !store.loggedIn}
		<div class="login-screen">
			<div class="login-card">
				<div class="login-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M9 18V5l12-2v13" />
						<circle cx="6" cy="18" r="3" />
						<circle cx="18" cy="16" r="3" />
					</svg>
				</div>
				<h1 class="login-title">Tamekoma Night</h1>
				<p class="login-sub">溜め込まないで、コードを放て。</p>
				<a href="/auth/google" class="btn-google">
					<svg width="18" height="18" viewBox="0 0 24 24">
						<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
						<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
						<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
						<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
					</svg>
					Googleでログイン
				</a>
			</div>
		</div>
	{:else}
		<div class="slogan">溜め込まないで、コードを放て。</div>

		<div class="top-bar">
			<div class="top-left">
				<h1 class="top-title">スコア</h1>
				{#if store.threads.length > 0}
					<span class="top-count">{store.threads.length}</span>
				{/if}
			</div>
			<button class="btn-new" onclick={handleNewSession}>
				<span class="btn-new-icon">+</span>
				新規作成
			</button>
		</div>

		{#if store.error}
			<div class="error-banner" role="alert">{store.error}</div>
		{/if}

		<main class="main">
			{#if store.loading}
				<div class="loading" role="status" aria-label="読み込み中">
					<div class="loading-spinner"></div>
				</div>
			{:else}
				<ThreadList threads={filteredThreads} filter={threadFilter} onFilterChange={(f) => { threadFilter = f; }} />
			{/if}
		</main>
	{/if}
</div>

<style>
	.page-bg {
		position: fixed;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: -1;
		background: linear-gradient(180deg, #030010 0%, #0a0820 40%, #0f0c2e 70%, #1a1040 100%);
	}

	.bg-stars {
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(2px 2px at 8% 10%, #fff, transparent),
			radial-gradient(2px 2px at 22% 6%, #fff, transparent),
			radial-gradient(3px 3px at 38% 18%, #c4b5fd, transparent),
			radial-gradient(2px 2px at 52% 4%, #fff, transparent),
			radial-gradient(2px 2px at 68% 14%, #fff, transparent),
			radial-gradient(3px 3px at 82% 9%, #93c5fd, transparent),
			radial-gradient(1.5px 1.5px at 12% 26%, #e0e0f0, transparent),
			radial-gradient(2px 2px at 32% 30%, #fff, transparent),
			radial-gradient(1.5px 1.5px at 58% 24%, #e0e0f0, transparent),
			radial-gradient(3px 3px at 78% 28%, #f9a8d4, transparent),
			radial-gradient(2px 2px at 90% 20%, #fff, transparent),
			radial-gradient(4px 4px at 18% 2%, #c4b5fd, transparent),
			radial-gradient(1.5px 1.5px at 45% 34%, #e0e0f0, transparent),
			radial-gradient(2px 2px at 95% 6%, #fff, transparent),
			radial-gradient(2px 2px at 5% 38%, #fff, transparent),
			radial-gradient(3px 3px at 65% 8%, #93c5fd, transparent),
			radial-gradient(2px 2px at 28% 16%, #fff, transparent),
			radial-gradient(1.5px 1.5px at 72% 36%, #e0e0f0, transparent),
			radial-gradient(2px 2px at 48% 12%, #fff, transparent),
			radial-gradient(3px 3px at 85% 22%, #c4b5fd, transparent);
		animation: twinkle 3s ease-in-out infinite alternate;
	}

	@keyframes twinkle {
		0% { opacity: 0.6; }
		100% { opacity: 1; }
	}

	.bg-city {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 35%;
		background: linear-gradient(180deg, transparent 0%, rgba(167,139,250,0.03) 50%, rgba(139,92,246,0.06) 100%);
	}

	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		will-change: transform;
	}

	.orb-1 {
		width: 500px;
		height: 500px;
		background: var(--accent-primary);
		bottom: -200px;
		right: 10%;
		opacity: 0.06;
		animation: drift1 16s ease-in-out infinite;
	}

	.orb-2 {
		width: 400px;
		height: 400px;
		background: var(--accent-secondary);
		bottom: -150px;
		left: 15%;
		opacity: 0.05;
		animation: drift2 20s ease-in-out infinite;
	}

	@keyframes drift1 {
		0%, 100% { transform: translate(0, 0); }
		50% { transform: translate(-30px, -20px); }
	}

	@keyframes drift2 {
		0%, 100% { transform: translate(0, 0); }
		50% { transform: translate(20px, -15px); }
	}

	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-xl);
		min-height: calc(100vh - 44px);
	}

	/* Login screen */
	.loading-full {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 60vh;
	}

	.login-screen {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 70vh;
	}

	.login-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-2xl) var(--space-xl);
		background: rgba(20, 20, 50, 0.6);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		backdrop-filter: blur(12px);
		text-align: center;
		max-width: 360px;
		width: 100%;
	}

	.login-icon {
		color: var(--accent-primary);
		opacity: 0.8;
	}

	.login-title {
		font-family: var(--font-display);
		font-size: 1.8rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.login-sub {
		color: var(--text-muted);
		font-size: 0.88rem;
		margin: 0;
	}

	.btn-google {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 24px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: #fff;
		color: #333;
		font-size: 0.88rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
		margin-top: var(--space-sm);
	}

	.btn-google:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transform: translateY(-1px);
	}

	.slogan {
		text-align: center;
		font-size: 0.85rem;
		color: var(--text-muted);
		padding: var(--space-lg) 0 var(--space-sm);
		letter-spacing: 0.15em;
		opacity: 0.6;
	}

	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) 0 var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-lg);
	}

	.top-left {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.top-title {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.top-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.12);
		padding: 2px 8px;
		border-radius: 10px;
	}

	.btn-new {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 18px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.btn-new:hover {
		background: #9374e8;
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(139, 92, 246, 0.35);
	}

	.btn-new:focus-visible {
		outline: 2px solid var(--accent-primary);
		outline-offset: 2px;
	}

	.btn-new-icon {
		font-size: 1.1rem;
		font-weight: 300;
		line-height: 1;
	}

	.error-banner {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		color: var(--error);
		margin-bottom: var(--space-md);
	}

	.loading {
		display: flex;
		justify-content: center;
		padding: var(--space-2xl);
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (prefers-reduced-motion: reduce) {
		.orb, .loading-spinner { animation: none; }
	}

	@media (max-width: 600px) {
		.orb { display: none; }

		.page {
			padding: var(--space-md) var(--space-md);
		}

		.top-bar {
			flex-direction: column;
			align-items: stretch;
			gap: var(--space-md);
		}

		.btn-new {
			justify-content: center;
		}
	}
</style>
