<script lang="ts">
	import type { ThreadSummary } from '$lib/api';

	let { thread }: { thread: ThreadSummary } = $props();

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}
</script>

<a class="card thread-card" href="/thread/{thread.id}">
	<div class="thread-card-header">
		<h2 class="thread-card-title">{thread.title}</h2>
		<span class="thread-card-date">{formatDate(thread.createdAt)}</span>
	</div>

	<div class="thread-card-meta">
		<span class="badge">Key: {thread.key}</span>
		<span class="badge">{thread.timeSignature}</span>
		<span class="badge">BPM {thread.bpm}</span>
		<span class="thread-card-info">
			@{thread.createdByName} &middot; {thread.postCount} posts
		</span>
	</div>
</a>

<style>
	.thread-card {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.thread-card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 10px;
	}

	.thread-card-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0;
	}

	.thread-card-date {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.thread-card-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.thread-card-info {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-left: auto;
	}
</style>
