<script lang="ts">
	import type { PlayerState } from '$lib/chord-player';

	let {
		playerState = 'stopped',
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
		onLoopChange,
	}: {
		playerState?: PlayerState;
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
	let isPlaying = $derived(playerState === 'playing');

	const handleProgressClick = (e: MouseEvent) => {
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		onseek?.(pct * totalDuration);
	};

	const handleProgressKeydown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			onseek?.(Math.max(0, currentTime - 5));
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			onseek?.(Math.min(totalDuration, currentTime + 5));
		}
	};

	let audioLoading = $state(false);
	let audioInitialized = $state(false);

	const handlePlayPause = () => {
		if (playerState === 'playing') {
			onpause?.();
		} else {
			if (!audioInitialized) {
				audioLoading = true;
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
		</div>

		<!-- Progress bar -->
		<div
			class="player-progress"
			role="slider"
			tabindex="0"
			aria-label="再生位置"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(progress)}
			onclick={handleProgressClick}
			onkeydown={handleProgressKeydown}
		>
			<div class="player-progress-fill" style="width: {progress}%"></div>
			<div class="player-progress-handle" style="left: {progress}%"></div>
		</div>
	</div>
</div>

<style>
	.player-dock {
		position: fixed;
		bottom: max(8px, env(safe-area-inset-bottom, 8px));
		left: 50%;
		transform: translateX(-50%);
		width: calc(100% - 16px);
		max-width: 800px;
		height: 80px;
		background: var(--player-bg);
		backdrop-filter: blur(16px);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: stretch;
		z-index: var(--z-player);
	}

	.player-controls-section {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 4px var(--space-lg);
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
		width: 36px;
		height: 36px;
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
		width: 40px;
		height: 40px;
		background: var(--accent-primary);
		color: #fff;
	}

	.player-btn--play:hover {
		background: var(--accent-warm);
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
		background: rgba(232, 168, 76, 0.2);
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

	/* Responsive */
	@media (max-width: 700px) {
		.player-dock {
			height: 64px;
		}

		.player-volume { display: none; }
		.player-chord { min-width: 36px; }
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

		.player-spacer {
			display: none;
		}

		.player-row-top {
			flex-wrap: wrap;
			gap: 4px;
		}
	}

	@media (max-width: 500px) {
		.player-progress-fill {
			background: var(--accent-primary);
		}
		.player-progress {
			height: 6px;
			border-radius: 3px;
		}
		.player-dock {
			height: auto;
		}
		.player-controls-section {
			padding: 4px var(--space-sm);
		}
		.player-row-top {
			justify-content: center;
		}
	}
</style>
