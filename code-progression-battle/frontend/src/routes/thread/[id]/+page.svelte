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
	let chordsInput = $state('');
	let commentInput = $state('');
	let submitting = $state(false);

	// Inline edit state (right panel)
	let editingLine = $state<number | null>(null);
	let editingChords = $state('');
	let hoveredLine = $state<number | null>(null);
	let deleteConfirmLine = $state<number | null>(null);

	// History scroll ref
	let historyEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
	});

	onDestroy(() => {
		player?.dispose();
	});

	// Auto-scroll history to bottom
	$effect(() => {
		const thread = store.currentThread;
		if (thread && historyEl) {
			requestAnimationFrame(() => {
				historyEl!.scrollTop = historyEl!.scrollHeight;
			});
		}
	});

	const parseTimeSignature = (ts: string) => {
		const [beats, beatValue] = ts.split('/').map(Number);
		return { beats: beats || 4, beatValue: beatValue || 4 };
	};

	const buildPlayer = () => {
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
	};

	const handlePlay = () => { buildPlayer(); player?.play(); };
	const handlePause = () => { player?.pause(); };
	const handleStop = () => { player?.stop(); activeBarIndex = -1; };
	const handleSeek = (time: number) => { player?.seekTo(time); };

	const handleエクスポート = () => {
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
	};

	// ADD action (left panel)
	const handleAddTurn = async () => {
		if (submitting || !chordsInput.trim()) return;
		submitting = true;
		try {
			await store.submitTurn(threadId, 'add', 0, chordsInput.trim(), commentInput.trim());
			chordsInput = '';
			commentInput = '';
			player?.dispose();
			player = null;
		} finally {
			submitting = false;
		}
	};

	// EDIT action (right panel inline)
	const startEdit = (lineNum: number, chords: string) => {
		editingLine = lineNum;
		editingChords = chords;
		deleteConfirmLine = null;
	};

	const cancelEdit = () => {
		editingLine = null;
		editingChords = '';
	};

	const submitEdit = async () => {
		if (submitting || editingLine === null || !editingChords.trim()) return;
		submitting = true;
		try {
			await store.submitTurn(threadId, 'edit', editingLine, editingChords.trim(), '');
			editingLine = null;
			editingChords = '';
			player?.dispose();
			player = null;
		} finally {
			submitting = false;
		}
	};

	// DELETE action (right panel inline)
	const confirmDelete = (lineNum: number) => {
		deleteConfirmLine = lineNum;
		editingLine = null;
	};

	const cancelDelete = () => {
		deleteConfirmLine = null;
	};

	const submitDelete = async (lineNum: number) => {
		if (submitting) return;
		submitting = true;
		try {
			await store.submitTurn(threadId, 'delete', lineNum, '', '');
			deleteConfirmLine = null;
			player?.dispose();
			player = null;
		} finally {
			submitting = false;
		}
	};

	// Avatars: generate initials and color from name
	const avatarColor = (name: string): string => {
		const colors = [
			'#a78bfa', '#f472b6', '#34d399', '#60a5fa',
			'#fbbf24', '#f87171', '#38bdf8', '#a3e635'
		];
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
		return colors[Math.abs(hash) % colors.length];
	};

	const initials = (name: string): string => {
		return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
	};

	// Action description for history (BBS-style)
	const actionLabel = (action: string, lineNum: number): string => {
		switch (action) {
			case 'add': return `L${lineNum} を追加`;
			case 'edit': return `L${lineNum} を編集`;
			case 'delete': return `L${lineNum} を削除`;
			default: return action;
		}
	};

	// Friendly creative prompts that rotate
	const myTurnPrompts = [
		'次のコードはあなたの番。何を加える?',
		'あなたの番! コード進行を追加しよう',
		'スコアがあなたを待っています',
		'あなたの声を加えよう',
		"あなたのターンです。聴かせて!",
	];

	const pickPrompt = (turnCount: number): string => {
		return myTurnPrompts[turnCount % myTurnPrompts.length];
	};

	// Get opponent display name
	const opponentName = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return '';
		return t.currentTurn === t.createdBy ? t.createdByName : t.opponentName;
	});

	// Status helpers
	let statusLabel = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return '';
		switch (t.status) {
			case 'waiting': return '参加者を待っています...';
			case 'active': return store.isMyTurn ? pickPrompt(t.turnCount) : `@${opponentName} が考え中...`;
			case 'finish_proposed': return t.finishProposedBy === store.user?.sub ? '完成を提案しました。返答待ち...' : `@${opponentName} がスコアの完成を提案しています!`;
			case 'completed': return 'セッション完了! お疲れさまでした!';
			default: return t.status;
		}
	});

	let isMyTurnGlow = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return false;
		return t.status === 'active' && store.isMyTurn;
	});

	let isOpponentFinishProposal = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return false;
		return t.status === 'finish_proposed' && t.finishProposedBy !== store.user?.sub;
	});

	let statusType = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return 'waiting';
		if (t.status === 'completed') return 'completed';
		if (t.status === 'waiting') return 'waiting';
		if (store.isMyTurn || isOpponentFinishProposal) return 'myturn';
		return 'waiting';
	});

	let canAct = $derived.by(() => {
		const t = store.currentThread;
		if (!t) return false;
		return t.status === 'active' && store.isMyTurn && store.isPlayer;
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
			戻る
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
			<div class="header-actions">
				{#if canAct}
					<button class="btn-propose" onclick={() => store.proposeFinish(threadId)} title="Propose to finish">
						完成を提案
					</button>
				{/if}
				<button class="btn btn-ghost" onclick={handleエクスポート}>エクスポート</button>
			</div>
		{/if}
	</header>

	{#if store.currentThread}
		{@const thread = store.currentThread}

		<!-- Status bar -->
		<div class="status-bar status-{statusType}" class:status-glow={isMyTurnGlow}>
			<div class="status-left">
				{#if isMyTurnGlow}
					<svg class="status-note" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
					</svg>
				{/if}
				<span class="status-label">{statusLabel}</span>
			</div>
			<span class="status-players">
				{thread.createdByName} vs {thread.opponentName || '???'}
			</span>
		</div>

		<!-- Join button for invited player -->
		{#if thread.status === 'waiting' && !store.isPlayer}
			<div class="join-section">
				<button class="btn btn-primary" onclick={() => store.joinThread(threadId)}>このセッションに参加!</button>
			</div>
		{/if}

		<!-- Finish proposal response -->
		{#if isOpponentFinishProposal && store.isPlayer}
			<div class="finish-response">
				<span class="finish-text">@{opponentName} がスコアの完成を提案しています。終了しますか?</span>
				<div class="finish-buttons">
					<button class="btn btn-primary btn-sm" onclick={() => store.acceptFinish(threadId)}>承認</button>
					<button class="btn btn-secondary btn-sm" onclick={() => store.rejectFinish(threadId)}>却下</button>
				</div>
			</div>
		{/if}

		{#if store.error}
			<div class="error-banner">{store.error}</div>
		{/if}

		<div class="editor-layout">
			<!-- Left: Chat-style history + ADD input -->
			<div class="panel panel-left">
				<div class="panel-header">
					<h2>セッションログ</h2>
					<span class="count">{thread.history.length} ターン</span>
				</div>

				<div class="history-timeline" bind:this={historyEl}>
					{#each thread.history as turn, i}
						{@const isMe = turn.userId === store.user?.sub}
						<div class="post" class:post--mine={isMe}>
							<div class="post-header">
								<span class="post-number">#{turn.turnNumber}</span>
								<div class="post-avatar" style="background: {avatarColor(turn.userName)}">
									{initials(turn.userName)}
								</div>
								<span class="post-name">{turn.userName}</span>
								<span class="post-action post-action--{turn.action}">
									{actionLabel(turn.action, turn.lineNumber)}
								</span>
								{#if turn.createdAt}
									<span class="post-time">{new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
								{/if}
							</div>
							{#if turn.action !== 'delete' && turn.chords}
								<div class="post-chords">{turn.chords}</div>
							{/if}
							{#if turn.action === 'edit' && turn.previousChords}
								<div class="post-diff">
									<span class="diff-before">{turn.previousChords}</span>
									<span class="diff-arrow">-></span>
									<span class="diff-after">{turn.chords}</span>
								</div>
							{/if}
							{#if turn.action === 'delete'}
								<div class="post-deleted">line {turn.lineNumber} removed</div>
							{/if}
							{#if turn.comment}
								<div class="post-comment">{turn.comment}</div>
							{/if}
						</div>
					{/each}

					{#if thread.history.length === 0}
						<div class="empty-history">
							<div class="empty-icon">
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
									<path d="M9 18V5l12-2v13" />
									<circle cx="6" cy="18" r="3" />
									<circle cx="18" cy="16" r="3" />
								</svg>
							</div>
							<p class="empty-title">まだターンがありません</p>
							<p class="empty-sub">最初のコードを追加してセッションを始めよう!</p>
						</div>
					{/if}
				</div>

				<!-- ADD input at bottom -->
				{#if thread.status === 'active' && store.isPlayer}
					<div class="add-input" class:add-input--disabled={!canAct}>
						{#if !canAct}
							<div class="waiting-hint">@{opponentName} が作曲中...</div>
						{/if}
						<div class="add-input-row">
							<textarea
								class="chord-input"
								bind:value={chordsInput}
								placeholder="| Am7 | Dm7 | G7 | Cmaj7 |"
								rows="1"
								disabled={!canAct}
								onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTurn(); } }}
							></textarea>
							<button
								class="btn-send"
								onclick={handleAddTurn}
								disabled={!canAct || submitting || !chordsInput.trim()}
								title="Add line"
							>
								{#if submitting}
									<span class="spinner"></span>
								{:else}
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
										<line x1="22" y1="2" x2="11" y2="13" />
										<polygon points="22 2 15 22 11 13 2 9 22 2" />
									</svg>
								{/if}
							</button>
						</div>
						<input
							type="text"
							bind:value={commentInput}
							placeholder="コメントを追加..."
							class="comment-input"
							disabled={!canAct}
						/>
					</div>
				{/if}
			</div>

			<!-- Right: Interactive Score -->
			<div class="panel panel-right">
				<div class="panel-header">
					<h2>Score</h2>
					<span class="count">{thread.lines.length} lines</span>
				</div>

				<div class="score-lines">
					{#if thread.lines.length === 0}
						<div class="empty-score">
							<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.2">
								<path d="M9 18V5l12-2v13" />
								<circle cx="6" cy="18" r="3" />
								<circle cx="18" cy="16" r="3" />
							</svg>
							<p>スコアはまだ空です。最初のコードを追加しよう!</p>
						</div>
					{:else}
						{#each thread.lines as line, i}
							{@const lineNum = line.lineNumber}
							<div
								class="score-line"
								class:score-line--hover={hoveredLine === lineNum && canAct}
								class:score-line--editing={editingLine === lineNum}
								class:score-line--deleting={deleteConfirmLine === lineNum}
								onmouseenter={() => { if (canAct) hoveredLine = lineNum; }}
								onmouseleave={() => { hoveredLine = null; }}
							>
								<span class="line-number">L{lineNum}</span>

								{#if editingLine === lineNum}
									<!-- Inline edit mode -->
									<div class="inline-edit">
										<textarea
											class="inline-edit-input"
											bind:value={editingChords}
											rows="1"
											onkeydown={(e) => {
												if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
												if (e.key === 'Escape') cancelEdit();
											}}
										></textarea>
										<div class="inline-edit-actions">
											<button class="btn-inline btn-inline--save" onclick={submitEdit} disabled={submitting || !editingChords.trim()}>
												Save
											</button>
											<button class="btn-inline btn-inline--cancel" onclick={cancelEdit}>
												Cancel
											</button>
										</div>
									</div>
								{:else if deleteConfirmLine === lineNum}
									<!-- Delete confirmation -->
									<div class="delete-confirm">
										<span class="delete-confirm-text">この行を削除しますか?</span>
										<div class="delete-confirm-actions">
											<button class="btn-inline btn-inline--danger" onclick={() => submitDelete(lineNum)} disabled={submitting}>
												Delete
											</button>
											<button class="btn-inline btn-inline--cancel" onclick={cancelDelete}>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<!-- Normal display -->
									<div class="line-chords-wrapper">
										<ScoreEditor value={line.chords} readonly={true} />
									</div>

									<!-- Hover action icons -->
									{#if canAct && hoveredLine === lineNum}
										<div class="line-actions">
											<button
												class="line-action-btn"
												onclick={() => startEdit(lineNum, line.chords)}
												title="Edit this line"
											>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
													<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
												</svg>
											</button>
											<button
												class="line-action-btn line-action-btn--delete"
												onclick={() => confirmDelete(lineNum)}
												title="Delete this line"
											>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<polyline points="3 6 5 6 21 6" />
													<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
												</svg>
											</button>
										</div>
									{/if}
								{/if}

								<span class="line-author" title="Added by {line.addedByName}">
									{initials(line.addedByName)}
								</span>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{:else if store.loading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading thread...</p>
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
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-md) var(--space-lg);
		padding-bottom: calc(var(--player-height) + var(--space-xl));
	}

	/* Header */
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

	.header-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		flex-shrink: 0;
	}

	.btn-propose {
		padding: 4px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-propose:hover {
		border-color: var(--accent-warm);
		color: var(--accent-warm);
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
		transition: all 0.3s ease;
	}

	.status-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-myturn {
		background: rgba(167, 139, 250, 0.15);
		border: 1px solid var(--accent-primary);
		color: var(--accent-primary);
	}

	.status-glow {
		box-shadow: 0 0 20px rgba(167, 139, 250, 0.3), 0 0 40px rgba(167, 139, 250, 0.1);
		animation: glow-pulse 2s ease-in-out infinite;
	}

	@keyframes glow-pulse {
		0%, 100% { box-shadow: 0 0 20px rgba(167, 139, 250, 0.3), 0 0 40px rgba(167, 139, 250, 0.1); }
		50% { box-shadow: 0 0 30px rgba(167, 139, 250, 0.5), 0 0 60px rgba(167, 139, 250, 0.2); }
	}

	.status-note {
		animation: note-bounce 1.5s ease-in-out infinite;
		flex-shrink: 0;
	}

	@keyframes note-bounce {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		25% { transform: translateY(-2px) rotate(-5deg); }
		75% { transform: translateY(1px) rotate(3deg); }
	}

	.status-waiting {
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid var(--border-default);
		color: var(--text-secondary);
	}

	.status-completed {
		background: linear-gradient(135deg, rgba(52, 211, 153, 0.1), rgba(167, 139, 250, 0.08));
		border: 1px solid var(--success);
		color: var(--success);
	}

	.status-label { font-weight: 600; }
	.status-players { font-size: 0.8rem; color: var(--text-muted); }

	.join-section {
		text-align: center;
		padding: var(--space-lg);
	}

	/* Finish response */
	.finish-response {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-md);
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
	}

	.finish-text {
		color: var(--accent-warm);
		font-weight: 500;
		font-size: 0.85rem;
	}

	.finish-buttons {
		display: flex;
		gap: var(--space-xs);
	}

	.btn-sm {
		padding: 4px 12px;
		font-size: 0.8rem;
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
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 240px);
	}

	.panel-right {
		position: sticky;
		top: var(--space-md);
		max-height: calc(100vh - 240px);
		overflow-y: auto;
	}

	/* BBS-style thread history */
	.history-timeline {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-xs) 0;
		display: flex;
		flex-direction: column;
	}

	.post {
		padding: 10px var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
		animation: post-in 0.25s ease-out;
		transition: background 0.15s;
	}

	.post:hover {
		background: rgba(167, 139, 250, 0.03);
	}

	.post--mine {
		border-left: 3px solid var(--accent-primary);
	}

	@keyframes post-in {
		from { opacity: 0; transform: translateY(6px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.post-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.post-number {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent-primary);
		font-weight: 700;
		min-width: 24px;
	}

	.post-avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.55rem;
		font-weight: 700;
		color: #fff;
		flex-shrink: 0;
	}

	.post-name {
		font-weight: 600;
		color: var(--text-secondary);
		font-size: 0.78rem;
	}

	.post-action {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.post-action--add { color: var(--success); }
	.post-action--edit { color: var(--accent-warm); }
	.post-action--delete { color: var(--error); }

	.post-time {
		margin-left: auto;
		font-size: 0.68rem;
		color: var(--text-muted);
		opacity: 0.6;
		font-family: var(--font-mono);
	}

	.post-chords {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-primary);
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.12);
		border-radius: 6px;
		margin: 4px 0 2px 30px;
		border-left: 2px solid rgba(167, 139, 250, 0.3);
	}

	.post-diff {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		margin: 4px 0 2px 30px;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.diff-before {
		color: var(--error);
		opacity: 0.7;
		text-decoration: line-through;
	}

	.diff-arrow {
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.diff-after {
		color: var(--success);
	}

	.post-deleted {
		color: var(--error);
		font-size: 0.78rem;
		font-style: italic;
		opacity: 0.7;
		margin-left: 30px;
	}

	.post-comment {
		color: var(--text-muted);
		font-size: 0.78rem;
		margin: 4px 0 0 30px;
		padding-left: 8px;
		border-left: 2px solid var(--border-default);
	}

	.empty-history {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl) var(--space-md);
		color: var(--text-muted);
		gap: 4px;
	}

	.empty-icon {
		opacity: 0.25;
		margin-bottom: var(--space-sm);
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-secondary);
	}

	.empty-sub {
		font-size: 0.8rem;
		margin: 0;
	}

	/* ADD input area */
	.add-input {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-surface);
	}

	.add-input--disabled {
		opacity: 0.5;
	}

	.waiting-hint {
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
		padding-bottom: var(--space-xs);
	}

	.add-input-row {
		display: flex;
		gap: var(--space-xs);
		align-items: flex-end;
	}

	.chord-input {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.88rem;
		resize: none;
		border-radius: 8px;
		padding: 8px 12px;
		border: 1px solid var(--border-default);
		background: var(--bg-base);
		color: var(--text-primary);
		box-sizing: border-box;
		min-height: 36px;
	}

	.chord-input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
	}

	.btn-send {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--accent-primary);
		color: #fff;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s;
	}

	.btn-send:hover:not(:disabled) {
		background: var(--accent-secondary);
		transform: scale(1.05);
	}

	.btn-send:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.comment-input {
		width: 100%;
		font-size: 0.78rem;
		padding: 4px 12px;
		margin-top: 4px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		box-sizing: border-box;
	}

	.comment-input:focus {
		outline: none;
		background: var(--bg-base);
	}

	.comment-input::placeholder {
		color: var(--text-muted);
		opacity: 0.6;
	}

	/* Score lines (right panel) */
	.score-lines {
		padding: var(--space-xs) 0;
	}

	.score-line {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px var(--space-md);
		position: relative;
		transition: background 0.15s;
		border-bottom: 1px solid transparent;
	}

	.score-line--hover {
		background: rgba(167, 139, 250, 0.05);
		border-bottom-color: var(--border-subtle);
	}

	.score-line--editing {
		background: rgba(167, 139, 250, 0.08);
		border-bottom-color: var(--accent-primary);
	}

	.score-line--deleting {
		background: rgba(248, 113, 113, 0.08);
		border-bottom-color: rgba(248, 113, 113, 0.3);
	}

	.line-number {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-muted);
		width: 28px;
		text-align: right;
		flex-shrink: 0;
		opacity: 0.6;
	}

	.line-chords-wrapper {
		flex: 1;
		min-width: 0;
	}

	/* Make inline ScoreEditor compact */
	.line-chords-wrapper :global(.score-editor) {
		width: 100%;
	}

	.line-chords-wrapper :global(.se-container) {
		min-height: unset;
	}

	.line-chords-wrapper :global(.se-highlight),
	.line-chords-wrapper :global(.se-textarea) {
		padding: 0;
		line-height: 2;
		font-size: 0.9rem;
	}

	.line-chords-wrapper :global(.se-textarea) {
		min-height: unset;
		height: auto;
	}

	.line-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.line-action-btn {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
		background: var(--bg-surface);
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.line-action-btn:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.1);
	}

	.line-action-btn--delete:hover {
		border-color: var(--error);
		color: var(--error);
		background: rgba(248, 113, 113, 0.1);
	}

	.line-author {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text-muted);
		opacity: 0.5;
		flex-shrink: 0;
		width: 20px;
		text-align: center;
	}

	/* Inline edit */
	.inline-edit {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 0;
	}

	.inline-edit-input {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.88rem;
		padding: 6px 10px;
		border: 1px solid var(--accent-primary);
		border-radius: 6px;
		background: var(--bg-base);
		color: var(--text-primary);
		resize: none;
		box-sizing: border-box;
	}

	.inline-edit-input:focus {
		outline: none;
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
	}

	.inline-edit-actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}

	.btn-inline {
		padding: 3px 12px;
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		transition: all 0.15s;
	}

	.btn-inline--save {
		background: var(--accent-primary);
		color: #fff;
	}

	.btn-inline--save:hover {
		opacity: 0.9;
	}

	.btn-inline--save:disabled {
		opacity: 0.4;
	}

	.btn-inline--cancel {
		background: transparent;
		color: var(--text-muted);
		border-color: var(--border-default);
	}

	.btn-inline--cancel:hover {
		background: var(--bg-surface);
	}

	.btn-inline--danger {
		background: var(--error);
		color: #fff;
	}

	.btn-inline--danger:hover {
		opacity: 0.9;
	}

	.btn-inline--danger:disabled {
		opacity: 0.4;
	}

	/* Delete confirmation */
	.delete-confirm {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: 6px 0;
	}

	.delete-confirm-text {
		font-size: 0.82rem;
		color: var(--error);
		font-weight: 500;
	}

	.delete-confirm-actions {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}

	.empty-score {
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		color: var(--text-muted);
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

	.loading p {
		font-size: 0.85rem;
		margin: 0;
	}
</style>
