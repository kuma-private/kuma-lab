<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState } from '$lib/chord-player';
	import ScoreEditor from '$lib/components/ScoreEditor.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';

	const store = createAppStore();
	const threadId = page.params.id as string;

	let player: ChordPlayer | null = null;
	let playerState = $state<PlayerState>('stopped');
	let currentTime = $state(0);
	let totalDuration = $state(0);
	let activeBarIndex = $state(-1);

	// Turn action state
	let selectedAction = $state<'add' | 'edit' | 'delete'>('add');
	let selectedLineNumber = $state(0);
	let chordsInput = $state('');
	let commentInput = $state('');
	let submitting = $state(false);

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
	});

	onDestroy(() => {
		player?.dispose();
	});

	// Score text from lines
	let scoreText = $derived.by(() => {
		const thread = store.currentThread;
		if (!thread) return '';
		return thread.lines.map(l => l.chords).join('\n');
	});

	function parseTimeSignature(ts: string) {
		const [beats, beatValue] = ts.split('/').map(Number);
		return { beats: beats || 4, beatValue: beatValue || 4 };
	}

	function buildPlayer() {
		const thread = store.currentThread;
		if (!thread || !thread.lines.length) return;
		player?.dispose();
		player = new ChordPlayer(
			{ bpm: thread.bpm, timeSignature: parseTimeSignature(thread.timeSignature) },
			{
				onStateChange: (s) => { playerState = s; },
				onProgress: (ct, td) => { currentTime = ct; totalDuration = td; },
				onBarChange: (idx) => { activeBarIndex = idx; }
			}
		);
		try {
			const allBars = thread.lines.flatMap(l => {
				try { return parseProgression(l.chords).bars; }
				catch { return []; }
			});
			if (allBars.length > 0) player.load(allBars);
		} catch (e) {
			console.error('[Player]', e);
		}
	}

	function handlePlay() { buildPlayer(); player?.play(); }
	function handlePause() { player?.pause(); }
	function handleStop() { player?.stop(); activeBarIndex = -1; }
	function handleSeek(time: number) { player?.seekTo(time); }

	function handleExport() {
		const thread = store.currentThread;
		if (!thread) return;
		const header = `# ${thread.title}\nKey: ${thread.key} | ${thread.timeSignature} | BPM ${thread.bpm}\n\n`;
		const body = thread.lines.map(l => l.chords).join('\n');
		const md = header + body;
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${thread.title.replace(/\s+/g, '_')}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleSubmitTurn() {
		if (submitting) return;
		submitting = true;
		try {
			if (selectedAction === 'add' && !chordsInput.trim()) return;
			if (selectedAction === 'edit' && (!chordsInput.trim() || selectedLineNumber < 1)) return;
			if (selectedAction === 'delete' && selectedLineNumber < 1) return;

			await store.submitTurn(threadId, selectedAction, selectedLineNumber, chordsInput.trim(), commentInput.trim());
			chordsInput = '';
			commentInput = '';
			selectedLineNumber = 0;
			player?.dispose();
			player = null;
		} finally {
			submitting = false;
		}
	}

	function selectLineForEdit(lineNum: number, chords: string) {
		selectedAction = 'edit';
		selectedLineNumber = lineNum;
		chordsInput = chords;
	}

	function selectLineForDelete(lineNum: number) {
		selectedAction = 'delete';
		selectedLineNumber = lineNum;
		chordsInput = '';
	}

	// Status helpers
	let statusLabel = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return '';
		switch (t.status) {
			case 'waiting': return 'Waiting for opponent to join...';
			case 'active': return store.isMyTurn ? 'Your turn!' : `Waiting for ${t.currentTurn === t.createdBy ? t.createdByName : t.opponentName}...`;
			case 'finish_proposed': return t.finishProposedBy === store.user?.sub ? 'You proposed to finish. Waiting...' : 'Opponent proposed to finish!';
			case 'completed': return 'Completed!';
			default: return t.status;
		}
	});

	let statusClass = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return '';
		if (t.status === 'completed') return 'status-completed';
		if (t.status === 'waiting') return 'status-waiting';
		if (store.isMyTurn || (t.status === 'finish_proposed' && t.finishProposedBy !== store.user?.sub)) return 'status-myturn';
		return 'status-waiting';
	});
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
					<span class="badge badge-turn">Turn {thread.turnCount}</span>
				</div>
			</div>
			<button class="btn btn-ghost" onclick={handleExport}>Export</button>
		{/if}
	</header>

	{#if store.currentThread}
		{@const thread = store.currentThread}

		<!-- Status bar -->
		<div class="status-bar {statusClass}">
			<span class="status-label">{statusLabel}</span>
			<span class="status-players">
				{thread.createdByName} vs {thread.opponentName || '???'}
			</span>
		</div>

		<!-- Join button for invited player -->
		{#if thread.status === 'waiting' && !store.isPlayer}
			<div class="join-section">
				<button class="btn btn-primary" onclick={() => store.joinThread(threadId)}>Join this battle!</button>
			</div>
		{/if}

		{#if store.error}
			<div class="error-banner">{store.error}</div>
		{/if}

		<div class="editor-layout">
			<!-- Left: Turn history + action input -->
			<div class="panel panel-left">
				<div class="panel-header">
					<h2>History</h2>
					<span class="count">{thread.history.length} turns</span>
				</div>

				<div class="history">
					{#each thread.history as turn}
						<div class="turn-entry">
							<div class="turn-header">
								<span class="turn-number">#{turn.turnNumber}</span>
								<span class="turn-user">@{turn.userName}</span>
								<span class="turn-action turn-action--{turn.action}">{turn.action.toUpperCase()}</span>
								<span class="turn-target">L{turn.lineNumber}</span>
							</div>
							{#if turn.action !== 'delete'}
								<div class="turn-chords">{turn.chords}</div>
							{/if}
							{#if turn.comment}
								<div class="turn-comment">{turn.comment}</div>
							{/if}
						</div>
					{/each}

					{#if thread.history.length === 0}
						<div class="empty">No turns yet.</div>
					{/if}
				</div>

				<!-- Turn input (only when it's your turn) -->
				{#if thread.status === 'active' && store.isMyTurn}
					<div class="turn-input">
						<div class="action-tabs">
							<button class="tab" class:active={selectedAction === 'add'} onclick={() => { selectedAction = 'add'; selectedLineNumber = 0; chordsInput = ''; }}>
								ADD
							</button>
							<button class="tab" class:active={selectedAction === 'edit'} onclick={() => { selectedAction = 'edit'; }}>
								EDIT
							</button>
							<button class="tab" class:active={selectedAction === 'delete'} onclick={() => { selectedAction = 'delete'; chordsInput = ''; }}>
								DELETE
							</button>
						</div>

						{#if selectedAction === 'add'}
							<textarea class="chord-input" bind:value={chordsInput} placeholder="| Am7 | Dm7 | G7 | Cmaj7 |" rows="2"></textarea>
						{:else if selectedAction === 'edit'}
							<div class="line-select-hint">Click a line in the score to edit it</div>
							{#if selectedLineNumber > 0}
								<div class="selected-line">Editing line {selectedLineNumber}</div>
								<textarea class="chord-input" bind:value={chordsInput} rows="2"></textarea>
							{/if}
						{:else}
							<div class="line-select-hint">Click a line in the score to delete it</div>
							{#if selectedLineNumber > 0}
								<div class="selected-line">Delete line {selectedLineNumber}?</div>
							{/if}
						{/if}

						<div class="input-row">
							<input type="text" bind:value={commentInput} placeholder="Comment..." class="comment-input" />
							<button class="btn btn-primary" onclick={handleSubmitTurn} disabled={submitting || (selectedAction !== 'delete' && !chordsInput.trim()) || (selectedAction !== 'add' && selectedLineNumber < 1)}>
								{submitting ? '...' : 'Submit'}
							</button>
						</div>

						<button class="btn btn-ghost finish-btn" onclick={() => store.proposeFinish(threadId)}>
							Propose Finish
						</button>
					</div>
				{/if}

				<!-- Finish proposal response -->
				{#if thread.status === 'finish_proposed' && thread.finishProposedBy !== store.user?.sub && store.isPlayer}
					<div class="finish-response">
						<p>Opponent proposed to finish. Accept?</p>
						<div class="finish-buttons">
							<button class="btn btn-primary" onclick={() => store.acceptFinish(threadId)}>Accept</button>
							<button class="btn btn-secondary" onclick={() => store.rejectFinish(threadId)}>Reject</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Right: Score editor -->
			<div class="panel panel-right">
				<div class="panel-header">
					<h2>Score</h2>
					<span class="count">{thread.lines.length} lines</span>
				</div>

				{#if thread.lines.length > 0}
					<div class="score-lines">
						{#each thread.lines as line}
							<div
								class="score-line"
								class:score-line--selected={selectedLineNumber === line.lineNumber}
								class:score-line--clickable={store.isMyTurn && thread.status === 'active' && (selectedAction === 'edit' || selectedAction === 'delete')}
								onclick={() => {
									if (!store.isMyTurn || thread.status !== 'active') return;
									if (selectedAction === 'edit') selectLineForEdit(line.lineNumber, line.chords);
									else if (selectedAction === 'delete') selectLineForDelete(line.lineNumber);
								}}
								role={store.isMyTurn && (selectedAction === 'edit' || selectedAction === 'delete') ? 'button' : undefined}
								tabindex={store.isMyTurn && (selectedAction === 'edit' || selectedAction === 'delete') ? 0 : undefined}
							>
								<span class="line-number">L{line.lineNumber}</span>
								<ScoreEditor value={line.chords} readonly={true} />
								<span class="line-author">@{line.addedByName}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty-score">No lines yet. Add the first one!</div>
				{/if}
			</div>
		</div>
	{:else if store.loading}
		<p class="loading">Loading...</p>
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
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-md) var(--space-lg);
		padding-bottom: calc(var(--player-height) + var(--space-xl));
	}

	.thread-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-md);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-sm);
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

	.thread-info { flex: 1; }

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

	.badge-turn {
		background: var(--accent-primary);
		color: #fff;
		border-color: var(--accent-primary);
	}

	/* Status bar */
	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-md);
		font-size: 0.85rem;
	}

	.status-myturn {
		background: rgba(167, 139, 250, 0.15);
		border: 1px solid var(--accent-primary);
		color: var(--accent-primary);
	}

	.status-waiting {
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid var(--border-default);
		color: var(--text-secondary);
	}

	.status-completed {
		background: rgba(52, 211, 153, 0.1);
		border: 1px solid var(--success);
		color: var(--success);
	}

	.status-label { font-weight: 600; }
	.status-players { font-size: 0.8rem; color: var(--text-muted); }

	.join-section {
		text-align: center;
		padding: var(--space-lg);
	}

	/* Editor layout */
	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
		align-items: start;
	}

	@media (max-width: 900px) {
		.editor-layout { grid-template-columns: 1fr; }
	}

	.panel {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-subtle);
	}

	.panel-header h2 {
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.count { font-size: 0.75rem; color: var(--text-muted); }

	.panel-left {
		max-height: calc(100vh - 240px);
		overflow-y: auto;
	}

	.panel-right {
		position: sticky;
		top: var(--space-md);
		max-height: calc(100vh - 240px);
		overflow-y: auto;
	}

	/* History */
	.history {
		padding: var(--space-sm);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.turn-entry {
		padding: 8px 12px;
		border-radius: var(--radius-md);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		font-size: 0.8rem;
	}

	.turn-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.turn-number { color: var(--text-muted); font-weight: 600; }
	.turn-user { color: var(--text-secondary); }
	.turn-action {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	.turn-action--add { background: rgba(52, 211, 153, 0.2); color: var(--success); }
	.turn-action--edit { background: rgba(251, 191, 36, 0.2); color: var(--accent-warm); }
	.turn-action--delete { background: rgba(248, 113, 113, 0.2); color: var(--error); }
	.turn-target { color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem; }

	.turn-chords {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-primary);
		padding: 4px 0;
	}

	.turn-comment {
		color: var(--text-muted);
		font-style: italic;
		font-size: 0.75rem;
	}

	/* Turn input */
	.turn-input {
		padding: var(--space-md);
		border-top: 1px solid var(--border-subtle);
	}

	.action-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: var(--space-sm);
	}

	.tab {
		padding: 6px 16px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab.active {
		background: var(--accent-primary);
		color: #fff;
		border-color: var(--accent-primary);
	}

	.chord-input {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		resize: vertical;
		margin-bottom: var(--space-sm);
		box-sizing: border-box;
	}

	.line-select-hint {
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: var(--space-sm) 0;
	}

	.selected-line {
		font-size: 0.8rem;
		color: var(--accent-warm);
		font-weight: 600;
		margin-bottom: var(--space-xs);
	}

	.input-row {
		display: flex;
		gap: var(--space-sm);
	}

	.comment-input {
		flex: 1;
		font-size: 0.85rem;
	}

	.finish-btn {
		width: 100%;
		margin-top: var(--space-sm);
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	/* Finish proposal response */
	.finish-response {
		padding: var(--space-md);
		border-top: 1px solid var(--border-subtle);
		text-align: center;
	}

	.finish-response p {
		margin-bottom: var(--space-sm);
		color: var(--accent-warm);
		font-weight: 500;
	}

	.finish-buttons {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
	}

	/* Score lines */
	.score-lines {
		display: flex;
		flex-direction: column;
	}

	.score-line {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: 6px var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
		transition: background 0.15s;
	}

	.score-line--clickable {
		cursor: pointer;
	}

	.score-line--clickable:hover {
		background: var(--bg-hover);
	}

	.score-line--selected {
		background: rgba(167, 139, 250, 0.1);
		border-left: 3px solid var(--accent-primary);
	}

	.line-number {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-muted);
		min-width: 24px;
		flex-shrink: 0;
	}

	.line-author {
		font-size: 0.7rem;
		color: var(--text-muted);
		flex-shrink: 0;
		margin-left: auto;
	}

	.empty, .empty-score {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-xl);
		font-size: 0.85rem;
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
