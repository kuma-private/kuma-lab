<script lang="ts">
	interface Props {
		chords: string;
	}

	let { chords }: Props = $props();

	function extractRoot(chord: string): string {
		if (!chord || chord === '%' || chord === '_' || chord === '=') return '';
		const match = chord.match(/^([A-G][#b]?)/);
		return match ? match[1] : '';
	}

	function parseBars(input: string): string[][] {
		return input
			.split('|')
			.map(bar => bar.trim())
			.filter(bar => bar.length > 0)
			.map(bar => bar.split(/\s+/).filter(c => c.length > 0));
	}

	const bars = $derived(parseBars(chords));
</script>

<div class="chord-progression">
	<span class="measure-bar"></span>
	{#each bars as bar, i}
		<span class="measure">
			{#each bar as chord}
				{#if chord === '%' || chord === '_' || chord === '='}
					<span class="chord-chip chord-special">{chord}</span>
				{:else}
					<span class="chord-chip" data-root={extractRoot(chord)}>{chord}</span>
				{/if}
			{/each}
		</span>
		<span class="measure-bar"></span>
	{/each}
</div>

<style>
	.chord-special {
		background: var(--bg-elevated) !important;
		color: var(--text-muted) !important;
		border-color: var(--border-subtle) !important;
	}
</style>
