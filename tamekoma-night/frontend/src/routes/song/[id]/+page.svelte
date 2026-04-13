<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { songStore as store } from '$lib/stores/song.svelte';
	import type { Song, MidiNote } from '$lib/types/song';
	import FlowEditor from '$lib/components/flow/FlowEditor.svelte';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { createEngine, chooseEngineKind, type PlaybackEngine } from '$lib/playback/engine';
	import { bridgeStore } from '$lib/stores/bridge.svelte';
	import { planStore } from '$lib/stores/plan.svelte';
	import { songToMidi, downloadMidi } from '$lib/midi-export';

	const songId = page.params.id as string;

	// Player state
	let playerState = $state<'stopped' | 'playing' | 'paused'>('stopped');
	let currentTime = $state(0);
	let totalDuration = $state(0);
	let currentChord = $state<string | null>(null);
	let playerVolume = $state(-10);
	let playerLoop = $state(false);

	// Track notes for Visualizer
	let trackNotes = $state<Map<string, { name: string; instrument: string; notes: MidiNote[] }>>(new Map());

	// Playback engine instance (Tone for Free, Bridge for Premium)
	let player: PlaybackEngine | null = null;
	let currentEngineKind: 'tone' | 'bridge' | null = null;

	// Inline title editing
	let editingTitle = $state(false);
	let titleInput = $state('');

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

	function attachEngineCallbacks(engine: PlaybackEngine) {
		engine.onStateChange = (s) => {
			if (s === 'idle') return;
			playerState = s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'stopped';
		};
		engine.onProgress = (ct, td) => { currentTime = ct; totalDuration = td; };
		engine.onBarChange = (_idx) => { /* reserved */ };
		engine.onChordChange = (chord) => { currentChord = chord; };
	}

	// Wait until bridgeStore.state has settled out of the transient
	// 'idle'/'connecting' phase, so that the initial chooseEngineKind() call
	// sees the real outcome of the handshake. Without this wait, a Premium
	// user's onMount races the WebSocket handshake and locks in the Tone
	// fallback engine — the $effect rebuild path that's supposed to fix
	// this up doesn't observably fire under Svelte 5 reactivity in e2e.
	async function waitForBridgeSettled(timeoutMs = 4000): Promise<void> {
		const settled = (s: string) => s === 'connected' || s === 'disconnected';
		if (settled(bridgeStore.state)) return;
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			if (settled(bridgeStore.state)) return;
			await new Promise((r) => setTimeout(r, 50));
		}
	}

	async function buildEngine() {
		// Only Premium users care about the Bridge engine; Free users always get
		// Tone, so there's no point waiting on the handshake for them.
		if (planStore.tier === 'premium') {
			await waitForBridgeSettled();
		}
		const desired = { plan: planStore.tier, bridgeConnected: bridgeStore.state === 'connected' };
		const kind = chooseEngineKind(desired);
		const engine = await createEngine(desired);
		attachEngineCallbacks(engine);
		player = engine;
		currentEngineKind = kind;
		store.attachEngine(engine);
	}

	onMount(async () => {
		await buildEngine();

		await store.loadSong(songId);
		if (store.currentSong) {
			await loadSongIntoPlayer();
		}
	});

	onDestroy(() => {
		store.attachEngine(null);
		player?.dispose();
		player = null;
	});

	// Reload player when song changes
	let lastSongJson = $state('');
	$effect(() => {
		const song = store.currentSong;
		if (!song || !player) return;
		const json = JSON.stringify({ chords: song.chordProgression, tracks: song.tracks, bpm: song.bpm, ts: song.timeSignature });
		if (json !== lastSongJson) {
			lastSongJson = json;
			void loadSongIntoPlayer();
		}
	});

	// Re-create engine when plan or bridge connection changes such that a different engine is needed.
	// For Phase 1 this almost never fires since planStore.tier defaults to 'free'.
	$effect(() => {
		const desired = { plan: planStore.tier, bridgeConnected: bridgeStore.state === 'connected' };
		const needed = chooseEngineKind(desired);
		if (!player || needed === currentEngineKind) return;
		const prev = player;
		player = null;
		store.attachEngine(null);
		prev.dispose();
		void (async () => {
			await buildEngine();
			if (store.currentSong) await loadSongIntoPlayer();
		})();
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
			notes: allNotes.get(t.id) ?? [],
		}));
		const ts = parseTimeSignature(store.currentSong.timeSignature);
		const midi = songToMidi(tracks, store.currentSong.bpm, ts);
		downloadMidi(midi, store.currentSong.title);
	}

	const handlePlay = async () => { await player?.play(); };
	const handlePause = () => { void player?.pause(); };

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
				<span class="meta-pill">{store.currentSong.key || 'C'}</span>
				<span class="meta-pill">{store.currentSong.bpm || 120} BPM</span>
				<span class="meta-pill">{store.currentSong.timeSignature || '4/4'}</span>
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
			<FlowEditor song={store.currentSong} {songId} onSongChange={handleSongChange} {trackNotes} {currentTime} {totalDuration} />
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
			onplay={handlePlay}
			onpause={handlePause}
			onstop={() => { void player?.stop(); }}
			onseek={(t) => { void player?.seekTo(t); }}
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
