<script lang="ts">
	import type { PlayerState } from '$lib/chord-player';

	let {
		state = 'stopped',
		currentTime = 0,
		totalDuration = 0,
		bpm = 120,
		onplay,
		onpause,
		onstop,
		onseek
	}: {
		state?: PlayerState;
		currentTime?: number;
		totalDuration?: number;
		bpm?: number;
		onplay?: () => void;
		onpause?: () => void;
		onstop?: () => void;
		onseek?: (time: number) => void;
	} = $props();

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	let progress = $derived(totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0);

	function handleProgressClick(e: MouseEvent) {
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		onseek?.(pct * totalDuration);
	}

	function handlePlayPause() {
		if (state === 'playing') {
			onpause?.();
		} else {
			onplay?.();
		}
	}
</script>

<div class="player-bar">
	<div class="player-controls">
		<button class="player-btn" onclick={onstop} title="Stop" disabled={state === 'stopped'}>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
				<rect x="3" y="3" width="10" height="10" rx="1" />
			</svg>
		</button>

		<button class="player-btn player-btn--play" onclick={handlePlayPause} title={state === 'playing' ? 'Pause' : 'Play'}>
			{#if state === 'playing'}
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
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="player-progress" onclick={handleProgressClick}>
		<div class="player-progress-fill" style="width: {progress}%"></div>
		<div class="player-progress-handle" style="left: {progress}%"></div>
	</div>

	<div class="player-time">
		<span>{formatTime(currentTime)}</span>
		<span class="player-time-sep">/</span>
		<span>{formatTime(totalDuration)}</span>
	</div>

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
		backdrop-filter: blur(12px);
		border-top: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		padding: 0 var(--space-lg);
		gap: var(--space-md);
		z-index: 50;
	}

	.player-controls {
		display: flex;
		align-items: center;
		gap: 8px;
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
		transition: background 0.15s;
	}

	.player-btn:hover:not(:disabled) {
		background: var(--bg-hover);
	}

	.player-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.player-btn--play {
		width: 48px;
		height: 48px;
		background: var(--accent-primary);
		color: #fff;
	}

	.player-btn--play:hover {
		background: #9374e8;
	}

	.player-progress {
		flex: 1;
		height: 6px;
		background: var(--bg-elevated);
		border-radius: 3px;
		cursor: pointer;
		position: relative;
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
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-primary);
		transform: translate(-50%, -50%);
		opacity: 0;
		transition: opacity 0.15s;
	}

	.player-progress:hover .player-progress-handle {
		opacity: 1;
	}

	.player-time {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-secondary);
		flex-shrink: 0;
		min-width: 80px;
		text-align: center;
	}

	.player-time-sep {
		color: var(--text-muted);
		margin: 0 2px;
	}

	.player-bpm {
		flex-shrink: 0;
	}
</style>
