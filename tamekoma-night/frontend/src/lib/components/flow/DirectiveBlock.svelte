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
  let hasNotes = $derived(!!block.generatedMidi?.notes?.length);
  let isEmpty = $derived(!hasNotes);

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
    <span class="block-summary block-summary--ai">
      {block.generatedMidi?.style || 'AI generated'}
    </span>
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
