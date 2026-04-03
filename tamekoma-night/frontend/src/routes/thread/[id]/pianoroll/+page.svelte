<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression } from '$lib/chord-parser';
	import { parseChord } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState, type OscPreset, type VoicingMode, setGlobalOscPreset, setVoicingMode, chordToNotes, isSelectionPlaying, stopSelection } from '$lib/chord-player';
	import PianoRollEditor, { type PianoRollExposedState } from '$lib/components/PianoRollEditor.svelte';
	import VelocityLane from '$lib/components/VelocityLane.svelte';
	import MiniMap from '$lib/components/MiniMap.svelte';
	import NoteInfoPanel from '$lib/components/NoteInfoPanel.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import EditorModeModal from '$lib/components/EditorModeModal.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { pianoRollToScore, type PianoRollBar } from '$lib/piano-roll-model';
	import { pianoRollBarsToBase64, pianoRollBarsToMidi, downloadMidiFile, importMidiFile } from '$lib/midi-io';

	const store = createAppStore();
	const threadId = page.params.id as string;

	// Player state
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
	let oscPreset = $state<OscPreset>('piano');

	// Score state
	let scoreEditorValue = $state('');
	let scoreInitialized = $state(false);
	let submitting = $state(false);
	let midiDirty = $state(false); // Track if piano roll has unsaved changes
	const hasChanges = $derived(midiDirty || (store.currentThread ? scoreEditorValue !== (store.currentThread.score || '') : false));

	// Editor mode modal state
	let editorModeModalOpen = $state(false);

	// PianoRollEditor exposed state (for VelocityLane + MiniMap)
	let prBars = $state<PianoRollBar[]>([]);
	let prSelectedNoteIds = $state<Set<string>>(new Set());
	let prScrollX = $state(0);
	let prScrollY = $state(0);
	let prPixelsPerTick = $state(200 / 1920);
	let prTicksPerBar = $state(1920);
	let prCanvasWidth = $state(800);
	let prCanvasHeight = $state(400);
	let prTotalTicks = $state(0);
	let velocityUpdate = $state<{ noteIds: string[]; velocity: number; seq: number } | null>(null);
	let velocitySeq = 0;
	let scrollUpdate = $state<{ scrollX: number; scrollY: number; seq: number } | null>(null);
	let scrollSeq = 0;
	let noteUpdate = $state<{ noteId: string; updates: { midi?: number; velocity?: number; durationTicks?: number; startTick?: number; isChordTone?: boolean }; seq: number } | null>(null);
	let noteUpdateSeq = 0;
	let midiDataOverride = $state<{ data: string; seq: number } | null>(null);
	let midiOverrideSeq = 0;
	let midiFileInput: HTMLInputElement;

	const handleStateExpose = (state: PianoRollExposedState) => {
		prBars = state.bars;
		prSelectedNoteIds = state.selectedNoteIds;
		prScrollX = state.scrollX;
		prScrollY = state.scrollY;
		prPixelsPerTick = state.pixelsPerTick;
		prTicksPerBar = state.ticksPerBar;
		prCanvasWidth = state.canvasWidth;
		prCanvasHeight = state.canvasHeight;
		prTotalTicks = state.totalTicks;
	};

	const handleNoteUpdate = (noteId: string, updates: { midi?: number; velocity?: number; durationTicks?: number; startTick?: number; isChordTone?: boolean }) => {
		noteUpdate = { noteId, updates, seq: ++noteUpdateSeq };
	};

	const handleMiniMapScrollChange = (sx: number, sy: number) => {
		scrollUpdate = { scrollX: sx, scrollY: sy, seq: ++scrollSeq };
	};

	const handleVelocityChange = (noteId: string, velocity: number) => {
		velocityUpdate = { noteIds: [noteId], velocity, seq: ++velocitySeq };
	};

	// Re-sync score from thread
	let lastSyncedAt = $state('');

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
		setVoicingMode('normal');
	});

	onDestroy(() => {
		player?.dispose();
	});

	// Init score from thread
	$effect(() => {
		const thread = store.currentThread;
		if (thread && !scoreInitialized) {
			scoreEditorValue = thread.score || '';
			scoreInitialized = true;
		}
	});

	// Re-sync on save
	$effect(() => {
		const thread = store.currentThread;
		if (thread && scoreInitialized && !submitting && thread.lastEditedAt !== lastSyncedAt) {
			scoreEditorValue = thread.score || '';
			lastSyncedAt = thread.lastEditedAt;
		}
	});

	// Show editor mode modal when editorMode is not set
	$effect(() => {
		const thread = store.currentThread;
		if (thread && !thread.editorMode) {
			editorModeModalOpen = true;
		}
	});

	const handleEditorModeSelect = async (mode: 'chord' | 'pianoroll') => {
		editorModeModalOpen = false;
		const thread = store.currentThread;
		if (!thread) return;
		try {
			await store.updateSettings(threadId, {
				key: thread.key,
				timeSignature: thread.timeSignature,
				bpm: thread.bpm,
				editorMode: mode,
			});
		} catch {
			// settings update failed, continue anyway
		}
		if (mode === 'chord') {
			window.location.href = `/thread/${threadId}`;
		}
	};

	// Unsaved changes warning
	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (hasChanges) { e.preventDefault(); }
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	// Player
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
		} catch { /* parse error */ }
	};

	const handlePlay = async () => {
		if (isSelectionPlaying()) { stopSelection(); return; }
		if (!player) buildPlayer();
		if (player) await player.play();
	};
	const handlePause = () => {
		if (isSelectionPlaying()) { stopSelection(); return; }
		player?.pause();
	};
	const handleStop = () => { player?.stop(); stopSelection(); activeBarIndex = -1; currentChord = null; };
	const handleSeek = (time: number) => {
		if (!player) buildPlayer();
		player?.seekTo(time);
	};
	const handleVolumeChange = (db: number) => { playerVolume = db; player?.setVolume(db); };
	const handleLoopChange = (loop: boolean) => { playerLoop = loop; player?.setLoop(loop); };
	const handleMetronomeChange = (on: boolean) => { playerMetronome = on; player?.setMetronome(on); };
	const handleVoicingModeChange = (mode: VoicingMode) => { playerVoicingMode = mode; setVoicingMode(mode); };
	const handleOscPresetChange = (preset: OscPreset) => {
		oscPreset = preset;
		setGlobalOscPreset(preset);
		player?.setOscPreset(preset);
	};

	const currentChordNotes = $derived.by(() => {
		if (!currentChord || playerState !== 'playing') return [] as string[];
		try {
			const parsed = parseChord(currentChord);
			return chordToNotes(parsed);
		} catch { return [] as string[]; }
	});

	// Save
	const handleSave = async () => {
		if (submitting || !hasChanges) return;
		submitting = true;
		try {
			const thread = store.currentThread;
			const ts = parseTimeSignature(thread?.timeSignature || '4/4');
			const midiData = pianoRollBarsToBase64($state.snapshot(prBars), thread?.bpm || 120, ts);
			await store.saveScore(threadId, { score: scoreEditorValue, comment: '', midiData });
			player?.dispose();
			player = null;
			midiDirty = false;
			showToast('保存しました', 'success');
		} catch {
			showToast('保存に失敗しました', 'error');
		} finally {
			submitting = false;
		}
	};

	const handleMidiExport = () => {
		const thread = store.currentThread;
		if (!thread || prBars.length === 0) return;
		const ts = parseTimeSignature(thread.timeSignature);
		const midi = pianoRollBarsToMidi($state.snapshot(prBars), thread.bpm, ts);
		downloadMidiFile(midi, (thread.title || 'export') + '.mid');
	};

	const handleMidiImport = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const result = await importMidiFile(file);
			const ts = { beats: result.timeSignature.beats, beatValue: result.timeSignature.beatValue };
			const midiBase64 = pianoRollBarsToBase64(result.bars, result.bpm, ts);
			midiDataOverride = { data: midiBase64, seq: ++midiOverrideSeq };
			const newScore = pianoRollToScore(result.bars);
			scoreEditorValue = newScore;
			player?.dispose();
			player = null;
			showToast('MIDIインポート完了', 'success');
		} catch {
			showToast('MIDIインポートに失敗しました', 'error');
		}
		input.value = '';
	};

	const handleScoreChange = (value: string) => {
		scoreEditorValue = value;
		midiDirty = true;
		// Invalidate player so it rebuilds with new score on next play
		player?.dispose();
		player = null;
	};

	// Keyboard shortcuts
	const handleKeydown = (e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
		if (e.key === ' ' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
			e.preventDefault();
			if (playerState === 'playing' || isSelectionPlaying()) handlePause();
			else handlePlay();
		}
		if (e.key === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSeek(Math.max(0, currentTime - 5)); }
		if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSeek(Math.min(totalDuration, currentTime + 5)); }
	};
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{store.currentThread?.title || 'Piano Roll'} - Tamekoma Night</title>
</svelte:head>

{#if store.currentThread}
	{@const thread = store.currentThread}

	<input type="file" accept=".mid,.midi" class="hidden" bind:this={midiFileInput} onchange={handleMidiImport} />

	<div class="pianoroll-page">
		<!-- Header -->
		<header class="pr-header">
			<a href="/thread/{threadId}" class="pr-back-btn" title="コードエディタへ戻る">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15,18 9,12 15,6" />
				</svg>
			</a>
			<h1 class="pr-title">{thread.title}</h1>
			<div class="pr-header-right">
				<a href="/thread/{threadId}" class="pr-link-btn" title="コードエディタへ">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="16 18 22 12 16 6" />
						<polyline points="8 6 2 12 8 18" />
					</svg>
					コード
				</a>
				<button class="pr-midi-btn" onclick={() => midiFileInput?.click()} title="MIDIファイルを読み込み">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="7 10 12 15 17 10" />
							<line x1="12" y1="15" x2="12" y2="3" />
						</svg>
						インポート
					</button>
					<button class="pr-midi-btn" onclick={handleMidiExport} title="MIDIファイルとしてダウンロード" disabled={prBars.length === 0}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						エクスポート
					</button>
					<button
						class="pr-save-btn"
						class:pr-save-btn--active={hasChanges}
						onclick={handleSave}
						disabled={submitting || !hasChanges}
					>
						{submitting ? '保存中...' : '保存'}
					</button>
				</div>
		</header>

		<!-- MiniMap -->
		<div class="pr-minimap">
			<MiniMap
				bars={prBars}
				scrollX={prScrollX}
				scrollY={prScrollY}
				pixelsPerTick={prPixelsPerTick}
				ticksPerBar={prTicksPerBar}
				canvasWidth={prCanvasWidth}
				canvasHeight={prCanvasHeight}
				totalTicks={prTotalTicks}
				{activeBarIndex}
				noteHeight={12}
				minMidi={12}
				maxMidi={108}
				onScrollChange={handleMiniMapScrollChange}
			/>
		</div>

		<!-- Main editor area -->
		<div class="pr-main">
			<div class="pr-editor-wrap">
				<PianoRollEditor
					score={scoreEditorValue}
					bpm={thread.bpm}
					timeSignature={thread.timeSignature}
					{activeBarIndex}
					{currentTime}
					{totalDuration}
					initialMidiData={thread.midiData || ''}
					onScoreChange={handleScoreChange}
					onSeek={handleSeek}
					onStateExpose={handleStateExpose}
					{velocityUpdate}
					{scrollUpdate}
					{noteUpdate}
					{midiDataOverride}
				/>
			</div>
			<NoteInfoPanel
				bars={prBars}
				selectedNoteIds={prSelectedNoteIds}
				ticksPerBar={prTicksPerBar}
				onNoteUpdate={handleNoteUpdate}
			/>
		</div>

		<!-- Velocity lane -->
		<div class="pr-velocity">
			<VelocityLane
				bars={prBars}
				selectedNoteIds={prSelectedNoteIds}
				scrollX={prScrollX}
				pixelsPerTick={prPixelsPerTick}
				ticksPerBar={prTicksPerBar}
				onVelocityChange={handleVelocityChange}
			/>
		</div>

		<!-- Player bar -->
		<div class="pr-player">
			<PlayerBar
				{playerState}
				{currentTime}
				{totalDuration}
				bpm={thread.bpm}
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
				hideAutoV={true}
				onOscPresetChange={handleOscPresetChange}
			/>
		</div>
	</div>

	<EditorModeModal
		open={editorModeModalOpen}
		onSelect={handleEditorModeSelect}
	/>

{:else if store.loading}
	<div class="pr-loading">
		<div class="pr-spinner"></div>
		<p>Loading...</p>
	</div>
{:else if store.error}
	<div class="pr-error">
		<h2>{store.error === '403' ? 'アクセス権限がありません' : 'スレッドが見つかりません'}</h2>
		<a href="/">ホームに戻る</a>
	</div>
{/if}

<style>
	.pianoroll-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--bg-deepest, #06060f);
		color: var(--text-primary, #e0e0ff);
	}

	/* Header */
	.pr-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: var(--bg-surface, #0d0d1a);
		border-bottom: 1px solid var(--border-subtle, #2a2a5a);
		flex-shrink: 0;
		min-height: 44px;
	}

	.pr-back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		color: var(--text-secondary, #9090b0);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
	}
	.pr-back-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-primary, #e0e0ff);
	}

	.pr-title {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 0;
	}

	.pr-header-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.pr-link-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		font-size: 12px;
		color: var(--text-secondary, #9090b0);
		text-decoration: none;
		border: 1px solid var(--border-subtle, #2a2a5a);
		border-radius: 6px;
		transition: background 0.15s, color 0.15s;
	}
	.pr-link-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary, #e0e0ff);
	}

	.hidden {
		display: none;
	}

	.pr-midi-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		font-size: 12px;
		color: var(--text-secondary, #9090b0);
		background: transparent;
		border: 1px solid var(--border-subtle, #2a2a5a);
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.pr-midi-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary, #e0e0ff);
	}
	.pr-midi-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pr-save-btn {
		padding: 4px 14px;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid var(--border-subtle, #2a2a5a);
		border-radius: 6px;
		background: transparent;
		color: var(--text-muted, #6060a0);
		cursor: not-allowed;
		transition: all 0.15s;
	}
	.pr-save-btn--active {
		background: var(--accent-primary, #6366f1);
		border-color: var(--accent-primary, #6366f1);
		color: #ffffff;
		cursor: pointer;
	}
	.pr-save-btn--active:hover {
		filter: brightness(1.15);
	}

	/* Slots */
	.pr-minimap {
		flex-shrink: 0;
	}

	.pr-velocity {
		flex-shrink: 0;
	}

	/* Main editor */
	.pr-main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
	}

	.pr-editor-wrap {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	/* Player */
	.pr-player {
		flex-shrink: 0;
	}

	/* Loading / Error */
	.pr-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 16px;
		color: var(--text-secondary, #9090b0);
	}

	.pr-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-subtle, #2a2a5a);
		border-top-color: var(--accent-primary, #6366f1);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.pr-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 16px;
		color: var(--text-secondary, #9090b0);
	}
	.pr-error a {
		color: var(--accent-primary, #6366f1);
	}

	@media (max-width: 600px) {
		.pr-header {
			padding: 6px 10px;
			gap: 8px;
			min-height: 40px;
		}
		.pr-title {
			font-size: 12px;
		}
		.pr-link-btn {
			padding: 3px 6px;
			font-size: 11px;
		}
		.pr-save-btn {
			padding: 3px 10px;
			font-size: 11px;
		}
		.pr-midi-btn {
			padding: 3px 6px;
			font-size: 11px;
		}
		.pr-minimap {
			display: none;
		}
		.pr-main {
			flex-direction: column;
		}
		.pr-velocity {
			height: 40px;
		}
	}
</style>
