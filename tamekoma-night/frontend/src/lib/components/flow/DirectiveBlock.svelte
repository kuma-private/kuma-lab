<script lang="ts">
  import type { DirectiveBlock } from '$lib/types/song';

  const TRACK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    piano:   { bg: 'rgba(184,160,240,0.12)', border: 'rgba(184,160,240,0.25)', text: '#b8a0f0' },
    bass:    { bg: 'rgba(124,184,130,0.1)',  border: 'rgba(124,184,130,0.25)', text: '#7cb882' },
    drums:   { bg: 'rgba(232,168,76,0.08)',  border: 'rgba(232,168,76,0.25)',  text: '#e8a84c' },
    strings: { bg: 'rgba(110,168,208,0.1)',  border: 'rgba(110,168,208,0.25)', text: '#6ea8d0' },
    guitar:  { bg: 'rgba(240,192,96,0.1)',   border: 'rgba(240,192,96,0.25)',  text: '#f0c060' },
    organ:   { bg: 'rgba(224,96,80,0.08)',   border: 'rgba(224,96,80,0.25)',   text: '#e06050' },
  };

  const DEFAULT_COLOR = { bg: 'rgba(160,160,180,0.08)', border: 'rgba(160,160,180,0.25)', text: '#a0a0b4' };

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
    if (!directives.trim()) return '(empty)';
    const lines = directives.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 2) return lines.join(' / ');
    return lines.slice(0, 2).join(' / ') + '...';
  }

  let resizing = $state(false);

  function handleMouseDown(e: MouseEvent) {
    // Right-edge resize detection is handled by parent (FlowTrackRow)
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      e.stopPropagation();
      return;
    }
    onClick();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="directive-block"
  style:background={colors.bg}
  style:border-color={colors.border}
  style:color={colors.text}
  style:grid-column="{block.startBar} / {block.endBar + 1}"
  onmousedown={handleMouseDown}
>
  <span class="block-summary">{summary}</span>
  <div class="resize-handle" style:background={colors.border}></div>
</div>

<style>
  .directive-block {
    position: relative;
    display: flex;
    align-items: center;
    border: 1px solid;
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    min-height: 28px;
    cursor: pointer;
    overflow: hidden;
    transition: filter 0.15s;
    user-select: none;
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
