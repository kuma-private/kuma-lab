<script lang="ts">
	import type { PlayerState } from '$lib/chord-player';

	let {
		state = 'stopped',
		currentTime = 0,
		totalDuration = 0,
		bpm = 120,
		currentChord = null,
		volume = -10,
		loop = false,
		onplay,
		onpause,
		onstop,
		onseek,
		onVolumeChange,
		onLoopChange
	}: {
		state?: PlayerState;
		currentTime?: number;
		totalDuration?: number;
		bpm?: number;
		currentChord?: string | null;
		volume?: number;
		loop?: boolean;
		onplay?: () => void;
		onpause?: () => void;
		onstop?: () => void;
		onseek?: (time: number) => void;
		onVolumeChange?: (db: number) => void;
		onLoopChange?: (loop: boolean) => void;
	} = $props();

	const formatTime = (seconds: number): string => {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	};

	let progress = $derived(totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0);
	let isPlaying = $derived(state === 'playing');

	const handleProgressClick = (e: MouseEvent) => {
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		onseek?.(pct * totalDuration);
	};

	const handlePlayPause = () => {
		if (state === 'playing') {
			onpause?.();
		} else {
			onplay?.();
		}
	};

	const handleVolumeInput = (e: Event) => {
		const val = Number((e.target as HTMLInputElement).value);
		onVolumeChange?.(val);
	};

	const handleLoopToggle = () => {
		onLoopChange?.(!loop);
	};

	// Volume icon state
	let volumeIcon = $derived.by(() => {
		if (volume <= -30) return 'mute';
		if (volume <= -15) return 'low';
		return 'high';
	});

	// Visualizer bar heights (CSS-animated random heights while playing)
	const barCount = 8;
</script>

<div class="player-bar">
	<!-- Left section: controls -->
	<div class="player-controls">
		<button class="player-btn" onclick={onstop} title="Stop" disabled={state === 'stopped'}>
			<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
				<rect x="3" y="3" width="10" height="10" rx="1" />
			</svg>
		</button>

		<button class="player-btn player-btn--play" onclick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
			{#if isPlaying}
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<rect x="4" y="3" width="4" height="14" rx="1" />
					<rect x="12" y="3" width="4" height="14" rx="1" />
				</svg>
			{:else}
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<polygon points="5,3 17,10 5,17" />
				</svg>
			{/if}
		</button>

		<button
			class="player-btn"
			class:player-btn--active={loop}
			onclick={handleLoopToggle}
			title="ループ"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="17 1 21 5 17 9" />
				<path d="M3 11V9a4 4 0 0 1 4-4h14" />
				<polyline points="7 23 3 19 7 15" />
				<path d="M21 13v2a4 4 0 0 1-4 4H3" />
			</svg>
		</button>
	</div>

	<!-- Visualizer -->
	<div class="player-visualizer" class:playing={isPlaying}>
		{#each Array(barCount) as _, i}
			<div
				class="viz-bar"
				style="animation-delay: {i * 0.08}s;"
			></div>
		{/each}
	</div>

	<!-- Current chord display -->
	<div class="player-chord" class:player-chord--active={currentChord !== null && isPlaying}>
		{#if currentChord}
			<span class="chord-name">{currentChord}</span>
		{:else}
			<span class="chord-name chord-name--idle">---</span>
		{/if}
	</div>

	<!-- Progress bar -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="player-progress" onclick={handleProgressClick}>
		<div class="player-progress-fill" style="width: {progress}%"></div>
		<div class="player-progress-handle" style="left: {progress}%"></div>
	</div>

	<!-- Time display -->
	<div class="player-time">
		<span>{formatTime(currentTime)}</span>
		<span class="player-time-sep">/</span>
		<span>{formatTime(totalDuration)}</span>
	</div>

	<!-- Volume -->
	<div class="player-volume">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

	<!-- BPM badge -->
	<div class="player-bpm">
		<span class="badge">BPM {bpm}</span>
	</div>
</div>

<style>
	.player-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: var(--player-height);
		background: var(--player-bg);
		backdrop-filter: blur(16px);
		border-top: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		padding: 0 var(--space-lg);
		gap: var(--space-sm);
		z-index: 50;
	}

	.player-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.player-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
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
		width: 44px;
		height: 44px;
		background: var(--accent-primary);
		color: #fff;
	}

	.player-btn--play:hover {
		background: #9374e8;
	}

	.player-btn--active {
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.2);
	}

	/* Visualizer */
	.player-visualizer {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 32px;
		flex-shrink: 0;
		padding: 0 4px;
	}

	.viz-bar {
		width: 3px;
		height: 4px;
		border-radius: 1.5px;
		background: var(--accent-primary);
		opacity: 0.3;
		transition: height 0.1s;
	}

	.playing .viz-bar {
		animation: viz-bounce 0.8s ease-in-out infinite alternate;
		opacity: 0.8;
	}

	@keyframes viz-bounce {
		0% { height: 4px; }
		100% { height: 28px; }
	}

	.playing .viz-bar:nth-child(1) { animation-duration: 0.6s; }
	.playing .viz-bar:nth-child(2) { animation-duration: 0.75s; }
	.playing .viz-bar:nth-child(3) { animation-duration: 0.5s; }
	.playing .viz-bar:nth-child(4) { animation-duration: 0.85s; }
	.playing .viz-bar:nth-child(5) { animation-duration: 0.55s; }
	.playing .viz-bar:nth-child(6) { animation-duration: 0.7s; }
	.playing .viz-bar:nth-child(7) { animation-duration: 0.65s; }
	.playing .viz-bar:nth-child(8) { animation-duration: 0.8s; }

	/* Current chord */
	.player-chord {
		flex-shrink: 0;
		min-width: 64px;
		text-align: center;
		padding: 0 var(--space-sm);
	}

	.chord-name {
		font-family: var(--font-mono);
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--accent-primary);
		transition: color 0.15s, transform 0.15s;
	}

	.player-chord--active .chord-name {
		color: var(--accent-warm);
		text-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
	}

	.chord-name--idle {
		color: var(--text-muted);
		font-weight: 400;
		font-size: 1rem;
	}

	/* Progress */
	.player-progress {
		flex: 1;
		height: 6px;
		background: var(--bg-elevated);
		border-radius: 3px;
		cursor: pointer;
		position: relative;
		min-width: 80px;
	}

	.player-progress-fill {
		height: 100%;
		background: var(--player-progress);
		border-radius: 3px;
		transition: width 0.05s linear;
	}

	.player-progress-handle {
		position: absolute;
		top: 50%;
		width: 12px;
		height: 12px;
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
		font-size: 0.75rem;
		color: var(--text-secondary);
		flex-shrink: 0;
		min-width: 72px;
		text-align: center;
	}

	.player-time-sep {
		color: var(--text-muted);
		margin: 0 1px;
	}

	/* Volume */
	.player-volume {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		color: var(--text-secondary);
	}

	.volume-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 60px;
		height: 4px;
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
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--text-primary);
		cursor: pointer;
		border: none;
	}

	.volume-slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--text-primary);
		cursor: pointer;
		border: none;
	}

	/* BPM */
	.player-bpm {
		flex-shrink: 0;
	}

	/* Responsive: hide some elements on narrow screens */
	@media (max-width: 700px) {
		.player-visualizer { display: none; }
		.player-volume { display: none; }
		.player-chord { min-width: 48px; }
		.chord-name { font-size: 1rem; }
	}
</style>
