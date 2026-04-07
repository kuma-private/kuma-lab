<script lang="ts">
  import { parseProgression, resolveRepeats, type ParsedBar, type BarEntry } from '$lib/chord-parser';
  import { chordToDegree } from '$lib/chord-degree';

  let {
    chords,
    totalBars,
    musicalKey = 'C Major',
    onBarClick,
    onBarSeek,
    selectedRange = null,
    onRangeSelect,
  }: {
    chords: string;
    totalBars: number;
    musicalKey?: string;
    onBarClick?: (barNumber: number) => void;
    onBarSeek?: (barNumber: number) => void;
    selectedRange?: { startBar: number; endBar: number } | null;
    onRangeSelect?: (startBar: number, endBar: number) => void;
  } = $props();

  // --- Drag selection state ---
  let isSelecting = $state(false);
  let dragStartBar = $state<number | null>(null);
  let dragCurrentBar = $state<number | null>(null);

  let dragRange = $derived.by(() => {
    if (dragStartBar === null || dragCurrentBar === null) return null;
    const lo = Math.min(dragStartBar, dragCurrentBar);
    const hi = Math.max(dragStartBar, dragCurrentBar);
    return { startBar: lo, endBar: hi };
  });

  /** Effective highlight range: drag in progress, or committed selection */
  let highlightRange = $derived(dragRange ?? selectedRange);

  function isBarHighlighted(barNum: number): boolean {
    if (!highlightRange) return false;
    return barNum >= highlightRange.startBar && barNum <= highlightRange.endBar;
  }

  function handleMouseDown(barNum: number, e: MouseEvent) {
    // Only primary button
    if (e.button !== 0) return;
    e.preventDefault();
    isSelecting = true;
    dragStartBar = barNum;
    dragCurrentBar = barNum;

    const handleMouseMove = (me: MouseEvent) => {
      if (!isSelecting) return;
      // Find which bar the mouse is over by checking the timeline grid
      const timeline = (e.target as HTMLElement).closest('.chord-timeline') as HTMLElement | null;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const relX = me.clientX - rect.left;
      const barWidth = rect.width / totalBars;
      const bar = Math.max(1, Math.min(totalBars, Math.floor(relX / barWidth) + 1));
      dragCurrentBar = bar;
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!isSelecting || dragStartBar === null || dragCurrentBar === null) {
        isSelecting = false;
        dragStartBar = null;
        dragCurrentBar = null;
        return;
      }
      const lo = Math.min(dragStartBar, dragCurrentBar);
      const hi = Math.max(dragStartBar, dragCurrentBar);
      isSelecting = false;
      dragStartBar = null;
      dragCurrentBar = null;

      if (lo === hi) {
        // Single click — seek playback to this bar
        onBarSeek?.(lo);
      } else {
        // Range selection
        onRangeSelect?.(lo, hi);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

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
      case 'rest': return '';
      case 'sustain': return '';
    }
  }

  function degreeOf(entry: BarEntry): string | null {
    if (entry.type !== 'chord') return null;
    return chordToDegree(entry.chord.raw, musicalKey);
  }

  /** Merge sustain entries into previous chord, tracking flex weight */
  interface DisplayChord { text: string; root: string; degree: string | null; weight: number }

  function resolveDisplay(entries: BarEntry[]): DisplayChord[] {
    const result: DisplayChord[] = [];
    for (const entry of entries) {
      if (entry.type === 'chord') {
        const root = entry.chord.root;
        const degree = chordToDegree(entry.chord.raw, musicalKey);
        result.push({ text: entry.chord.raw, root, degree, weight: 1 });
      } else if (entry.type === 'sustain' && result.length > 0) {
        // Merge into previous chord — increase its weight
        result[result.length - 1].weight += 1;
      } else if (entry.type === 'repeat' && result.length > 0) {
        // Show as separate chord with same content
        const prev = result[result.length - 1];
        result.push({ text: prev.text, root: prev.root, degree: prev.degree, weight: 1 });
      } else if (entry.type === 'rest') {
        // Skip rests in display
      }
    }
    return result;
  }
</script>

<div class="chord-timeline" style:grid-template-columns="repeat({totalBars}, minmax(0, 140px))">
  {#each Array.from({ length: totalBars }, (_, i) => i + 1) as barNum}
    {@const bar = getBar(barNum)}
    <div class="chord-cell" class:chord-cell--clickable={!!onBarClick || !!onBarSeek || !!onRangeSelect} class:chord-cell--selected={isBarHighlighted(barNum)} onmousedown={(e) => handleMouseDown(barNum, e)} ondblclick={() => onBarClick?.(barNum)} role={onBarClick || onBarSeek || onRangeSelect ? 'button' : undefined} tabindex={onBarClick || onBarSeek || onRangeSelect ? 0 : undefined} onkeydown={(e) => { if (onBarClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onBarClick(barNum); } }}>
      <span class="bar-number">{barNum}</span>
      <div class="chord-entries">
        {#if bar}
          {#each resolveDisplay(bar.entries) as item}
            <div class="chord-entry" style="flex-grow: {item.weight}; flex-basis: 0; min-width: 0;">
              <span class="chord-degree">{item.degree ?? ''}</span>
              <span class="chord-chip" data-root={item.root}>{item.text}</span>
            </div>
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
    justify-content: center;
    min-height: 44px;
    border-left: 1px solid rgba(138, 126, 104, 0.4);
    padding: 2px 2px;
    padding-top: 12px;
    overflow: hidden;
  }

  .chord-cell--clickable {
    cursor: pointer;
  }
  .chord-cell--clickable:hover {
    background: rgba(232, 168, 76, 0.06);
  }

  .chord-cell--selected {
    background: rgba(232, 168, 76, 0.12);
    outline: 2px solid rgba(232, 168, 76, 0.4);
    outline-offset: -2px;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 0;
    overflow: hidden;
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
    box-sizing: border-box;
    min-width: 0;
    overflow: hidden;
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
