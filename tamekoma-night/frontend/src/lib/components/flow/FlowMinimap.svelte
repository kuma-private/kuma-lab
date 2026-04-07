<script lang="ts">
  import type { Song } from '$lib/types/song';
  import { onMount } from 'svelte';

  interface Props {
    song: Song;
    totalBars: number;
  }

  let { song, totalBars }: Props = $props();

  let canvas: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let isDragging = $state(false);

  // Find scroll container from DOM (sibling .flow-content)
  function getScrollContainer(): HTMLElement | null {
    return containerEl?.parentElement?.querySelector('.flow-content') as HTMLElement | null;
  }

  const SECTION_COLORS: Record<string, string> = {
    A: '#c8a070', B: '#90a8b8', C: '#90b890', D: '#c8b060',
    Chorus: '#c88878', Verse: '#a098b0', Bridge: '#80b0a0',
    Intro: '#908880', Outro: '#908880',
  };

  const INSTRUMENT_COLORS: Record<string, string> = {
    piano: 'rgba(184,160,240,0.5)',
    bass: 'rgba(124,184,130,0.5)',
    drums: 'rgba(232,168,76,0.5)',
    strings: 'rgba(110,168,208,0.5)',
    guitar: 'rgba(240,192,96,0.5)',
    organ: 'rgba(224,96,80,0.5)',
  };

  const DEFAULT_INSTRUMENT_COLOR = 'rgba(138,126,104,0.4)';
  const DEFAULT_SECTION_COLOR = '#a78bfa';

  function draw() {
    if (!canvas) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    const pxPerBar = w / totalBars;
    const sectionRowH = 6;
    const trackRowH = Math.min(8, (h - sectionRowH) / Math.max(song.tracks.length, 1));

    // Draw sections
    for (const sec of song.sections) {
      const x = sec.startBar * pxPerBar;
      const width = (sec.endBar - sec.startBar) * pxPerBar;
      ctx.fillStyle = SECTION_COLORS[sec.name] ?? DEFAULT_SECTION_COLOR;
      ctx.fillRect(x, 0, width, sectionRowH);
    }

    // Draw track blocks
    for (let i = 0; i < song.tracks.length; i++) {
      const track = song.tracks[i];
      const y = sectionRowH + i * trackRowH;
      const color = INSTRUMENT_COLORS[track.instrument] ?? DEFAULT_INSTRUMENT_COLOR;

      for (const block of track.blocks) {
        const x = block.startBar * pxPerBar;
        const width = (block.endBar - block.startBar) * pxPerBar;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, trackRowH - 1);
      }
    }

    // Draw viewport indicator
    const sc = getScrollContainer();
    if (sc) {
      const { scrollLeft, scrollWidth, clientWidth } = sc;
      if (scrollWidth > clientWidth) {
        const vpX = (scrollLeft / scrollWidth) * w;
        const vpW = (clientWidth / scrollWidth) * w;

        ctx.fillStyle = 'rgba(232, 168, 76, 0.15)';
        ctx.fillRect(vpX, 0, vpW, h);

        ctx.strokeStyle = 'rgba(232, 168, 76, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpX + 0.5, 0.5, vpW - 1, h - 1);
      }
    }
  }

  function handleMouseDown(e: MouseEvent) {
    const sc = getScrollContainer();
    if (!sc || !canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const canvasW = rect.width;
    const clickX = e.clientX - rect.left;

    // Jump scroll to clicked position immediately
    const ratio = clickX / canvasW;
    sc.scrollLeft = ratio * sc.scrollWidth - sc.clientWidth / 2;

    // Start drag — register listeners synchronously
    isDragging = true;

    const handleMove = (me: MouseEvent) => {
      const moveX = me.clientX - rect.left;
      const moveRatio = moveX / canvasW;
      sc.scrollLeft = moveRatio * sc.scrollWidth - sc.clientWidth / 2;
    };

    const handleUp = () => {
      isDragging = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function onScroll() {
    draw();
  }

  $effect(() => {
    // Re-draw whenever song or totalBars changes
    void song;
    void totalBars;
    requestAnimationFrame(() => draw());
  });


  onMount(() => {
    const observer = new ResizeObserver(() => draw());
    if (containerEl) observer.observe(containerEl);

    // Listen to scroll on the sibling .flow-content
    const sc = getScrollContainer();
    if (sc) {
      sc.addEventListener('scroll', onScroll, { passive: true });
    }

    // Initial draw after mount
    requestAnimationFrame(() => requestAnimationFrame(() => draw()));

    return () => {
      observer.disconnect();
      const sc2 = getScrollContainer();
      if (sc2) sc2.removeEventListener('scroll', onScroll);
    };
  });
</script>

<div class="minimap-container" bind:this={containerEl} onmousedown={handleMouseDown} role="presentation">
  <canvas class="minimap-canvas" bind:this={canvas}></canvas>
</div>

<style>
  .minimap-container {
    height: 30px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-base);
    cursor: pointer;
    flex-shrink: 0;
  }
  .minimap-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
