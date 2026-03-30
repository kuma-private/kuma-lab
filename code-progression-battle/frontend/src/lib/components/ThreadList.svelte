<script lang="ts">
	import type { ThreadSummary } from '$lib/api';

	let { threads }: { threads: ThreadSummary[] } = $props();

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}
</script>

{#if threads.length === 0}
	<div class="empty">
		<p>まだセッションがありません。最初のセッションを作ろう!</p>
	</div>
{:else}
	<div class="thread-list">
		{#each threads as thread}
			<a href="/thread/{thread.id}" class="card thread-card">
				<div class="thread-header">
					<h2 class="thread-title">{thread.title}</h2>
					<span class="thread-date">{formatDate(thread.createdAt)}</span>
				</div>
				<div class="thread-meta">
					<span class="badge">Key: {thread.key}</span>
					<span class="badge">{thread.timeSignature}</span>
					<span class="badge">BPM {thread.bpm}</span>
					<span class="thread-info">
						@{thread.createdByName} &middot; {thread.postCount} posts
					</span>
				</div>
			</a>
		{/each}
	</div>
{/if}

<style>
	.empty {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-2xl);
	}

	.thread-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.thread-card {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.thread-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-md);
		margin-bottom: 10px;
	}

	.thread-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0;
	}

	.thread-date {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.thread-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.thread-info {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-left: auto;
	}
</style>
