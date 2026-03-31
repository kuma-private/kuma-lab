<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression, transpose, parseChord } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState, type OscPreset, setGlobalOscPreset, chordToNotes } from '$lib/chord-player';
	import type { DisplayMode } from '$lib/components/ScoreEditor.svelte';
	import type { SaveHistory } from '$lib/api';
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

	// Save state
	let commentInput = $state('');
	let submitting = $state(false);
	let reviewing = $state(false);

	// ScoreEditor state
	let scoreEditorValue = $state('');
	let pendingInsertText = $state('');
	let scoreInitialized = $state(false);
	let scoreDisplayMode = $state<DisplayMode>('chord');

	// Drawer state
	let drawerOpen = $state(false);
	let historyItems = $state<SaveHistory[]>([]);

	const toggleDrawer = async () => {
		drawerOpen = !drawerOpen;
		if (drawerOpen) {
			historyItems = await store.loadHistory(threadId);
		}
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

	// Sync ScoreEditor value from thread score
	$effect(() => {
		const thread = store.currentThread;
		if (thread && !scoreInitialized) {
			scoreEditorValue = thread.score || '';
			scoreInitialized = true;
		}
	});

	// Re-sync when thread updates (after save)
	let lastSyncedAt = $state('');
	$effect(() => {
		const thread = store.currentThread;
		if (thread && scoreInitialized && !submitting && thread.lastEditedAt !== lastSyncedAt) {
			scoreEditorValue = thread.score || '';
			lastSyncedAt = thread.lastEditedAt;
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
		const textToPlay = scoreEditorValue || thread.score || '';
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
			// parse error - ignore
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
		const body = thread.score || '';
		const md = header + body;
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${thread.title.replace(/\s+/g, '_')}.md`;
		a.click();
		URL.revokeObjectURL(url);
	};

	// Save score
	const handleSave = async () => {
		if (submitting) return;
		submitting = true;
		try {
			await store.saveScore(threadId, { score: scoreEditorValue, comment: commentInput.trim() });
			commentInput = '';
			player?.dispose();
			player = null;
			// Auto-trigger AI review after save
			reviewing = true;
			try {
				await store.requestReview(threadId);
				// Reload history to show AI comment
				historyItems = await store.loadHistory(threadId);
			} finally {
				reviewing = false;
			}
		} finally {
			submitting = false;
		}
	};

	// Request AI review
	const handleRequestReview = async () => {
		if (reviewing) return;
		reviewing = true;
		try {
			await store.requestReview(threadId);
		} finally {
			reviewing = false;
		}
	};

	// Settings update
	const handleUpdateSettings = async (data: { key?: string; timeSignature?: string; bpm?: number }) => {
		const thread = store.currentThread;
		if (!thread) return;
		// Always send all fields (backend requires all)
		const fullData = {
			key: data.key ?? thread.key,
			timeSignature: data.timeSignature ?? thread.timeSignature,
			bpm: data.bpm ?? thread.bpm,
		};
		await store.updateSettings(threadId, fullData);
	};

	// AI Review: extract from latest history
	const latestAiComment = $derived.by(() => {
		if (historyItems.length === 0) return '';
		const latest = historyItems[historyItems.length - 1];
		return latest.aiComment || '';
	});

	const latestAiScores = $derived.by(() => {
		if (historyItems.length === 0) return null;
		const latest = historyItems[historyItems.length - 1];
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
		scoreEditorValue = scoreEditorValue
			? scoreEditorValue + '\n' + chords
			: chords;
	};

	const handleScoreChange = (value: string) => {
		scoreEditorValue = value;
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

	const handleRestoreScore = (score: string) => {
		scoreEditorValue = score;
	};
</script>

<svelte:head>
	<title>{store.currentThread?.title || 'Thread'} - Tamekoma Night</title>
</svelte:head>

<div class="page">
	{#if store.currentThread}
		{@const thread = store.currentThread}

		<ThreadHeader
			{thread}
			{drawerOpen}
			error={store.error}
			onOpenLog={toggleDrawer}
			onExport={handleExport}
			onUpdateSettings={handleUpdateSettings}
		/>

		<!-- Main editor layout: Score (main) + Tools (sidebar) -->
		<div class="editor-layout">
			<div class="panel-score">
				<ScorePanel
					{thread}
					{scoreEditorValue}
					{activeBarIndex}
					{scoreDisplayMode}
					{transposeSemitones}
					{pendingInsertText}
					{commentInput}
					{submitting}
					{reviewing}
					{latestAiComment}
					{latestAiScores}
					onScoreChange={handleScoreChange}
					onSave={handleSave}
					onRequestReview={handleRequestReview}
					onTransposeUp={handleTransposeUp}
					onTransposeDown={handleTransposeDown}
					onDisplayModeChange={handleDisplayModeChange}
					onCommentChange={handleCommentChange}
					onInsertBar={handleInsertBar}
					onInsertNewline={handleInsertNewline}
					onDeleteLastLine={handleDeleteLastLine}
				/>
			</div>

			<div class="panel-tools">
				<ToolsPanel
					{thread}
					canAct={true}
					scoreReadonly={false}
					onChordSelect={handleChordSelect}
					onPatternInsert={handlePatternInsert}
				/>
			</div>
		</div>
	{:else if store.loading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading thread...</p>
		</div>
	{/if}
</div>

{#if store.currentThread}
	<SessionDrawer
		history={historyItems}
		open={drawerOpen}
		onClose={closeDrawer}
		onRestore={handleRestoreScore}
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
		padding: var(--space-sm) var(--space-xl);
		padding-bottom: calc(80px + var(--space-md));
		display: flex;
		flex-direction: column;
		min-height: calc(100vh - 80px);
		box-sizing: border-box;
	}

	/* Editor layout: 2-column grid */
	.editor-layout {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--space-md);
		flex: 1;
		min-height: 0;
	}

	.panel-score, .panel-tools {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--bg-base);
		overflow-y: auto;
	}

	/* Make ScorePanel fill the panel height */
	.panel-score {
		display: flex;
		flex-direction: column;
	}

	.panel-score > :global(*) {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 900px) {
		.editor-layout {
			grid-template-columns: 1fr;
			height: auto;
		}
		.editor-layout > :nth-child(2) {
			order: -1;
		}
		.panel-score, .panel-tools {
			height: auto;
			overflow-y: visible;
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
