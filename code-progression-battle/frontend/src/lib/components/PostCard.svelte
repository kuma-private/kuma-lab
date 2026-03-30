<script lang="ts">
	import type { Post } from '$lib/api';
	import ChordProgression from './ChordProgression.svelte';

	let {
		post,
		index,
		isLeft,
		activeBarIndex = -1,
		barOffset = 0
	}: {
		post: Post;
		index: number;
		isLeft: boolean;
		activeBarIndex?: number;
		barOffset?: number;
	} = $props();

	let localActiveBar = $derived(
		activeBarIndex >= barOffset ? activeBarIndex - barOffset : -1
	);

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('ja-JP', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="post-wrapper" class:post-wrapper--right={!isLeft}>
	<div class="post" class:post--left={isLeft} class:post--right={!isLeft}>
		<div class="post-header">
			<span class="post-user">@{post.userName}</span>
			<span class="post-meta">#{index + 1} &middot; {formatDate(post.createdAt)}</span>
		</div>

		<ChordProgression chords={post.chords} activeBarIndex={localActiveBar} />

		{#if post.comment.trim()}
			<p class="post-comment">{post.comment}</p>
		{/if}
	</div>
</div>

<style>
	.post-wrapper {
		display: flex;
		justify-content: flex-start;
		padding: 4px 0;
	}

	.post-wrapper--right {
		justify-content: flex-end;
	}

	.post {
		max-width: 80%;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-md);
		box-shadow: var(--shadow-card);
	}

	.post--left {
		border-left: 3px solid var(--accent-primary);
	}

	.post--right {
		border-right: 3px solid var(--accent-secondary);
	}

	.post-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
		gap: 12px;
	}

	.post-user {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text-primary);
	}

	.post--left .post-user {
		color: var(--accent-primary);
	}

	.post--right .post-user {
		color: var(--accent-secondary);
	}

	.post-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.post-comment {
		margin: 8px 0 0;
		font-size: 0.85rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}
</style>
