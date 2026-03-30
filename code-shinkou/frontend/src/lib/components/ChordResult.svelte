<script lang="ts">
	import type { AnalysisResult } from '$lib/api';

	interface Props {
		result: AnalysisResult;
		videoId: string;
		startTime: number;
	}

	let { result, videoId, startTime }: Props = $props();

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	const youtubeLink = $derived(
		`https://youtube.com/watch?v=${videoId}&t=${Math.floor(startTime)}`
	);
</script>

<div class="result">
	<div class="key-display">
		Key: <strong>{result.key.root} {result.key.mode}</strong>
	</div>

	<div class="chord-grid">
		{#each result.chords as chord}
			<div class="chord-cell">
				<div class="degree">{chord.degree}</div>
				<div class="chord-name">{chord.chord}</div>
				<div class="timing">{formatTime(chord.start)}</div>
			</div>
		{/each}
	</div>

	<a class="source-link" href={youtubeLink} target="_blank" rel="noopener">
		Open in YouTube ({formatTime(startTime)}~)
	</a>
</div>

<style>
	.result {
		max-width: 640px;
		margin: 24px auto;
	}

	.key-display {
		text-align: center;
		font-size: 1.2rem;
		margin-bottom: 16px;
		color: #e0e0e0;
	}

	.key-display strong {
		color: #fbbf24;
		font-family: 'JetBrains Mono', monospace;
	}

	.chord-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
	}

	.chord-cell {
		background: #1a1a2e;
		border: 1px solid #2a2a4a;
		border-radius: 8px;
		padding: 12px 16px;
		min-width: 70px;
		text-align: center;
	}

	.degree {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.1rem;
		font-weight: 700;
		color: #60a5fa;
		margin-bottom: 4px;
	}

	.chord-name {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.95rem;
		color: #e0e0e0;
	}

	.timing {
		font-size: 0.7rem;
		color: #666;
		margin-top: 4px;
	}

	.source-link {
		display: block;
		text-align: center;
		margin-top: 20px;
		color: #60a5fa;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.source-link:hover {
		text-decoration: underline;
	}
</style>
