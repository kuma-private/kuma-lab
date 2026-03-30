<script lang="ts">
	interface Props {
		startTime: string;
		endTime: string;
		canAnalyze: boolean;
		loading: boolean;
		onCaptureStart: () => void;
		onCaptureEnd: () => void;
		onAnalyze: () => void;
	}

	let {
		startTime,
		endTime,
		canAnalyze,
		loading,
		onCaptureStart,
		onCaptureEnd,
		onAnalyze
	}: Props = $props();
</script>

<div class="time-selector">
	<div class="time-buttons">
		<button class="btn btn-start" onclick={onCaptureStart}>
			<span class="btn-icon">&#9654;</span>
			Start
		</button>
		<div class="time-display">
			<span class="time">{startTime}</span>
			<span class="arrow">&rarr;</span>
			<span class="time">{endTime}</span>
		</div>
		<button class="btn btn-end" onclick={onCaptureEnd}>
			<span class="btn-icon">&#9632;</span>
			End
		</button>
	</div>
	<button class="btn btn-analyze" disabled={!canAnalyze} onclick={onAnalyze}>
		{#if loading}
			Analyzing...
		{:else}
			Analyze Chords
		{/if}
	</button>
</div>

<style>
	.time-selector {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		margin: 20px 0;
	}

	.time-buttons {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.time-display {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.2rem;
	}

	.time {
		background: #1a1a2e;
		padding: 6px 12px;
		border-radius: 6px;
		color: #e0e0e0;
		min-width: 60px;
		text-align: center;
	}

	.arrow {
		color: #666;
	}

	.btn {
		padding: 8px 20px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 6px;
		transition: opacity 0.2s;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-icon {
		font-size: 0.7rem;
	}

	.btn-start {
		background: #2563eb;
		color: white;
	}

	.btn-start:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-end {
		background: #dc2626;
		color: white;
	}

	.btn-end:hover:not(:disabled) {
		background: #b91c1c;
	}

	.btn-analyze {
		background: #16a34a;
		color: white;
		padding: 12px 32px;
		font-size: 1rem;
	}

	.btn-analyze:hover:not(:disabled) {
		background: #15803d;
	}
</style>
