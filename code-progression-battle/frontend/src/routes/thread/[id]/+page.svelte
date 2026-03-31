<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression, transpose, parseChord } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState, type OscPreset, setGlobalOscPreset, chordToNotes } from '$lib/chord-player';
	import type { DisplayMode } from '$lib/components/ScoreEditor.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import ThreadHeader from '$lib/components/ThreadHeader.svelte';
	import ScorePanel from '$lib/components/ScorePanel.svelte';
	import ToolsPanel from '$lib/components/ToolsPanel.svelte';
	import SessionDrawer from '$lib/components/SessionDrawer.svelte';

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

	// ScoreEditor state
	let scoreEditorValue = $state('');
	let pendingInsertText = $state('');
	let scoreInitialized = $state(false);
	let scoreDisplayMode = $state<DisplayMode>('chord');

	// Drawer state
	let drawerOpen = $state(false);

	const toggleDrawer = () => {
		drawerOpen = !drawerOpen;
	};

	const closeDrawer = () => {
		drawerOpen = false;
	};

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

	// Re-sync when thread updates (after submit)
	let lastSyncedTurnCount = $state(-1);
	$effect(() => {
		const thread = store.currentThread;
		if (thread && scoreInitialized && !submitting && thread.turnCount !== lastSyncedTurnCount) {
			scoreEditorValue = thread.lines.map(l => l.chords).join('\n');
			lastSyncedTurnCount = thread.turnCount;
			transposeSemitones = 0;
		}
	});

	const parseTimeSignature = (ts: string) => {
		const [beats, beatValue] = ts.split('/').map(Number);
		return { beats: beats || 4, beatValue: beatValue || 4 };
	};

	const buildPlayer = () => {
		const thread = store.currentThread;
		if (!thread) return;
		const textToPlay = scoreEditorValue || thread.lines.map(l => l.chords).join('\n');
		if (!textToPlay.trim()) return;
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
			const { bars } = parseProgression(textToPlay);
			if (bars.length > 0) player.load(bars);
		} catch {
			// parse error – ignore
		}
	};

	const handlePlay = async () => {
		buildPlayer();
		if (player) await player.play();
	};
	const handlePause = () => { player?.pause(); };
	const handleStop = () => { player?.stop(); activeBarIndex = -1; currentChord = null; };
	const handleSeek = (time: number) => { player?.seekTo(time); };
	const handleVolumeChange = (db: number) => { playerVolume = db; player?.setVolume(db); };
	const handleLoopChange = (loop: boolean) => { playerLoop = loop; player?.setLoop(loop); };

	// Compute notes for the current chord to highlight on the keyboard
	const currentChordNotes = $derived.by(() => {
		if (!currentChord || playerState !== 'playing') return [] as string[];
		try {
			const parsed = parseChord(currentChord);
			return chordToNotes(parsed);
		} catch {
			return [] as string[];
		}
	});

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
			if (newLen - oldLen !== 1) {
				return { action: 'error', message: '1ターンにつき1行のみ追加できます' };
			}
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

	const handleChordSelect = (chord: string) => {
		pendingInsertText = chord + '::' + Date.now();
	};

	const handleInsertBar = () => {
		pendingInsertText = '| ::' + Date.now();
	};

	const handleInsertNewline = () => {
		pendingInsertText = '\n::' + Date.now();
	};

	const handleDeleteLastLine = () => {
		const lines = scoreEditorValue.split('\n');
		if (lines.length > 0) {
			lines.pop();
			scoreEditorValue = lines.join('\n');
		}
	};

	const handleDisplayModeChange = (mode: DisplayMode) => {
		scoreDisplayMode = mode;
	};

	const handleCommentChange = (value: string) => {
		commentInput = value;
	};
</script>

<svelte:head>
	<title>{store.currentThread?.title || 'Thread'} - Code Progression Battle</title>
</svelte:head>

<div class="page">
	{#if store.currentThread}
		{@const thread = store.currentThread}

		<ThreadHeader
			{thread}
			logCount={thread.history.length}
			{statusLabel}
			{statusType}
			{isMyTurnGlow}
			{canAct}
			isPlayer={store.isPlayer}
			{isOpponentFinishProposal}
			{opponentName}
			{drawerOpen}
			error={store.error}
			onOpenLog={toggleDrawer}
			onProposeFinish={() => store.proposeFinish(threadId)}
			onExport={handleExport}
			onJoin={() => store.joinThread(threadId)}
			onAcceptFinish={() => store.acceptFinish(threadId)}
			onRejectFinish={() => store.rejectFinish(threadId)}
		/>

		<!-- Main editor layout: Score (main) + Tools (sidebar) -->
		<div class="editor-layout">
			<ScorePanel
				{thread}
				{scoreEditorValue}
				{activeBarIndex}
				{scoreDisplayMode}
				{transposeSemitones}
				{canAct}
				{scoreReadonly}
				{pendingInsertText}
				isPlayer={store.isPlayer}
				{opponentName}
				{commentInput}
				{submitting}
				{diffError}
				{latestAiComment}
				{latestAiScores}
				onScoreChange={handleScoreChange}
				onSave={handleSubmitTurn}
				onTransposeUp={handleTransposeUp}
				onTransposeDown={handleTransposeDown}
				onDisplayModeChange={handleDisplayModeChange}
				onCommentChange={handleCommentChange}
				onInsertBar={handleInsertBar}
				onInsertNewline={handleInsertNewline}
				onDeleteLastLine={handleDeleteLastLine}
			/>

			<ToolsPanel
				{thread}
				{canAct}
				{scoreReadonly}
				onChordSelect={handleChordSelect}
				onPatternInsert={handlePatternInsert}
			/>
		</div>
	{:else if store.loading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading thread...</p>
		</div>
	{/if}
</div>

{#if store.currentThread}
	{@const thread = store.currentThread}
	<SessionDrawer
		{thread}
		open={drawerOpen}
		user={store.user}
		{opponentName}
		{isOpponentFinishProposal}
		isPlayer={store.isPlayer}
		onClose={closeDrawer}
		onAcceptFinish={() => store.acceptFinish(threadId)}
		onRejectFinish={() => store.rejectFinish(threadId)}
	/>
{/if}

<PlayerBar
	state={playerState}
	{currentTime}
	{totalDuration}
	bpm={store.currentThread?.bpm ?? 120}
	{currentChord}
	volume={playerVolume}
	loop={playerLoop}
	{oscPreset}
	playingNotes={currentChordNotes}
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
		padding-bottom: calc(80px + var(--space-2xl));
	}

	/* Editor layout: 2-column grid */
	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
		align-items: start;
	}

	@media (max-width: 900px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}
		.editor-layout > :nth-child(2) {
			order: -1;
		}
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

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 600px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
