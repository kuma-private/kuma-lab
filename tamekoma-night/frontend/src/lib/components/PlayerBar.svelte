<script lang="ts">
	import type { PlayerState, VoicingMode } from '$lib/chord-player';
	import type { OscPreset } from '$lib/chord-player';
	import PianoKeyboard from './PianoKeyboard.svelte';

	let {
		playerState = 'stopped',
		currentTime = 0,
		totalDuration = 0,
		bpm = 120,
		currentChord = null,
		volume = -10,
		loop = false,
		metronome = false,
		voicingMode = 'normal' as VoicingMode,
		oscPreset = 'piano' as OscPreset,
		playingNotes = [] as string[],
		onplay,
		onpause,
		onstop,
		onseek,
		onVolumeChange,
		onLoopChange,
		onMetronomeChange,
		onVoicingModeChange,
		onOscPresetChange
	}: {
		playerState?: PlayerState;
		currentTime?: number;
		totalDuration?: number;
		bpm?: number;
		currentChord?: string | null;
		volume?: number;
		loop?: boolean;
		oscPreset?: OscPreset;
		playingNotes?: string[];
		onplay?: () => void;
		onpause?: () => void;
		onstop?: () => void;
		onseek?: (time: number) => void;
		metronome?: boolean;
		voicingMode?: VoicingMode;
		onVolumeChange?: (db: number) => void;
		onLoopChange?: (loop: boolean) => void;
		onMetronomeChange?: (on: boolean) => void;
		onVoicingModeChange?: (mode: VoicingMode) => void;
		onOscPresetChange?: (preset: OscPreset) => void;
	} = $props();

	const OSC_LABELS: Record<OscPreset, string> = {
		piano: 'Piano',
		organ: 'Organ',
		strings: 'Strings',
		synth: 'Synth',
	};

	const OSC_OPTIONS: OscPreset[] = ['piano', 'organ', 'strings', 'synth'];

	const handleOscChange = (e: Event) => {
		const val = (e.target as HTMLSelectElement).value as OscPreset;
		onOscPresetChange?.(val);
	};

	const formatTime = (seconds: number): string => {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	};

	let progress = $derived(totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0);
	let isPlaying = $derived(playerState === 'playing');

	const handleProgressClick = (e: MouseEvent) => {
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		onseek?.(pct * totalDuration);
	};

	const handlePlayPause = () => {
		if (playerState === 'playing') {
			onpause?.();
		} else {
			if (!audioInitialized) {
				audioLoading = true;
				// Clear loading state after audio starts or after timeout
				setTimeout(() => { audioLoading = false; audioInitialized = true; }, 2000);
			}
			onplay?.();
		}
	};

	// Clear loading state when playback actually starts
	$effect(() => {
		if (playerState === 'playing' && audioLoading) {
			audioLoading = false;
			audioInitialized = true;
		}
	});

	const handleVolumeInput = (e: Event) => {
		const val = Number((e.target as HTMLInputElement).value);
		onVolumeChange?.(val);
	};

	const handleLoopToggle = () => {
		onLoopChange?.(!loop);
	};

	let settingsOpen = $state(false);
	let audioLoading = $state(false);
	let audioInitialized = $state(false);

	// Chord change animation
	let chordBounce = $state(false);
	let prevChord = $state<string | null>(null);

	$effect(() => {
		if (currentChord && currentChord !== prevChord) {
			chordBounce = true;
			const timer = setTimeout(() => { chordBounce = false; }, 200);
			prevChord = currentChord;
			return () => clearTimeout(timer);
		}
		if (!currentChord) {
			prevChord = null;
		}
	});

	// Volume icon state
	let volumeIcon = $derived.by(() => {
		if (volume <= -30) return 'mute';
		if (volume <= -15) return 'low';
		return 'high';
	});

</script>

<div class="player-dock">
	<!-- Left section: Player controls -->
	<div class="player-controls-section">
		<div class="player-row-top">
			<div class="player-controls">
				<button class="player-btn" onclick={onstop} title="停止" aria-label="停止">
					<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
						<rect x="3" y="3" width="10" height="10" rx="1" />
					</svg>
				</button>

				<button class="player-btn player-btn--play" class:player-btn--loading={audioLoading} onclick={handlePlayPause} title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'} aria-label={isPlaying ? '一時停止' : '再生'} aria-busy={audioLoading}>
					{#if isPlaying}
						<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
							<rect x="4" y="3" width="4" height="14" rx="1" />
							<rect x="12" y="3" width="4" height="14" rx="1" />
						</svg>
					{:else}
						<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
							<polygon points="5,3 17,10 5,17" />
						</svg>
					{/if}
				</button>

				<button
					class="player-btn"
					class:player-btn--active={loop}
					onclick={handleLoopToggle}
					title="ループ"
					aria-label="ループ"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="17 1 21 5 17 9" />
						<path d="M3 11V9a4 4 0 0 1 4-4h14" />
						<polyline points="7 23 3 19 7 15" />
						<path d="M21 13v2a4 4 0 0 1-4 4H3" />
					</svg>
				</button>

				<button
					class="player-btn"
					class:player-btn--active={metronome}
					class:player-btn--metronome-active={metronome}
					onclick={() => onMetronomeChange?.(!metronome)}
					title="メトロノーム"
					aria-label="メトロノーム"
					style="position: relative; --beat-duration: {60 / bpm}s"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M12 2L8 22h8L12 2z" />
						<line x1="12" y1="8" x2="18" y2="4" />
					</svg>
				</button>
			</div>

			<!-- Chord + Time -->
			<div class="player-info">
				<div class="player-chord" class:player-chord--active={currentChord !== null && isPlaying}>
					{#if currentChord}
						<span class="chord-name" class:chord-name--bounce={chordBounce}>{currentChord}</span>
					{:else}
						<span class="chord-name chord-name--idle">---</span>
					{/if}
				</div>
				<div class="player-time">
					{formatTime(currentTime)} / {formatTime(totalDuration)}
				</div>
			</div>

			<div class="player-spacer"></div>

			<!-- Volume -->
			<div class="player-volume">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					{#if volumeIcon === 'mute'}
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
						<line x1="23" y1="9" x2="17" y2="15" />
						<line x1="17" y1="9" x2="23" y2="15" />
					{:else if volumeIcon === 'low'}
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
						<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
					{:else}
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
						<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
						<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
					{/if}
				</svg>
				<input
					type="range"
					class="volume-slider"
					min="-30"
					max="0"
					value={volume}
					oninput={handleVolumeInput}
					title="音量: {volume}dB"
				/>
			</div>

			<!-- Auto Voicing toggle -->
			<div class="voicing-toggle">
				<button class="voicing-btn" class:voicing-btn--active={voicingMode === 'normal'} onclick={() => onVoicingModeChange?.('normal')} title="そのまま再生">OFF</button>
				<button class="voicing-btn" class:voicing-btn--active={voicingMode === 'harmonic'} onclick={() => onVoicingModeChange?.('harmonic')} title="オートボイシング">Auto V.</button>
			</div>

			<button class="player-btn player-btn--settings" onclick={() => { settingsOpen = !settingsOpen; }} title="設定" aria-label="設定">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
			</button>

		</div>

		<!-- Progress bar (full width of controls section) -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="player-progress" onclick={handleProgressClick}>
			<div class="player-progress-fill" style="width: {progress}%"></div>
			<div class="player-progress-handle" style="left: {progress}%"></div>
		</div>
	</div>

	<!-- Divider -->
	<div class="dock-divider"></div>

	<!-- Right section: Piano keyboard -->
	<div class="piano-section">
		<PianoKeyboard {playingNotes} />
	</div>

	{#if settingsOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="psp-overlay" onclick={() => { settingsOpen = false; }}></div>
		<div class="player-settings-popover">
			<div class="psp-row psp-row--volume">
				<span class="psp-label">音量</span>
				<input type="range" class="volume-slider psp-volume-slider" min="-30" max="0" value={volume} oninput={handleVolumeInput} />
				<span class="psp-value">{volume}dB</span>
			</div>
			<div class="psp-row">
				<span class="psp-label">音色</span>
				<select class="tone-select" value={oscPreset} onchange={handleOscChange}>
					{#each OSC_OPTIONS as opt}
						<option value={opt}>{OSC_LABELS[opt]}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}
</div>

<style>
	.player-dock {
		position: fixed;
		bottom: max(8px, env(safe-area-inset-bottom, 8px));
		left: 50%;
		transform: translateX(-50%);
		width: calc(100% - 16px);
		max-width: 1200px;
		height: 80px;
		background: var(--player-bg);
		backdrop-filter: blur(16px);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: stretch;
		z-index: 50;
	}

	/* Left section: player controls */
	.player-controls-section {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 4px var(--space-md) 4px var(--space-lg);
		gap: 4px;
	}

	.player-row-top {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.player-info {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
	}

	.player-spacer {
		flex: 1;
	}

	.player-sep {
		width: 1px;
		height: 20px;
		background: var(--border-subtle);
		flex-shrink: 0;
	}

	.player-controls {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.player-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-full);
		background: var(--bg-elevated);
		color: var(--player-button);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.player-btn:hover:not(:disabled) {
		background: var(--bg-hover);
	}

	.player-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.player-btn--play {
		width: 32px;
		height: 32px;
		background: var(--accent-primary);
		color: #fff;
	}

	.player-btn--play:hover {
		background: #9374e8;
	}

	.player-btn--loading {
		animation: play-btn-pulse 0.8s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes play-btn-pulse {
		0%, 100% { opacity: 0.6; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.08); }
	}

	.player-btn--active {
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.2);
	}

	/* Current chord */
	.player-chord {
		flex-shrink: 0;
		min-width: 48px;
		text-align: center;
		padding: 0 2px;
	}

	.chord-name {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 700;
		color: var(--accent-primary);
		transition: color 0.15s, transform 0.15s;
	}

	.player-chord--active .chord-name {
		color: var(--accent-warm);
		text-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
	}

	.chord-name--bounce {
		animation: chord-pop 0.2s ease-out;
	}

	@keyframes chord-pop {
		0% { transform: scale(1); opacity: 0.6; }
		50% { transform: scale(1.2); opacity: 1; }
		100% { transform: scale(1); opacity: 1; }
	}

	.chord-name--idle {
		color: var(--text-muted);
		font-weight: 400;
		font-size: 0.85rem;
	}

	/* Progress */
	.player-progress {
		height: 8px;
		background: var(--bg-elevated);
		border-radius: 4px;
		cursor: pointer;
		position: relative;
		min-width: 80px;
	}

	.player-progress-fill {
		height: 100%;
		background: var(--player-progress);
		border-radius: 2px;
		transition: width 0.05s linear;
	}

	.player-progress-handle {
		position: absolute;
		top: 50%;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--text-primary);
		transform: translate(-50%, -50%);
		opacity: 0;
		transition: opacity 0.15s;
	}

	.player-progress:hover .player-progress-handle {
		opacity: 1;
	}

	/* Time */
	.player-time {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}

	/* Volume */
	.player-volume {
		display: flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
		color: var(--text-secondary);
	}

	.volume-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 60px;
		height: 3px;
		border-radius: 2px;
		background: var(--bg-elevated);
		outline: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.volume-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-primary);
		cursor: pointer;
		border: none;
	}

	.volume-slider::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-primary);
		cursor: pointer;
		border: none;
	}

	/* Tone selector */
	.voicing-toggle {
		display: flex;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
	}

	.voicing-btn {
		padding: 1px 8px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.65rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s;
	}

	.voicing-btn--active {
		background: var(--accent-primary);
		color: #fff;
	}

	.tone-select {
		-webkit-appearance: none;
		appearance: none;
		padding: 1px 6px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.65rem;
		cursor: pointer;
		outline: none;
		transition: all 0.15s;
	}

	.tone-select:hover {
		border-color: var(--accent-primary);
		color: var(--text-primary);
	}

	.tone-select:focus {
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
	}

	/* Metronome pulsing dot */
	.player-btn--metronome-active {
		position: relative;
	}

	.player-btn--metronome-active::after {
		content: '';
		position: absolute;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent-warm);
		top: 2px;
		right: 2px;
		animation: metronome-pulse var(--beat-duration, 0.5s) ease-in-out infinite;
	}

	@keyframes metronome-pulse {
		0%, 100% { opacity: 0.3; transform: scale(0.8); }
		50% { opacity: 1; transform: scale(1.2); }
	}

	/* Dock divider */
	.dock-divider {
		width: 1px;
		background: var(--border-subtle);
		margin: 8px 0;
		flex-shrink: 0;
	}

	/* Piano section */
	.piano-section {
		flex: 1;
		min-width: 0;
		position: relative;
		overflow: hidden;
		border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
	}

	/* Settings button */
	.player-btn--settings {
		display: flex;
	}

	/* Settings popover */
	.psp-overlay {
		position: fixed;
		inset: 0;
		z-index: 59;
	}

	.player-settings-popover {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-elevated);
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		min-width: 240px;
		z-index: 60;
	}

	.psp-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.psp-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-secondary);
		min-width: 56px;
		flex-shrink: 0;
	}

	.psp-value {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
		min-width: 36px;
		text-align: right;
	}

	.psp-row--volume {
		flex-wrap: wrap;
	}

	.psp-volume-slider {
		width: 100%;
		flex: 1;
		height: 6px;
	}

	.psp-volume-slider::-webkit-slider-thumb {
		width: 20px !important;
		height: 20px !important;
	}

	.psp-volume-slider::-moz-range-thumb {
		width: 20px !important;
		height: 20px !important;
	}

	/* Responsive */
	@media (max-width: 700px) {
		.player-dock {
			height: 64px;
		}

		.player-controls-section {
			width: auto;
			min-width: 200px;
			flex-shrink: 1;
		}

		.player-visualizer { display: none; }
		.player-volume { display: none; }
		.player-chord { min-width: 36px; }
		.voicing-btn { padding: 1px 5px; font-size: 0.6rem; }
		.chord-name { font-size: 0.85rem; }
	}

	@media (max-width: 600px) {
		.player-dock {
			left: 4px;
			right: 4px;
			transform: none;
			width: auto;
			border-radius: var(--radius-md);
		}

		.player-btn {
			width: 36px;
			height: 36px;
		}

		.player-btn--play {
			width: 40px;
			height: 40px;
		}

		.player-spacer,
		.player-sep {
			display: none;
		}

		.player-row-top {
			flex-wrap: wrap;
			gap: 4px;
		}
	}

	@media (max-width: 500px) {
		.dock-divider { display: none; }
		.player-progress-fill {
			background: var(--accent-primary);
		}
		.player-progress {
			height: 6px;
			border-radius: 3px;
		}
		.player-dock {
			height: auto;
			flex-wrap: wrap;
		}
		.player-controls-section {
			width: 100%;
			flex: none;
			padding: 4px var(--space-sm);
		}
		.player-row-top {
			justify-content: center;
		}
		.piano-section {
			width: 100%;
			flex: none;
			height: 40px;
			border-top: 1px solid var(--border-subtle);
			padding: 0;
		}
		.player-settings-popover {
			max-width: calc(100vw - 16px);
		}
	}
</style>
