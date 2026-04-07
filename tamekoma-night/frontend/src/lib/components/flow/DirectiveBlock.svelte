<script lang="ts">
  import type { DirectiveBlock } from '$lib/types/song';
  import { onMount, tick } from 'svelte';

  const TRACK_COLORS: Record<string, { bg: string; border: string; text: string; note: string }> = {
    piano:   { bg: 'rgba(184,160,240,0.10)', border: 'rgba(184,160,240,0.15)', text: '#a898c8', note: '#b8a0f0' },
    bass:    { bg: 'rgba(124,184,130,0.08)', border: 'rgba(124,184,130,0.12)', text: '#88b090', note: '#7cb882' },
    drums:   { bg: 'rgba(232,168,76,0.10)',  border: 'rgba(232,168,76,0.15)',  text: '#c8a060', note: '#e8a84c' },
    strings: { bg: 'rgba(110,168,208,0.08)', border: 'rgba(110,168,208,0.12)', text: '#80a0b8', note: '#6ea8d0' },
    guitar:  { bg: 'rgba(240,192,96,0.08)',  border: 'rgba(240,192,96,0.12)',  text: '#c0a860', note: '#f0c060' },
    organ:   { bg: 'rgba(224,96,80,0.08)',   border: 'rgba(224,96,80,0.12)',   text: '#c08878', note: '#e06050' },
  };

  const DEFAULT_COLOR = { bg: 'rgba(160,160,180,0.06)', border: 'rgba(160,160,180,0.12)', text: '#908888', note: '#a09090' };

  let {
    block,
    trackColor = 'piano',
    onClick,
  }: {
    block: DirectiveBlock;
    trackColor?: string;
    onClick: () => void;
  } = $props();

  let colors = $derived(TRACK_COLORS[trackColor] ?? DEFAULT_COLOR);
  let hasNotes = $derived(!!block.generatedMidi?.notes?.length);
  let isEmpty = $derived(!hasNotes);

  let miniCanvas: HTMLCanvasElement;

  function drawMiniRoll() {
    if (!miniCanvas || !block.generatedMidi?.notes?.length) return;
    const notes = block.generatedMidi.notes;
    const parent = miniCanvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    miniCanvas.width = w * dpr;
    miniCanvas.height = h * dpr;
    const ctx = miniCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Compute ranges
    let minMidi = 127, maxMidi = 0, maxTick = 0;
    for (const n of notes) {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
      const end = n.startTick + n.durationTicks;
      if (end > maxTick) maxTick = end;
    }
    if (maxTick === 0) return;
    const midiRange = Math.max(maxMidi - minMidi + 1, 12);
    const padMidi = 2;
    const effectiveMin = minMidi - padMidi;
    const effectiveRange = midiRange + padMidi * 2;

    const noteColor = colors.note;
    ctx.fillStyle = noteColor;
    ctx.globalAlpha = 0.8;

    for (const n of notes) {
      const x = (n.startTick / maxTick) * w;
      const nw = Math.max(1, (n.durationTicks / maxTick) * w);
      const y = h - ((n.midi - effectiveMin + 1) / effectiveRange) * h;
      const nh = Math.max(1, h / effectiveRange);
      ctx.fillRect(x, y, nw - 0.5, nh - 0.5);
    }
    ctx.globalAlpha = 1;
  }

  $effect(() => {
    void block.generatedMidi;
    void colors;
    requestAnimationFrame(() => drawMiniRoll());
  });

  onMount(() => {
    const observer = new ResizeObserver(() => drawMiniRoll());
    if (miniCanvas?.parentElement) observer.observe(miniCanvas.parentElement);
    requestAnimationFrame(() => drawMiniRoll());
    return () => observer.disconnect();
  });

  function handleMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      e.stopPropagation();
      return;
    }
    onClick();
  }
</script>

<div
  class="directive-block"
  class:directive-block--empty={isEmpty}
  role="button"
  tabindex="0"
  style:background={colors.bg}
  style:border-color={colors.border}
  style:color={colors.text}
  style:grid-column="{block.startBar + 1} / {block.endBar + 1}"
  onmousedown={handleMouseDown}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
>
  {#if hasNotes}
    <div class="block-content-with-roll">
      <span class="block-summary block-summary--ai">
        {block.generatedMidi?.style || 'AI generated'}
      </span>
      <div class="mini-roll-container">
        <canvas class="mini-roll-canvas" bind:this={miniCanvas}></canvas>
      </div>
    </div>
  {:else}
    <span class="block-summary block-summary--empty">
      <span class="empty-icon">+</span> AI生成
    </span>
  {/if}
  <div class="resize-handle" style:background={colors.border}></div>
</div>

<style>
  .directive-block {
    position: relative;
    display: flex;
    align-items: stretch;
    border: 1px solid;
    border-radius: 6px;
    padding: 2px 8px;
    min-height: 28px;
    cursor: pointer;
    overflow: hidden;
    transition: filter 0.15s;
    user-select: none;
  }

  .directive-block--empty {
    border-style: dashed;
    opacity: 0.7;
    transition: all 0.15s;
  }

  .directive-block--empty:hover {
    opacity: 1;
    border-color: var(--accent-primary);
    background: rgba(232, 168, 76, 0.06) !important;
  }

  .directive-block:hover {
    filter: brightness(1.15);
  }

  .block-summary--ai {
    font-style: italic;
    opacity: 0.9;
  }

  .block-summary--empty {
    font-style: italic;
    color: var(--text-muted);
    opacity: 0.6;
    display: inline-flex;
    align-items: center;
  }

  .empty-icon {
    display: inline-flex;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid currentColor;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    margin-right: 4px;
  }

  .block-content-with-roll {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 2px;
    min-width: 0;
  }

  .mini-roll-container {
    flex: 1;
    min-height: 32px;
    border-radius: 3px;
    overflow: hidden;
  }

  .mini-roll-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: ew-resize;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .directive-block:hover .resize-handle {
    opacity: 0.6;
  }
</style>
