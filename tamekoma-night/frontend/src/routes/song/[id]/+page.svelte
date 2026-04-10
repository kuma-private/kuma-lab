<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createSongStore } from '$lib/stores/song.svelte';
	import type { Song, MidiNote } from '$lib/types/song';
	import FlowEditor from '$lib/components/flow/FlowEditor.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { MultiTrackPlayer } from '$lib/multi-track-player';
	import { songToMidi, downloadMidi } from '$lib/midi-export';
	import { chordToNotes } from '$lib/chord-player';
	import { parseChord } from '$lib/chord-parser';

	const store = createSongStore();
	const songId = page.params.id as string;

	// Player state
	let playerState = $state<'stopped' | 'playing' | 'paused'>('stopped');
	let currentTime = $state(0);
	let totalDuration = $state(0);
	let currentChord = $state<string | null>(null);
	let playerVolume = $state(-10);
	let playerLoop = $state(false);

	// Derive playing note names from current chord for keyboard highlighting
	let playingNoteNames = $derived.by(() => {
		if (!currentChord || playerState !== 'playing') return [];
		try {
			return chordToNotes(parseChord(currentChord));
		} catch { return []; }
	});

	// Track notes for Visualizer
	let trackNotes = $state<Map<string, { name: string; instrument: string; notes: MidiNote[] }>>(new Map());

	// MultiTrackPlayer instance
	let player: MultiTrackPlayer | null = null;

	// FlowEditor active tab (lifted so it survives song saves)
	let activeTab = $state<'flow' | 'text'>('text');

	// Inline title editing
	let editingTitle = $state(false);
	let titleInput = $state('');

	// Inline BPM editing
	let editingBpm = $state(false);
	let bpmInput = $state(120);

	// Tap tempo
	let tapTimes = $state<number[]>([]);
	let tapTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleTap() {
		const now = Date.now();

		// Reset if more than 2 seconds since last tap
		if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
			tapTimes = [];
		}

		tapTimes = [...tapTimes, now];

		// Need at least 2 taps to calculate BPM
		if (tapTimes.length >= 2) {
			const intervals = [];
			for (let i = 1; i < tapTimes.length; i++) {
				intervals.push(tapTimes[i] - tapTimes[i - 1]);
			}
			const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
			const bpm = Math.round(60000 / avgInterval);
			const clampedBpm = Math.max(40, Math.min(240, bpm));

			if (store.currentSong) {
				handleSongChange({ ...store.currentSong, bpm: clampedBpm });
			}
		}

		// Keep only last 8 taps
		if (tapTimes.length > 8) {
			tapTimes = tapTimes.slice(-8);
		}

		// Clear after 2 seconds of inactivity
		if (tapTimeout) clearTimeout(tapTimeout);
		tapTimeout = setTimeout(() => { tapTimes = []; }, 2000);
	}

	function startBpmEdit() {
		if (!store.currentSong) return;
		bpmInput = store.currentSong.bpm;
		editingBpm = true;
	}

	function finishBpmEdit() {
		editingBpm = false;
		if (store.currentSong && bpmInput >= 40 && bpmInput <= 240 && bpmInput !== store.currentSong.bpm) {
			handleSongChange({ ...store.currentSong, bpm: bpmInput });
			showToast(`BPM を ${bpmInput} に変更しました`, 'success');
		}
	}

	// Inline Key editing
	let editingKey = $state(false);
	let keyInput = $state('C Major');

	const KEY_OPTIONS = [
		'C Major', 'C# Major', 'D Major', 'Eb Major', 'E Major', 'F Major',
		'F# Major', 'G Major', 'Ab Major', 'A Major', 'Bb Major', 'B Major',
		'C Minor', 'C# Minor', 'D Minor', 'Eb Minor', 'E Minor', 'F Minor',
		'F# Minor', 'G Minor', 'Ab Minor', 'A Minor', 'Bb Minor', 'B Minor',
	];

	function startKeyEdit() {
		if (!store.currentSong) return;
		keyInput = store.currentSong.key || 'C Major';
		editingKey = true;
	}

	function finishKeyEdit() {
		editingKey = false;
		if (store.currentSong && keyInput !== store.currentSong.key) {
			handleSongChange({ ...store.currentSong, key: keyInput });
			showToast(`キーを ${keyInput} に変更しました`, 'success');
		}
	}

	// Inline Time Signature editing
	let editingTs = $state(false);
	let tsInput = $state('4/4');

	const TS_OPTIONS = ['4/4', '3/4', '6/8', '2/4', '5/4', '7/8'];

	function startTsEdit() {
		if (!store.currentSong) return;
		tsInput = store.currentSong.timeSignature || '4/4';
		editingTs = true;
	}

	function finishTsEdit() {
		editingTs = false;
		if (!store.currentSong || tsInput === store.currentSong.timeSignature) return;

		const hasGeneratedMidi = store.currentSong.tracks.some(t =>
			t.blocks.some(b => b.generatedMidi?.notes?.length)
		);

		if (hasGeneratedMidi) {
			const choice = window.confirm(
				`拍子を ${store.currentSong.timeSignature} から ${tsInput} に変更します。\n\n` +
				`既存のAI生成MIDIは新しい拍子に合わないため削除されます。\n` +
				`変更後、各ブロックで再生成してください。\n\n` +
				`続行しますか？`
			);
			if (!choice) return;

			// Deep copy to avoid mutating the current song object
			const updatedSong = JSON.parse(JSON.stringify(store.currentSong));
			updatedSong.timeSignature = tsInput;
			for (const track of updatedSong.tracks) {
				for (const block of track.blocks) {
					block.generatedMidi = undefined;
				}
			}
			handleSongChange(updatedSong);
		} else {
			handleSongChange({ ...store.currentSong, timeSignature: tsInput });
		}

		showToast(`拍子を ${tsInput} に変更しました`, 'success');
	}

	function updateTrackNotes() {
		if (!player || !store.currentSong) return;
		const notes = player.getAllTrackNotes();
		trackNotes = new Map(
			store.currentSong.tracks.map(t => [t.id, { name: t.name, instrument: t.instrument, notes: notes.get(t.id) ?? [] }])
		);
	}

	async function loadSongIntoPlayer() {
		if (!player || !store.currentSong) return;
		await player.load(store.currentSong);
		totalDuration = player.totalDuration;
		updateTrackNotes();
	}

	onMount(async () => {
		player = new MultiTrackPlayer({
			onStateChange: (state) => { playerState = state; },
			onProgress: (ct, td) => { currentTime = ct; totalDuration = td; },
			onBarChange: (_idx) => { /* reserved */ },
			onChordChange: (chord) => { currentChord = chord; },
		});

		await store.loadSong(songId);
		if (store.currentSong) {
			await loadSongIntoPlayer();
		}
	});

	onDestroy(() => {
		player?.dispose();
		player = null;
	});

	// Reload player when song changes
	let lastSongJson = $state('');
	$effect(() => {
		const song = store.currentSong;
		if (!song || !player) return;
		const json = JSON.stringify({ chords: song.chordProgression, tracks: song.tracks, bpm: song.bpm, ts: song.timeSignature, key: song.key });
		if (json !== lastSongJson) {
			lastSongJson = json;
			loadSongIntoPlayer();
		}
	});

	const handleSave = async () => {
		try {
			await store.saveSong();
			showToast('保存しました', 'success');
		} catch {
			showToast('保存に失敗しました', 'error');
		}
	};

	const handleSongChange = (updatedSong: Song) => {
		store.setCurrentSong(updatedSong);
	};

	const startTitleEdit = () => {
		if (!store.currentSong) return;
		titleInput = store.currentSong.title;
		editingTitle = true;
	};

	const finishTitleEdit = () => {
		editingTitle = false;
		if (store.currentSong && titleInput.trim() && titleInput !== store.currentSong.title) {
			store.setCurrentSong({ ...store.currentSong, title: titleInput.trim() });
		}
	};

	function parseTimeSignature(ts: string): { beats: number; beatValue: number } {
		const parts = ts.split('/');
		if (parts.length === 2) {
			const beats = Number(parts[0]);
			const beatValue = Number(parts[1]);
			if (Number.isFinite(beats) && Number.isFinite(beatValue) && beats > 0 && beatValue > 0) {
				return { beats, beatValue };
			}
		}
		return { beats: 4, beatValue: 4 };
	}

	function handleExport() {
		if (!player || !store.currentSong) return;
		const allNotes = player.getAllTrackNotes();
		const tracks = store.currentSong.tracks.map(t => ({
			name: t.name,
			instrument: t.instrument,
			program: t.program,
			notes: allNotes.get(t.id) ?? [],
		}));
		const ts = parseTimeSignature(store.currentSong.timeSignature);
		const midi = songToMidi(tracks, store.currentSong.bpm, ts);
		downloadMidi(midi, store.currentSong.title);
	}

	const handlePlay = async () => { await player?.play(); };
	const handlePause = () => { player?.pause(); };

	const handleKeydown = (e: KeyboardEvent) => {
		// Cmd/Ctrl+S: 保存
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
			return;
		}
		// Space: 再生/一時停止（input/textarea 以外）
		if (e.key === ' ' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
			e.preventDefault();
			if (playerState === 'playing') handlePause();
			else void handlePlay();
			return;
		}
		// Escape: ポップオーバーを閉じる（フォーカス解除）
		if (e.key === 'Escape') {
			if (e.target instanceof HTMLElement) e.target.blur();
		}
		// Cmd/Ctrl+Z: Undo (将来用のプレースホルダー)
	};
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{store.currentSong?.title ?? 'Song'} - Cadenza.fm</title>
</svelte:head>

<div class="song-page">
	<!-- Header -->
	<header class="song-header">
		<div class="header-left">
			<a href="/" class="back-btn" aria-label="ホームに戻る">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
			</a>
			{#if store.currentSong}
				{#if editingTitle}
					<input
						class="title-input"
						bind:value={titleInput}
						onblur={finishTitleEdit}
						onkeydown={(e) => { if (e.key === 'Enter') finishTitleEdit(); }}
					/>
				{:else}
					<button class="title-display" onclick={startTitleEdit}>
						{store.currentSong.title}
					</button>
				{/if}
			{/if}
		</div>
		<div class="header-center">
			{#if store.currentSong}
				{#if editingKey}
					<select class="meta-pill-input" bind:value={keyInput} onblur={finishKeyEdit} onchange={finishKeyEdit}>
						{#each KEY_OPTIONS as opt}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{:else}
					<button class="meta-pill" onclick={startKeyEdit}>{store.currentSong.key || 'C'}</button>
				{/if}
				{#if editingBpm}
					<input type="number" class="meta-pill-input" bind:value={bpmInput} min="40" max="240" onblur={finishBpmEdit} onkeydown={(e) => { if (e.key === 'Enter') finishBpmEdit(); }} />
				{:else}
					<button class="meta-pill" onclick={startBpmEdit}>{store.currentSong.bpm || 120} BPM</button>
						<button class="tap-btn" onclick={handleTap} title="タップでBPM設定">TAP</button>
				{/if}
				{#if editingTs}
					<select class="meta-pill-input" bind:value={tsInput} onblur={finishTsEdit} onchange={finishTsEdit}>
						{#each TS_OPTIONS as opt}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{:else}
					<button class="meta-pill" onclick={startTsEdit}>{store.currentSong.timeSignature || '4/4'}</button>
				{/if}
			{/if}
		</div>
		<div class="header-right">
			<button class="btn-export" onclick={handleExport}>Export .mid</button>
			<button class="btn-save" onclick={handleSave}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
					<polyline points="17 21 17 13 7 13 7 21" />
					<polyline points="7 3 7 8 15 8" />
				</svg>
				保存
			</button>
		</div>
	</header>

	<!-- Error banner -->
	{#if store.error}
		<div class="error-banner" role="alert">{store.error}</div>
	{/if}

	<!-- Main: FlowEditor -->
	<main class="song-main">
		{#if store.loading}
			<div class="loading-container">
				<div class="loading-spinner"></div>
			</div>
		{:else if store.currentSong}
			<FlowEditor song={store.currentSong} {songId} onSongChange={handleSongChange} {trackNotes} {currentTime} {totalDuration}
				{activeTab}
				onTabChange={(tab) => activeTab = tab}
				onSeekToBar={(barIndex) => {
					if (!player) return;
					const beatsPerBar = parseTimeSignature(store.currentSong?.timeSignature ?? '4/4').beats;
					const secondsPerBeat = 60 / (store.currentSong?.bpm ?? 120);
					const targetSeconds = barIndex * beatsPerBar * secondsPerBeat;
					player.seekTo(targetSeconds);
				}}
			/>
		{:else}
			<div class="loading-container">
				<p style="color: var(--text-muted);">Song が見つかりません</p>
			</div>
		{/if}
	</main>

	<!-- PlayerBar -->
	<div class="player-anchor">
		<PlayerBar
			playerState={playerState}
			currentTime={currentTime}
			totalDuration={totalDuration}
			bpm={store.currentSong?.bpm ?? 120}
			currentChord={currentChord}
			volume={playerVolume}
			loop={playerLoop}
			playingNotes={playingNoteNames}
			onplay={handlePlay}
			onpause={handlePause}
			onstop={() => { player?.stop(); }}
			onseek={(t) => { player?.seekTo(t); }}
			onVolumeChange={(v) => { playerVolume = v; player?.setVolume(v); }}
			onLoopChange={(l) => { playerLoop = l; }}
		/>
	</div>
</div>

<style>
	.song-page {
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-base);
		color: var(--text-primary);
	}

	/* Header */
	.song-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
		min-height: 48px;
		gap: var(--space-md);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1;
		min-width: 0;
	}

	.header-center {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-shrink: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		text-decoration: none;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.back-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.title-display {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		background: none;
		border: none;
		border-bottom: 1px dashed transparent;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 300px;
		text-align: left;
		transition: border-color 0.15s;
	}

	.title-display:hover {
		border-bottom-color: var(--border-default);
	}

	.title-input {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		background: var(--bg-elevated);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		max-width: 300px;
		outline: none;
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
	}

	.meta-pill {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		padding: 2px 10px;
		border-radius: var(--radius-full);
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.meta-pill:hover {
		border-color: var(--border-default);
		color: var(--text-secondary);
	}

	.meta-pill-input {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-primary);
		background: var(--bg-elevated);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-full);
		padding: 2px 8px;
		outline: none;
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
		max-width: 90px;
	}
	select.meta-pill-input {
		max-width: 120px;
	}

	.tap-btn {
		padding: 2px 8px;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-weight: 600;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.12s;
	}
	.tap-btn:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
	}
	.tap-btn:active {
		background: rgba(232, 168, 76, 0.15);
	}

	.btn-export {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.btn-export:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--accent-primary);
	}

	.btn-save {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.btn-save:hover {
		background: #d09440;
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(232, 168, 76, 0.35);
	}

	/* Error */
	.error-banner {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		color: var(--error);
		margin: var(--space-sm) var(--space-md);
		flex-shrink: 0;
	}

	/* Main */
	.song-main {
		flex: 1;
		overflow: auto;
		padding: var(--space-md) var(--space-lg);
		padding-bottom: calc(var(--player-height) + var(--space-md));
	}

	.loading-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 300px;
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* PlayerBar anchor — PlayerBar itself is position:fixed,
	   this wrapper just provides a DOM location for it. */
	.player-anchor {
		display: contents;
	}

	/* Mobile */
	@media (max-width: 600px) {
		.song-header {
			padding: var(--space-xs) var(--space-sm);
		}

		.header-center {
			display: none;
		}

		.title-display, .title-input {
			max-width: 160px;
			font-size: 0.9rem;
		}
	}
</style>
