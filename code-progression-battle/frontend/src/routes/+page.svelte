<script lang="ts">
	import { onMount } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import ThreadList from '$lib/components/ThreadList.svelte';

	const store = createAppStore();
	let threadFilter = $state('all');

	onMount(() => {
		store.checkLogin();
		store.loadThreads();
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
