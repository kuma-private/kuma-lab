<script lang="ts">
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte';
	import TimeSelector from '$lib/components/TimeSelector.svelte';
	import ChordResult from '$lib/components/ChordResult.svelte';
	import { createAnalyzerStore } from '$lib/stores/analyzer.svelte';

	const store = createAnalyzerStore();

	function getPlayerTime(): number {
		const p = (window as any).__codeShinkou_player as YT.Player | undefined;
		return p?.getCurrentTime() ?? 0;
	}

	function handleCaptureStart() {
		store.setStartTime(getPlayerTime());
	}

	function handleCaptureEnd() {
		store.setEndTime(getPlayerTime());
	}
</script>

<svelte:head>
	<title>Code Shinkou - Chord Analyzer</title>
</svelte:head>

<main>
	<h1>Code Shinkou</h1>
	<p class="subtitle">YouTube chord progression analyzer</p>

	<div class="url-input">
		<input
			type="text"
			placeholder="YouTube URL to paste..."
			value={store.url}
			oninput={(e) => (store.url = e.currentTarget.value)}
		/>
	</div>

	{#if store.videoId}
		<YouTubePlayer videoId={store.videoId} />

		<TimeSelector
			startTime={store.startTimeFormatted}
			endTime={store.endTimeFormatted}
			canAnalyze={store.canAnalyze}
			loading={store.loading}
			onCaptureStart={handleCaptureStart}
			onCaptureEnd={handleCaptureEnd}
			onAnalyze={() => store.analyze()}
		/>
	{/if}

	{#if store.error}
		<div class="error">{store.error}</div>
	{/if}

	{#if store.result && store.videoId && store.startTime !== null}
		<ChordResult
			result={store.result}
			videoId={store.videoId}
			startTime={store.startTime}
		/>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0a0a1a;
		color: #e0e0e0;
		font-family: 'Inter', sans-serif;
	}

	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 40px 20px;
	}

	h1 {
		text-align: center;
		font-size: 2rem;
		margin: 0;
		color: #fbbf24;
	}

	.subtitle {
		text-align: center;
		color: #666;
		margin: 4px 0 32px;
		font-size: 0.9rem;
	}

	.url-input {
		margin-bottom: 24px;
	}

	.url-input input {
		width: 100%;
		padding: 12px 16px;
		border: 1px solid #2a2a4a;
		border-radius: 8px;
		background: #1a1a2e;
		color: #e0e0e0;
		font-size: 1rem;
		font-family: 'JetBrains Mono', monospace;
		box-sizing: border-box;
		outline: none;
		transition: border-color 0.2s;
	}

	.url-input input:focus {
		border-color: #60a5fa;
	}

	.url-input input::placeholder {
		color: #555;
	}

	.error {
		text-align: center;
		color: #f87171;
		margin: 16px 0;
		padding: 12px;
		background: #1a0a0a;
		border: 1px solid #7f1d1d;
		border-radius: 8px;
	}
</style>
