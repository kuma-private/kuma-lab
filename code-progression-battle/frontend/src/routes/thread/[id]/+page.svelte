<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState } from '$lib/chord-player';
	import { threadToMarkdown } from '$lib/markdown';
	import PostCard from '$lib/components/PostCard.svelte';
	import ChordInput from '$lib/components/ChordInput.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';

	const store = createAppStore();
	const threadId = page.params.id as string;

	let player: ChordPlayer | null = null;
	let playerState = $state<PlayerState>('stopped');
	let currentTime = $state(0);
	let totalDuration = $state(0);
	let activeBarIndex = $state(-1);

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
	});

	onDestroy(() => {
		player?.dispose();
	});

	function parseTimeSignature(ts: string) {
		const [beats, beatValue] = ts.split('/').map(Number);
		return { beats: beats || 4, beatValue: beatValue || 4 };
	}

	function buildPlayer() {
		const thread = store.currentThread;
		if (!thread || !thread.posts.length) return;

		player?.dispose();

		player = new ChordPlayer(
			{
				bpm: thread.bpm,
				timeSignature: parseTimeSignature(thread.timeSignature)
			},
			{
				onStateChange: (s) => { playerState = s; },
				onProgress: (ct, td) => { currentTime = ct; totalDuration = td; },
				onBarChange: (idx) => { activeBarIndex = idx; }
			}
		);

		const barSets = thread.posts.map((p) => {
			try { return parseProgression(p.chords).bars; }
			catch { return []; }
		});

		player.loadMultiple(barSets);
	}

	function handlePlay() {
		if (!player) buildPlayer();
		player?.play();
	}

	function handlePause() { player?.pause(); }
	function handleStop() { player?.stop(); activeBarIndex = -1; }
	function handleSeek(time: number) { player?.seekTo(time); }

	function handleExport() {
		const thread = store.currentThread;
		if (!thread) return;
		const md = threadToMarkdown(thread);
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${thread.title.replace(/\s+/g, '_')}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handlePostSubmit(chords: string, comment: string) {
		store.addPost(threadId, chords, comment).then(() => {
			player?.dispose();
			player = null;
			activeBarIndex = -1;
		});
	}

	// Compute cumulative bar offsets per post for highlight sync
	let postBarOffsets = $derived.by(() => {
		const offsets: number[] = [];
		let total = 0;
		for (const p of store.currentThread?.posts ?? []) {
			offsets.push(total);
			try { total += parseProgression(p.chords).bars.length; }
			catch { /* skip */ }
		}
		return offsets;
	});

	// First user posts on left, second user posts on right
	function getPostSide(index: number): boolean {
		const thread = store.currentThread;
		if (!thread || !thread.posts.length) return true;
		const firstUser = thread.posts[0].userId;
		return thread.posts[index].userId === firstUser;
	}
</script>

<svelte:head>
	<title>{store.currentThread?.title || 'Thread'} - Code Progression Battle</title>
</svelte:head>

<div class="page">
	<header class="thread-header">
		<a href="/" class="back-link">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="10,2 4,8 10,14" />
			</svg>
			Back
		</a>
		{#if store.currentThread}
			{@const thread = store.currentThread}
			<div class="thread-info">
				<h1 class="thread-title">{thread.title}</h1>
				<div class="thread-meta">
					<span class="badge">Key: {thread.key}</span>
					<span class="badge">{thread.timeSignature}</span>
					<span class="badge">BPM {thread.bpm}</span>
					<span class="thread-author">by @{thread.createdByName}</span>
				</div>
			</div>
			<button class="btn btn-ghost" onclick={handleExport} title="Export as Markdown">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M4 10l4 4 4-4" />
					<line x1="8" y1="2" x2="8" y2="14" />
				</svg>
				Export
			</button>
		{/if}
	</header>

	{#if store.error}
		<div class="error-banner">{store.error}</div>
	{/if}

	{#if store.loading && !store.currentThread}
		<p class="loading">Loading...</p>
	{:else if store.currentThread}
		<div class="posts">
			{#each store.currentThread.posts as post, i}
				<PostCard
					{post}
					index={i}
					isLeft={getPostSide(i)}
					{activeBarIndex}
					barOffset={postBarOffsets[i] ?? 0}
				/>
			{/each}

			{#if store.currentThread.posts.length === 0}
				<div class="empty-posts">
					<p>No posts yet. Start the progression!</p>
				</div>
			{/if}
		</div>

		<div class="input-section">
			<ChordInput onsubmit={handlePostSubmit} />
		</div>
	{/if}
</div>

<PlayerBar
	state={playerState}
	{currentTime}
	{totalDuration}
	bpm={store.currentThread?.bpm ?? 120}
	onplay={handlePlay}
	onpause={handlePause}
	onstop={handleStop}
	onseek={handleSeek}
/>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-lg);
		padding-bottom: calc(var(--player-height) + var(--space-xl));
	}

	.thread-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-md);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-lg);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-decoration: none;
		flex-shrink: 0;
		padding-top: 4px;
	}

	.back-link:hover {
		color: var(--text-primary);
	}

	.thread-info {
		flex: 1;
	}

	.thread-title {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 8px;
	}

	.thread-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.thread-author {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.posts {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		margin-bottom: var(--space-xl);
	}

	.empty-posts {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-2xl);
	}

	.input-section {
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
