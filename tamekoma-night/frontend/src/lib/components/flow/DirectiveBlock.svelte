<script lang="ts">
  import type { DirectiveBlock } from '$lib/types/song';

  const TRACK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    piano:   { bg: 'rgba(184,160,240,0.10)', border: 'rgba(184,160,240,0.15)', text: '#a898c8' },
    bass:    { bg: 'rgba(124,184,130,0.08)', border: 'rgba(124,184,130,0.12)', text: '#88b090' },
    drums:   { bg: 'rgba(232,168,76,0.10)',  border: 'rgba(232,168,76,0.15)',  text: '#c8a060' },
    strings: { bg: 'rgba(110,168,208,0.08)', border: 'rgba(110,168,208,0.12)', text: '#80a0b8' },
    guitar:  { bg: 'rgba(240,192,96,0.08)',  border: 'rgba(240,192,96,0.12)',  text: '#c0a860' },
    organ:   { bg: 'rgba(224,96,80,0.08)',   border: 'rgba(224,96,80,0.12)',   text: '#c08878' },
  };

  const DEFAULT_COLOR = { bg: 'rgba(160,160,180,0.06)', border: 'rgba(160,160,180,0.12)', text: '#908888' };

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
  let summary = $derived(summarize(block.directives));

  function summarize(directives: string): string {
    if (!directives.trim()) return '';
    const lines = directives.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 2) return lines.join(' / ');
    return lines.slice(0, 2).join(' / ') + '...';
  }

  let isEmpty = $derived(!block.directives.trim());

  function handleMouseDown(e: MouseEvent) {
    // Right-edge resize detection is handled by parent (FlowTrackRow)
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
  style:grid-column="{block.startBar} / {block.endBar + 1}"
  onmousedown={handleMouseDown}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
>
  {#if isEmpty}
    <span class="block-summary block-summary--empty">empty</span>
  {:else}
    <span class="block-summary">{summary}</span>
  {/if}
  <div class="resize-handle" style:background={colors.border}></div>
</div>

<style>
  .directive-block {
    position: relative;
    display: flex;
    align-items: center;
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
  }

  .directive-block:hover {
    filter: brightness(1.15);
  }

  .block-summary {
    font-size: 0.72rem;
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .block-summary--empty {
    font-style: italic;
    color: var(--text-muted);
    opacity: 0.6;
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
