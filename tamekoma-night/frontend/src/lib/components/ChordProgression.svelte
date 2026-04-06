<script lang="ts">
	import { parseProgression, type ParsedBar } from '$lib/chord-parser';
	import ChordChip from './ChordChip.svelte';

	let {
		chords,
		activeBarIndex = -1
	}: {
		chords: string;
		activeBarIndex?: number;
	} = $props();

	let parsed = $derived(parseProgression(chords));
</script>

<div class="chord-progression">
	{#each parsed.bars as bar, barIdx}
		<div class="measure-bar"></div>
		<div class="measure" class:measure--active={barIdx === activeBarIndex}>
			<span class="measure-label">{bar.barNumber}</span>
			{#each bar.entries as entry}
				{#if entry.type === 'chord'}
					<ChordChip chord={entry.chord} />
				{:else if entry.type === 'repeat'}
					<span class="special-token">%</span>
				{:else if entry.type === 'rest'}
					<span class="special-token">_</span>
				{:else if entry.type === 'sustain'}
					<span class="special-token">=</span>
				{/if}
			{/each}
		</div>
	{/each}
	{#if parsed.bars.length > 0}
		<div class="measure-bar"></div>
	{/if}
</div>

<style>
	.chord-progression {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		padding: 8px 0;
	}

	.measure-bar {
		width: 2px;
		height: 36px;
		background: var(--border-subtle);
		flex-shrink: 0;
	}

	.measure {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-radius: 4px;
		position: relative;
		transition: background 0.15s;
	}

	.measure--active {
		background: rgba(232, 168, 76, 0.1);
	}

	.measure-label {
		position: absolute;
		top: -14px;
		left: 4px;
		font-size: 0.65rem;
		color: var(--text-muted);
		font-family: var(--font-sans);
	}

	.special-token {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
		padding: 4px 8px;
		border-radius: 6px;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 0.9rem;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px dashed var(--border-subtle);
	}
</style>
