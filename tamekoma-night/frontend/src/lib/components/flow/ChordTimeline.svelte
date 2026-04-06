<script lang="ts">
  import { parseProgression, resolveRepeats, type ParsedBar, type BarEntry } from '$lib/chord-parser';
  import { chordToDegree } from '$lib/chord-degree';

  let {
    chords,
    totalBars,
    musicalKey = 'C Major',
  }: {
    chords: string;
    totalBars: number;
    musicalKey?: string;
  } = $props();

  let parsed = $derived(resolveRepeats(parseProgression(chords).bars));

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
      case 'sustain': return '\u2500';
    }
  }

  function degreeOf(entry: BarEntry): string | null {
    if (entry.type !== 'chord') return null;
    return chordToDegree(entry.chord.raw, musicalKey);
  }
</script>

<div class="chord-timeline" style:grid-template-columns="repeat({totalBars}, minmax(0, 1fr))">
  {#each Array.from({ length: totalBars }, (_, i) => i + 1) as barNum}
    {@const bar = getBar(barNum)}
    <div class="chord-cell">
      <span class="bar-number">{barNum}</span>
      <div class="chord-entries">
        {#if bar}
          {#each bar.entries as entry}
            {@const root = rootOf(entry)}
            {@const degree = degreeOf(entry)}
            {#if root}
              <div class="chord-entry">
                {#if degree}
                  <span class="chord-degree">{degree}</span>
                {/if}
                <span class="chord-chip" data-root={root}>{displayText(entry)}</span>
              </div>
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
    padding: 0;
  }

  .chord-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 44px;
    border-left: 1px solid rgba(138, 126, 104, 0.4);
    padding: 2px 4px;
    padding-top: 12px;
  }

  .chord-cell:first-child {
    border-left: none;
  }

  .bar-number {
    position: absolute;
    top: 1px;
    left: 3px;
    font-size: 0.5rem;
    color: var(--text-muted);
    opacity: 0.4;
    font-family: var(--font-sans);
  }

  .chord-entries {
    display: flex;
    align-items: stretch;
    gap: 2px;
    width: 100%;
  }

  .chord-entry {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 0;
  }

  .chord-degree {
    font-size: 0.5rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
    line-height: 1;
    opacity: 0.7;
  }

  .chord-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 2px 4px;
    border-radius: 4px;
    border: none;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.65rem;
    white-space: nowrap;
    cursor: default;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chord-special {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--text-muted);
    opacity: 0.4;
  }
</style>
