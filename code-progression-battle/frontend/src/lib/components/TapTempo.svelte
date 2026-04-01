<script lang="ts">
	interface Props {
		bpm: number;
		onchange: (bpm: number) => void;
	}

	let { bpm, onchange }: Props = $props();

	let tapTimestamps: number[] = [];
	let isPulsing = $state(false);
	let tapCount = $state(0);

	const MAX_TAPS = 8;
	const RESET_MS = 2000;

	const handleTap = () => {
		const now = Date.now();

		if (tapTimestamps.length > 0 && now - tapTimestamps[tapTimestamps.length - 1] > RESET_MS) {
			tapTimestamps = [];
			tapCount = 0;
		}

		tapTimestamps.push(now);
		tapCount++;

		if (tapTimestamps.length > MAX_TAPS) {
			tapTimestamps = tapTimestamps.slice(-MAX_TAPS);
		}

		if (tapTimestamps.length >= 2) {
			const intervals: number[] = [];
			for (let i = 1; i < tapTimestamps.length; i++) {
				intervals.push(tapTimestamps[i] - tapTimestamps[i - 1]);
			}
			const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
			const calculated = Math.round(60000 / avg);
			const clamped = Math.max(40, Math.min(300, calculated));
			onchange(clamped);
		}

		isPulsing = true;
		setTimeout(() => { isPulsing = false; }, 100);
	};
</script>

<div class="tap-tempo">
	<input
		type="number"
		class="tap-bpm-input"
		value={bpm}
		min="40"
		max="300"
		oninput={(e) => onchange(Number(e.currentTarget.value))}
	/>
	<button
		class="tap-btn"
		class:tap-btn--pulse={isPulsing}
		onclick={handleTap}
		type="button"
	>
		TAP
	</button>
	{#if tapCount >= 2}
		<span class="tap-count">{tapCount}</span>
	{/if}
</div>

<style>
	.tap-tempo {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.tap-bpm-input {
		width: 60px;
		padding: 4px 8px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-align: center;
	}

	.tap-bpm-input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.tap-btn {
		padding: 4px 12px;
		border: 1px solid var(--accent-secondary);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--accent-secondary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.1s;
		user-select: none;
	}

	.tap-btn:hover {
		background: rgba(96, 165, 250, 0.1);
	}

	.tap-btn--pulse {
		background: rgba(96, 165, 250, 0.2);
		transform: scale(0.95);
	}

	.tap-count {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-muted);
	}
</style>
