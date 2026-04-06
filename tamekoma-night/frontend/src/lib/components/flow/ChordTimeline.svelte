<script lang="ts">
  import { parseProgression, resolveRepeats, type ParsedBar, type BarEntry } from '$lib/chord-parser';

  let {
    chords,
    totalBars,
  }: {
    chords: string;
    totalBars: number;
  } = $props();

  let parsed = $derived(resolveRepeats(parseProgression(chords).bars));

  /** Get the bar data for a 1-based bar number, or null */
  function getBar(barNum: number): ParsedBar | undefined {
    return parsed.find(b => b.barNumber === barNum);
  }

  function rootOf(entry: BarEntry): string | null {
    return entry.type === 'chord' ? entry.chord.root : null;
  }

  function displayText(entry: BarEntry): string {
    switch (entry.type) {
      case 'chord': return entry.chord.raw;
      case 'repeat': return '%';
      case 'rest': return '_';
      case 'sustain': return '=';
    }
  }
</script>

<div class="chord-timeline" style:grid-template-columns="repeat({totalBars}, 1fr)">
  {#each Array.from({ length: totalBars }, (_, i) => i + 1) as barNum}
    {@const bar = getBar(barNum)}
    <div class="chord-cell">
      <span class="bar-number">{barNum}</span>
      <div class="chord-entries">
        {#if bar}
          {#each bar.entries as entry}
            {@const root = rootOf(entry)}
            {#if root}
              <span class="chord-chip" data-root={root}>{displayText(entry)}</span>
            {:else}
              <span class="chord-special">{displayText(entry)}</span>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .chord-timeline {
    display: grid;
    gap: 0;
    padding: 0 2px;
  }

  .chord-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    border-right: 1px solid var(--border-subtle);
    padding: 2px 3px;
  }

  .chord-cell:last-child {
    border-right: none;
  }

  .bar-number {
    position: absolute;
    top: 1px;
    left: 3px;
    font-size: 0.6rem;
    color: var(--text-muted);
    font-family: var(--font-sans);
    opacity: 0.7;
  }

  .chord-entries {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Compact chord chip for timeline (smaller than the standalone ChordChip) */
  .chord-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.68rem;
    white-space: nowrap;
    cursor: default;
  }

  .chord-special {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-muted);
  }
</style>
