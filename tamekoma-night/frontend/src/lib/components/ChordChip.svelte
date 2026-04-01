<script lang="ts">
	import type { ParsedChord } from '$lib/chord-parser';

	let { chord, highlight = false }: { chord: ParsedChord; highlight?: boolean } = $props();
</script>

<span
	class="chord-chip"
	class:chord-chip--highlight={highlight}
	data-root={chord.root}
>
	{chord.raw}
</span>

<style>
	.chord-chip--highlight {
		outline: 2px solid var(--accent-warm);
		outline-offset: 1px;
	}
</style>
