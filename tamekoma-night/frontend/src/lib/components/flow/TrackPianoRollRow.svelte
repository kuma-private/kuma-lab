<script lang="ts">
  import type { MidiNote } from '$lib/types/song';
  import { onMount } from 'svelte';

  interface Props {
    notes: MidiNote[];
    totalBars: number;
    bpm: number;
    timeSignature: string;
    color: string;
  }

  let { notes, totalBars, bpm, timeSignature, color }: Props = $props();

  let canvas: HTMLCanvasElement;

  const TICKS_PER_QUARTER = 480;

  function parseTimeSig(): { beats: number; beatValue: number } {
    const parts = timeSignature.split('/');
    if (parts.length === 2) {
      const beats = Number(parts[0]);
      const beatValue = Number(parts[1]);
      if (beats > 0 && beatValue > 0) return { beats, beatValue };
    }
    return { beats: 4, beatValue: 4 };
  }

  function draw() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (notes.length === 0) return;

    const { beats, beatValue } = parseTimeSig();
    const ticksPerBeat = TICKS_PER_QUARTER * (4 / beatValue);
    const ticksPerBar = ticksPerBeat * beats;
    const totalTicks = totalBars * ticksPerBar;
    const pxPerTick = w / totalTicks;

    let minMidi = 127, maxMidi = 0;
    for (const n of notes) {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    }
    const pad = 2;
    const midiRange = Math.max(maxMidi - minMidi + 1, 6) + pad * 2;
    const effectiveMin = minMidi - pad;

    // Draw notes
    ctx.fillStyle = color;
    const noteH = Math.max(2, Math.round(h / midiRange));
    for (const n of notes) {
      const x = Math.round(n.startTick * pxPerTick);
      const nw = Math.max(2, Math.round(n.durationTicks * pxPerTick) - 1);
      const row = (n.midi - effectiveMin) / midiRange;
      const y = Math.round(h - row * h - noteH);
      const alpha = 0.5 + (n.velocity / 127) * 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, nw, noteH);
    }
    ctx.globalAlpha = 1;
  }

  $effect(() => {
    void notes;
    void totalBars;
    void color;
    requestAnimationFrame(() => draw());
  });

  onMount(() => {
    const observer = new ResizeObserver(() => draw());
    if (canvas) observer.observe(canvas);
    requestAnimationFrame(() => requestAnimationFrame(() => draw()));
    return () => observer.disconnect();
  });
</script>

<!-- Grid matches FlowTrackRow: same columns, canvas spans all -->
<div
  class="roll-grid"
  style:grid-template-columns="repeat({totalBars}, minmax(0, 140px))"
>
  <div class="roll-canvas-wrapper" style:grid-column="1 / {totalBars + 1}">
    <canvas class="roll-canvas" bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .roll-grid {
    display: grid;
    gap: 0;
    padding: 0 2px;
  }
  .roll-canvas-wrapper {
    height: 48px;
    grid-row: 1;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    overflow: hidden;
  }
  .roll-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
