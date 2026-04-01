<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression, transpose, parseChord } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState, type OscPreset, type VoicingMode, setGlobalOscPreset, setVoicingMode, chordToNotes, onSelectionNotes } from '$lib/chord-player';
	import type { DisplayMode } from '$lib/components/ScoreEditor.svelte';
	import type { SaveHistory, Comment } from '$lib/api';
	import { getComments, addComment, deleteComment } from '$lib/api';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import ThreadHeader from '$lib/components/ThreadHeader.svelte';
	import ScorePanel from '$lib/components/ScorePanel.svelte';
	import ToolsPanel from '$lib/components/ToolsPanel.svelte';
	import SessionDrawer from '$lib/components/SessionDrawer.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';

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
	let playerMetronome = $state(false);
	let playerVoicingMode = $state<VoicingMode>('normal');
	let selectionNotes = $state<string[]>([]);

	// Save state
	let commentInput = $state('');
	let submitting = $state(false);

	// ScoreEditor state
	let scoreEditorValue = $state('');
	let pendingInsertText = $state('');
	let scoreInitialized = $state(false);
	let scoreDisplayMode = $state<DisplayMode>('chord');

	// Import modal state
	let importModalOpen = $state(false);

	// Share modal state
	let shareModalOpen = $state(false);

	// Comments state
	let comments = $state<Comment[]>([]);

	// Drawer state
	let drawerOpen = $state(false);
	let historyItems = $state<SaveHistory[]>([]);

	const toggleDrawer = async () => {
		drawerOpen = !drawerOpen;
		if (drawerOpen) {
			historyItems = await store.loadHistory(threadId);
			try {
				comments = await getComments(threadId);
			} catch {
				// comments endpoint may not exist yet
			}
		}
	};

	const handleShare = () => {
		shareModalOpen = true;
	};

	const handleShareUpdate = (visibility: string, sharedWith: string[]) => {
		if (store.currentThread) {
			store.currentThread.visibility = visibility;
			store.currentThread.sharedWith = sharedWith;
		}
	};

	const handleAddComment = async (text: string) => {
		try {
			const comment = await addComment(threadId, {
				text,
				anchorType: 'global',
				anchorStart: 0,
				anchorEnd: 0,
				anchorSnapshot: '',
			});
			comments = [...comments, comment];
		} catch {
			// handle error silently
		}
	};

	const handleDeleteComment = async (commentId: string) => {
		try {
			await deleteComment(threadId, commentId);
			comments = comments.filter(c => c.id !== commentId);
		} catch {
			// handle error silently
		}
	};

	const closeDrawer = () => {
		drawerOpen = false;
	};

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
		onSelectionNotes((notes) => { selectionNotes = notes; });
	});

	onDestroy(() => {
		player?.dispose();
		onSelectionNotes(null);
	});

	// Ctrl+S / Cmd+S to save
	const handleKeydown = (e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
	};

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
		player.setMetronome(playerMetronome);
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
	const handleMetronomeChange = (on: boolean) => { playerMetronome = on; player?.setMetronome(on); };
	const handleVoicingModeChange = (mode: VoicingMode) => { playerVoicingMode = mode; setVoicingMode(mode); };

	// Compute notes for the current chord to highlight on the keyboard
	const currentChordNotes = $derived.by(() => {
		// Selection playback notes take priority
		if (selectionNotes.length > 0) return selectionNotes;
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
			// Reload history to reflect the new save
			historyItems = await store.loadHistory(threadId);
		} finally {
			submitting = false;
		}
	};

	// Review a specific history entry (called from SessionDrawer)
	const handleReviewEntry = async (index: number): Promise<{ comment: string; scores: string }> => {
		const result = await store.requestReview(threadId);
		historyItems = await store.loadHistory(threadId);
		return result;
	};

	// Settings update
	const handleUpdateSettings = async (data: { title?: string; key?: string; timeSignature?: string; bpm?: number }) => {
		const thread = store.currentThread;
		if (!thread) return;
		const fullData = {
			title: data.title ?? '',
			key: data.key ?? thread.key,
			timeSignature: data.timeSignature ?? thread.timeSignature,
			bpm: data.bpm ?? thread.bpm,
		};
		await store.updateSettings(threadId, fullData);
	};

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

	const handleOpenImport = () => { importModalOpen = true; };

	const handleImportConfirm = (chords: string, meta: { bpm: number; timeSignature: string; key: string }) => {
		scoreEditorValue = scoreEditorValue.trim()
			? scoreEditorValue + '\n\n' + chords
			: chords;
		importModalOpen = false;
		// Update session settings with import meta
		const updates: { bpm?: number; timeSignature?: string; key?: string } = {};
		if (meta.bpm > 0) updates.bpm = meta.bpm;
		if (meta.timeSignature) updates.timeSignature = meta.timeSignature;
		if (meta.key) updates.key = meta.key;
		if (Object.keys(updates).length > 0) {
			handleUpdateSettings(updates);
		}
	};
</script>

<svelte:window onkeydown={handleKeydown} />

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
			{submitting}
			visibility={thread.visibility || 'private'}
			onOpenLog={toggleDrawer}
			onExport={handleExport}
			onSave={handleSave}
			onShare={handleShare}
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
					onScoreChange={handleScoreChange}
					onImport={handleOpenImport}
					onTransposeUp={handleTransposeUp}
					onTransposeDown={handleTransposeDown}
					onDisplayModeChange={handleDisplayModeChange}
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
	{@const thread2 = store.currentThread}
	<ImportModal
		open={importModalOpen}
		threadId={threadId}
		initialBpm={thread2.bpm}
		initialTimeSignature={thread2.timeSignature}
		initialKey={thread2.key}
		onclose={() => { importModalOpen = false; }}
		onconfirm={handleImportConfirm}
	/>
	<ShareModal
		open={shareModalOpen}
		threadId={threadId}
		currentVisibility={thread2.visibility || 'private'}
		currentSharedWith={thread2.sharedWith || []}
		onclose={() => { shareModalOpen = false; }}
		onupdate={handleShareUpdate}
	/>
	<SessionDrawer
		history={historyItems}
		open={drawerOpen}
		onClose={closeDrawer}
		onRestore={handleRestoreScore}
		onReviewEntry={handleReviewEntry}
		{comments}
		onAddComment={handleAddComment}
		onDeleteComment={handleDeleteComment}
		currentUserId={store.user?.sub || ''}
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
	metronome={playerMetronome}
	voicingMode={playerVoicingMode}
	{oscPreset}
	playingNotes={currentChordNotes}
	onplay={handlePlay}
	onpause={handlePause}
	onstop={handleStop}
	onseek={handleSeek}
	onVolumeChange={handleVolumeChange}
	onLoopChange={handleLoopChange}
	onMetronomeChange={handleMetronomeChange}
	onVoicingModeChange={handleVoicingModeChange}
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
