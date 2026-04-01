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
		const result = await store.createThread({ title: '新しいセッション' });
		if (result) {
			window.location.href = `/thread/${result.id}`;
		}
	};
</script>

<svelte:head>
	<title>Tamekoma Night</title>
</svelte:head>

<div class="page-bg" aria-hidden="true">
	<div class="bg-grid"></div>
	<div class="orb orb-1"></div>
	<div class="orb orb-2"></div>
	<div class="orb orb-3"></div>
	<div class="bg-vignette"></div>
</div>

<div class="page">
	<div class="top-bar">
		<div class="top-left">
			<h1 class="top-title">セッション</h1>
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
		background: var(--bg-deepest);
	}

	/* Subtle dot grid - DAW-inspired */
	.bg-grid {
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle, rgba(167, 139, 250, 0.08) 1px, transparent 1px);
		background-size: 32px 32px;
		mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 70%);
		-webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 70%);
	}

	/* Edge vignette */
	.bg-vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 50% 50%, transparent 40%, var(--bg-deepest) 100%);
	}

	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(120px);
		opacity: 0.08;
		will-change: transform;
	}

	.orb-1 {
		width: 600px;
		height: 600px;
		background: var(--accent-primary);
		top: -200px;
		right: -150px;
		animation: drift1 14s ease-in-out infinite;
	}

	.orb-2 {
		width: 450px;
		height: 450px;
		background: var(--accent-secondary);
		bottom: -150px;
		left: -100px;
		animation: drift2 18s ease-in-out infinite;
	}

	.orb-3 {
		width: 350px;
		height: 350px;
		background: #f472b6;
		top: 50%;
		left: 40%;
		opacity: 0.04;
		animation: drift3 22s ease-in-out infinite;
	}

	@keyframes drift1 {
		0%, 100% { transform: translate(0, 0) scale(1); }
		50% { transform: translate(-50px, 40px) scale(1.05); }
	}

	@keyframes drift2 {
		0%, 100% { transform: translate(0, 0) scale(1); }
		50% { transform: translate(40px, -30px) scale(0.95); }
	}

	@keyframes drift3 {
		0%, 100% { transform: translate(0, 0); }
		50% { transform: translate(-30px, -40px); }
	}

	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-xl);
		min-height: calc(100vh - 44px);
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
		.bg-grid { opacity: 0.5; }

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
