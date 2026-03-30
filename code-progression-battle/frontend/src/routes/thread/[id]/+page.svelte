<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression, transpose } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState, type OscPreset, setGlobalOscPreset } from '$lib/chord-player';
	import ScoreEditor from '$lib/components/ScoreEditor.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import AiReview from '$lib/components/AiReview.svelte';
	import PatternPicker from '$lib/components/PatternPicker.svelte';
	import PianoKeyboard from '$lib/components/PianoKeyboard.svelte';
	import CircleOfFifths from '$lib/components/CircleOfFifths.svelte';

	const store = createAppStore();
	const threadId = page.params.id as string;

	let player: ChordPlayer | null = null;
	let playerState = $state<PlayerState>('stopped');
	let currentTime = $state(0);
	let totalDuration = $state(0);
	let activeBarIndex = $state(-1);
	let currentChord = $state<string | null>(null);
	let playerVolume = $state(-10);
	let playerLoop = $state(false);

	// Turn action state
	let commentInput = $state('');
	let submitting = $state(false);
	let diffError = $state<string | null>(null);

	// ScoreEditor state (right panel)
	let scoreEditorValue = $state('');
	let scoreInitialized = $state(false);

	// History scroll ref
	let historyEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
	});

	onDestroy(() => {
		player?.dispose();
	});

	// Sync ScoreEditor value from thread lines
	$effect(() => {
		const thread = store.currentThread;
		if (thread && !scoreInitialized) {
			scoreEditorValue = thread.lines.map(l => l.chords).join('\n');
			scoreInitialized = true;
		}
	});

	// Re-sync when thread updates (after submit, etc.)
	$effect(() => {
		const thread = store.currentThread;
		if (thread && scoreInitialized && !submitting) {
			scoreEditorValue = thread.lines.map(l => l.chords).join('\n');
		}
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
				onBarChange: (idx) => { activeBarIndex = idx; },
				onChordChange: (chord) => { currentChord = chord; }
			}
		);
		player.setVolume(playerVolume);
		player.setLoop(playerLoop);
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
	const handleStop = () => { player?.stop(); activeBarIndex = -1; currentChord = null; };
	const handleSeek = (time: number) => { player?.seekTo(time); };
	const handleVolumeChange = (db: number) => { playerVolume = db; player?.setVolume(db); };
	const handleLoopChange = (loop: boolean) => { playerLoop = loop; player?.setLoop(loop); };

	let oscPreset = $state<OscPreset>('piano');
	const handleOscPresetChange = (preset: OscPreset) => {
		oscPreset = preset;
		setGlobalOscPreset(preset);
		player?.setOscPreset(preset);
	};

	const handleExport = () => {
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

	// Diff calculation: compare old lines to new lines
	type DiffResult =
		| { action: 'add'; lineNumber: number; chords: string }
		| { action: 'edit'; lineNumber: number; chords: string }
		| { action: 'delete'; lineNumber: number }
		| { action: 'none' }
		| { action: 'error'; message: string };

	const computeDiff = (oldLines: string[], newLines: string[]): DiffResult => {
		// Filter out empty trailing lines for comparison
		const trimTrailing = (lines: string[]): string[] => {
			const result = [...lines];
			while (result.length > 0 && result[result.length - 1].trim() === '') {
				result.pop();
			}
			return result;
		};

		const oldTrimmed = trimTrailing(oldLines);
		const newTrimmed = trimTrailing(newLines);

		const oldLen = oldTrimmed.length;
		const newLen = newTrimmed.length;

		if (newLen > oldLen) {
			// ADD: line count increased
			if (newLen - oldLen !== 1) {
				return { action: 'error', message: '1ターンにつき1行のみ追加できます' };
			}
			// Check that existing lines are unchanged
			let insertIdx = -1;
			let j = 0;
			for (let i = 0; i < newLen; i++) {
				if (j < oldLen && newTrimmed[i].trim() === oldTrimmed[j].trim()) {
					j++;
				} else if (insertIdx === -1) {
					insertIdx = i;
				} else {
					return { action: 'error', message: '1ターンにつき1操作のみ可能です（複数行の変更が検出されました）' };
				}
			}
			if (j !== oldLen) {
				return { action: 'error', message: '1ターンにつき1操作のみ可能です（追加と編集が同時に検出されました）' };
			}
			if (insertIdx === -1) insertIdx = newLen - 1;
			return { action: 'add', lineNumber: insertIdx + 1, chords: newTrimmed[insertIdx].trim() };
		} else if (newLen < oldLen) {
			// DELETE: line count decreased
			if (oldLen - newLen !== 1) {
				return { action: 'error', message: '1ターンにつき1行のみ削除できます' };
			}
			let deleteIdx = -1;
			let j = 0;
			for (let i = 0; i < oldLen; i++) {
				if (j < newLen && oldTrimmed[i].trim() === newTrimmed[j].trim()) {
					j++;
				} else if (deleteIdx === -1) {
					deleteIdx = i;
				} else {
					return { action: 'error', message: '1ターンにつき1操作のみ可能です（複数行の変更が検出されました）' };
				}
			}
			if (j !== newLen) {
				return { action: 'error', message: '1ターンにつき1操作のみ可能です（削除と編集が同時に検出されました）' };
			}
			if (deleteIdx === -1) deleteIdx = oldLen - 1;
			return { action: 'delete', lineNumber: deleteIdx + 1 };
		} else {
			// Same length: check for edit
			const changedIndices: number[] = [];
			for (let i = 0; i < oldLen; i++) {
				if (oldTrimmed[i].trim() !== newTrimmed[i].trim()) {
					changedIndices.push(i);
				}
			}
			if (changedIndices.length === 0) {
				return { action: 'none' };
			}
			if (changedIndices.length > 1) {
				return { action: 'error', message: '1ターンにつき1行のみ編集できます' };
			}
			const idx = changedIndices[0];
			return { action: 'edit', lineNumber: idx + 1, chords: newTrimmed[idx].trim() };
		}
	};

	// Submit turn using diff
	const handleSubmitTurn = async () => {
		if (submitting) return;
		const thread = store.currentThread;
		if (!thread) return;

		diffError = null;

		const oldLines = thread.lines.map(l => l.chords);
		const newLines = scoreEditorValue.split('\n');

		const diff = computeDiff(oldLines, newLines);

		if (diff.action === 'error') {
			diffError = diff.message;
			return;
		}
		if (diff.action === 'none') {
			diffError = '変更がありません';
			return;
		}

		submitting = true;
		try {
			const lineNumber = 'lineNumber' in diff ? diff.lineNumber : 0;
			const chords = 'chords' in diff ? diff.chords : '';
			await store.submitTurn(threadId, diff.action, lineNumber, chords, commentInput.trim());
			commentInput = '';
			scoreInitialized = false;
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

	// Action description for history
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

	let scoreReadonly = $derived(!canAct);

	// AI Review: extract from latest turn
	const latestAiComment = $derived.by(() => {
		const t = store.currentThread;
		if (!t || t.history.length === 0) return '';
		const latest = t.history[t.history.length - 1];
		return latest.aiComment || '';
	});

	const latestAiScores = $derived.by(() => {
		const t = store.currentThread;
		if (!t || t.history.length === 0) return null;
		const latest = t.history[t.history.length - 1];
		if (!latest.aiScores) return null;
		try {
			const parsed = JSON.parse(latest.aiScores);
			if (typeof parsed.tension === 'number' && typeof parsed.creativity === 'number'
				&& typeof parsed.coherence === 'number' && typeof parsed.surprise === 'number') {
				return parsed as { tension: number; creativity: number; coherence: number; surprise: number };
			}
		} catch { /* ignore */ }
		return null;
	});

	// Pattern insert handler
	const handlePatternInsert = (chords: string) => {
		if (scoreReadonly) return;
		scoreEditorValue = scoreEditorValue
			? scoreEditorValue + '\n' + chords
			: chords;
		diffError = null;
	};

	const handleScoreChange = (value: string) => {
		scoreEditorValue = value;
		diffError = null;
	};

	// Circle of Fifths chord insert
	const handleChordInsert = (chord: string) => {
		if (scoreReadonly) return;
		// Append chord with space to the current value
		if (!scoreEditorValue.trim()) {
			scoreEditorValue = '| ' + chord + ' |';
		} else {
			// Insert before the last | if it exists, or append
			const trimmed = scoreEditorValue.trimEnd();
			if (trimmed.endsWith('|')) {
				scoreEditorValue = trimmed.slice(0, -1).trimEnd() + ' ' + chord + ' |';
			} else {
				scoreEditorValue = trimmed + ' ' + chord;
			}
		}
		diffError = null;
	};

	// Transpose handlers (preview only)
	let transposeSemitones = $state(0);

	const handleTransposeUp = () => {
		transposeSemitones++;
		scoreEditorValue = transpose(scoreEditorValue, 1);
	};

	const handleTransposeDown = () => {
		transposeSemitones--;
		scoreEditorValue = transpose(scoreEditorValue, -1);
	};

	// Piano keyboard open state for padding adjustment
	let pianoOpen = $state(false);

	const handlePianoToggle = (open: boolean) => {
		pianoOpen = open;
	};
</script>

<svelte:head>
	<title>{store.currentThread?.title || 'Thread'} - Code Progression Battle</title>
</svelte:head>

<div class="page" class:page--piano-open={pianoOpen}>
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
				<button class="btn btn-ghost" onclick={handleExport}>エクスポート</button>
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
			<!-- Left: Session log + comment input + submit button -->
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
							{#if turn.aiComment}
								<div class="ai-comment">
									<span class="ai-icon">AI</span>
									<div class="ai-body">
										<span class="ai-text">{turn.aiComment}</span>
										{#if turn.aiScores}
											{@const scores = (() => { try { return JSON.parse(turn.aiScores); } catch { return null; } })()}
											{#if scores && typeof scores.tension === 'number'}
												<div class="ai-scores">
													<span class="ai-score" title="テンション">T:{scores.tension}</span>
													<span class="ai-score" title="創造性">C:{scores.creativity}</span>
													<span class="ai-score" title="整合性">H:{scores.coherence}</span>
													<span class="ai-score" title="サプライズ">S:{scores.surprise}</span>
												</div>
											{/if}
										{/if}
									</div>
								</div>
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
							<p class="empty-sub">右のスコアを編集してセッションを始めよう!</p>
						</div>
					{/if}
				</div>

				<!-- Waiting hint when not your turn -->
				{#if thread.status === 'active' && store.isPlayer && !canAct}
					<div class="submit-area submit-area--disabled">
						<div class="waiting-hint">@{opponentName} が作曲中...</div>
					</div>
				{/if}
			</div>

			<!-- Right: AI Review + Score + Pattern Picker -->
			<div class="panel panel-right">
				{#if latestAiComment || latestAiScores}
					<div class="right-section">
						<AiReview comment={latestAiComment} scores={latestAiScores} />
					</div>
				{/if}

				<div class="panel-header">
					<h2>Score</h2>
					<div class="panel-header-right">
						<div class="transpose-controls">
							<button class="transpose-btn" onclick={handleTransposeDown} title="半音下げ">-</button>
							<span class="transpose-label">
								{#if transposeSemitones !== 0}
									{transposeSemitones > 0 ? '+' : ''}{transposeSemitones}
								{:else}
									Key: {thread.key}
								{/if}
							</span>
							<button class="transpose-btn" onclick={handleTransposeUp} title="半音上げ">+</button>
						</div>
						<span class="count">{thread.lines.length} lines</span>
					</div>
				</div>

				<div class="score-area">
					{#if thread.lines.length === 0 && scoreReadonly}
						<div class="empty-score">
							<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.2">
								<path d="M9 18V5l12-2v13" />
								<circle cx="6" cy="18" r="3" />
								<circle cx="18" cy="16" r="3" />
							</svg>
							<p>スコアはまだ空です。最初のコードを追加しよう!</p>
						</div>
					{:else}
						<ScoreEditor
							value={scoreEditorValue}
							readonly={scoreReadonly}
							onchange={handleScoreChange}
						/>
					{/if}
				</div>

				{#if canAct}
					<div class="save-area">
						{#if diffError}
							<div class="diff-error">{diffError}</div>
						{/if}
						<textarea
							class="comment-textarea"
							bind:value={commentInput}
							placeholder="コメントを残す..."
							rows="1"
						></textarea>
						<button
							class="btn-submit-turn"
							onclick={handleSubmitTurn}
							disabled={submitting}
						>
							{#if submitting}
								<span class="spinner"></span>
							{:else}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
									<polyline points="17 21 17 13 7 13 7 21" />
									<polyline points="7 3 7 8 15 8" />
								</svg>
							{/if}
							保存
						</button>
					</div>

					{#if thread.key}
						<div class="right-section right-section--bottom">
							<CircleOfFifths currentKey={thread.key} onInsert={handleChordInsert} />
						</div>
						<div class="right-section right-section--bottom">
							<PatternPicker key={thread.key} onInsert={handlePatternInsert} />
						</div>
					{/if}
				{/if}

			</div>
		</div>
	{:else if store.loading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading thread...</p>
		</div>
	{/if}
</div>

<PianoKeyboard collapsed={true} onToggle={handlePianoToggle} />

<PlayerBar
	state={playerState}
	{currentTime}
	{totalDuration}
	bpm={store.currentThread?.bpm ?? 120}
	{currentChord}
	volume={playerVolume}
	loop={playerLoop}
	{oscPreset}
	onplay={handlePlay}
	onpause={handlePause}
	onstop={handleStop}
	onseek={handleSeek}
	onVolumeChange={handleVolumeChange}
	onLoopChange={handleLoopChange}
	onOscPresetChange={handleOscPresetChange}
/>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-xl);
		padding-bottom: calc(var(--player-height) + var(--space-2xl));
		transition: padding-bottom 0.2s;
	}

	.page--piano-open {
		padding-bottom: calc(var(--player-height) + 140px + var(--space-2xl));
	}

	/* Header */
	.thread-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-lg);
		padding-bottom: var(--space-lg);
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
		gap: var(--space-sm);
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
		padding: var(--space-md) var(--space-lg);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-lg);
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
		gap: var(--space-lg);
		padding: var(--space-md) var(--space-lg);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-lg);
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
		gap: var(--space-xl);
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
		padding: var(--space-md) var(--space-lg);
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
		padding: var(--space-md) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.post {
		padding: var(--space-md) var(--space-lg);
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
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
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
		padding: var(--space-sm) var(--space-md);
		background: rgba(0, 0, 0, 0.12);
		border-radius: 6px;
		margin: var(--space-sm) 0 var(--space-xs) 30px;
		border-left: 2px solid rgba(167, 139, 250, 0.3);
	}

	.post-diff {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		margin: var(--space-sm) 0 var(--space-xs) 30px;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
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
		margin: var(--space-sm) 0 0 30px;
		padding-left: var(--space-sm);
		border-left: 2px solid var(--border-default);
	}

	/* AI comment bubble */
	.ai-comment {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		margin: var(--space-sm) 0 0 30px;
		padding: var(--space-sm) var(--space-md);
		background: rgba(96, 165, 250, 0.08);
		border-radius: 6px;
		border-left: 2px solid rgba(96, 165, 250, 0.3);
	}

	.ai-icon {
		font-size: 0.6rem;
		font-weight: 700;
		color: rgba(96, 165, 250, 0.8);
		background: rgba(96, 165, 250, 0.15);
		padding: 1px 4px;
		border-radius: 3px;
		flex-shrink: 0;
		line-height: 1.4;
	}

	.ai-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ai-text {
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.ai-scores {
		display: flex;
		gap: 6px;
	}

	.ai-score {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-style: normal;
		font-weight: 600;
		color: rgba(96, 165, 250, 0.7);
		background: rgba(96, 165, 250, 0.08);
		padding: 1px 5px;
		border-radius: 3px;
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

	/* Submit area (left panel bottom) */
	.submit-area {
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-surface);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.save-area {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-md) var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.submit-area--disabled {
		opacity: 0.5;
	}

	.waiting-hint {
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
		padding-bottom: var(--space-xs);
	}

	.diff-error {
		font-size: 0.78rem;
		color: var(--error);
		padding: 4px 8px;
		background: rgba(248, 113, 113, 0.1);
		border-radius: 4px;
	}

	.comment-textarea {
		width: 100%;
		font-size: 0.8rem;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--border-default);
		border-radius: 6px;
		background: var(--bg-base);
		color: var(--text-primary);
		resize: none;
		box-sizing: border-box;
	}

	.comment-textarea:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
	}

	.comment-textarea::placeholder {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.btn-submit-turn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		border: none;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-submit-turn:hover:not(:disabled) {
		background: var(--accent-secondary);
		transform: translateY(-1px);
	}

	.btn-submit-turn:disabled {
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

	.right-section {
		padding: var(--space-md);
	}

	.right-section--bottom {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-md) var(--space-lg);
	}

	.panel-header-right {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.transpose-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.transpose-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 700;
		font-family: var(--font-mono);
		cursor: pointer;
		transition: all 0.15s;
		line-height: 1;
	}

	.transpose-btn:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--accent-primary);
	}

	.transpose-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-muted);
		min-width: 48px;
		text-align: center;
	}

	/* Score area (right panel) */
	.score-area {
		padding: var(--space-md);
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
