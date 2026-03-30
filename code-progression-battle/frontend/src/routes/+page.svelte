<script lang="ts">
	import { onMount } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import ThreadList from '$lib/components/ThreadList.svelte';
	import CreateThreadModal from '$lib/components/CreateThreadModal.svelte';

	const store = createAppStore();
	let showCreateModal = $state(false);

	onMount(() => {
		store.checkLogin();
		store.loadThreads();
	});
</script>

<svelte:head>
	<title>Code Progression Battle</title>
</svelte:head>

<div class="page">
	<header class="header">
		<div class="header-left">
			<h1 class="logo">Code Progression Battle</h1>
			<p class="subtitle">コード進行を一緒に作ろう</p>
		</div>
		<div class="header-right">
			{#if store.loggedIn}
				<span class="user-name">@{store.user?.name}</span>
			{:else}
				<a href="/auth/google" class="btn btn-secondary">Googleでログイン</a>
			{/if}
		</div>
	</header>

	<main class="main">
		<div class="toolbar">
			<button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
				+ 新しいセッション
			</button>
		</div>

		{#if store.error}
			<div class="error-banner">{store.error}</div>
		{/if}

		{#if store.loading}
			<p class="loading">読み込み中...</p>
		{:else}
			<ThreadList threads={store.threads} />
		{/if}
	</main>
</div>

{#if showCreateModal}
	<CreateThreadModal
		onClose={() => (showCreateModal = false)}
		onCreate={async (data) => {
			const result = await store.createThread(data);
			if (result) {
				showCreateModal = false;
				window.location.href = `/thread/${result.id}`;
			}
		}}
	/>
{/if}

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-lg);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: var(--space-md) 0;
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-xl);
	}

	.logo {
		font-family: var(--font-display);
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--accent-warm);
		margin: 0;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 4px 0 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding-top: 4px;
	}

	.user-name {
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.toolbar {
		display: flex;
		justify-content: flex-start;
		margin-bottom: var(--space-lg);
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
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-2xl);
	}
</style>
