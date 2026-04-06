<script lang="ts">
  import type { Track, DirectiveBlock } from '$lib/types/song';
  import DirectiveBlockComp from './DirectiveBlock.svelte';

  let {
    track,
    totalBars,
    onBlockClick,
    onBlockCreate,
    onBlockMove,
    onBlockResize,
    onBlockDelete,
    onBlockCopy,
  }: {
    track: Track;
    totalBars: number;
    onBlockClick: (block: DirectiveBlock) => void;
    onBlockCreate: (startBar: number, endBar: number) => void;
    onBlockMove: (blockId: string, newStartBar: number) => void;
    onBlockResize: (blockId: string, newEndBar: number) => void;
    onBlockDelete: (blockId: string) => void;
    onBlockCopy: (blockId: string, targetStartBar: number) => void;
  } = $props();

  let contextMenu = $state<{ x: number; y: number; blockId: string } | null>(null);

  function handleGridDblClick(e: MouseEvent) {
    const grid = e.currentTarget as HTMLElement;
    const rect = grid.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const barWidth = rect.width / totalBars;
    const bar = Math.floor(relX / barWidth) + 1;

    // Check if clicking on an existing block
    const target = e.target as HTMLElement;
    if (target.closest('.directive-block')) return;

    onBlockCreate(bar, bar);
  }

  function handleContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const blockEl = target.closest('.directive-block') as HTMLElement | null;
    if (!blockEl) return;

    e.preventDefault();
    const blockId = blockEl.dataset.blockId;
    if (blockId) {
      contextMenu = { x: e.clientX, y: e.clientY, blockId };
    }
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleCopy() {
    if (!contextMenu) return;
    const block = track.blocks.find(b => b.id === contextMenu!.blockId);
    if (block) {
      onBlockCopy(block.id, block.endBar + 1);
    }
    closeContextMenu();
  }

  function handleDelete() {
    if (!contextMenu) return;
    onBlockDelete(contextMenu.blockId);
    closeContextMenu();
  }

  // Resize handling
  let resizingBlock = $state<{ id: string; startX: number; origEnd: number } | null>(null);

  function handleResizeStart(blockId: string, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const block = track.blocks.find(b => b.id === blockId);
    if (!block) return;
    resizingBlock = { id: blockId, startX: e.clientX, origEnd: block.endBar };

    const handleMove = (me: MouseEvent) => {
      if (!resizingBlock) return;
      const grid = (e.target as HTMLElement).closest('.track-grid') as HTMLElement;
      if (!grid) return;
      const barWidth = grid.getBoundingClientRect().width / totalBars;
      const delta = Math.round((me.clientX - resizingBlock.startX) / barWidth);
      const newEnd = Math.max(resizingBlock.origEnd + delta, block!.startBar);
      onBlockResize(resizingBlock.id, Math.min(newEnd, totalBars));
    };

    const handleUp = () => {
      resizingBlock = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }
</script>

<svelte:window onclick={closeContextMenu} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="track-grid"
  style:grid-template-columns="repeat({totalBars}, 1fr)"
  ondblclick={handleGridDblClick}
  oncontextmenu={handleContextMenu}
>
  {#each Array.from({ length: totalBars }, (_, i) => i + 1) as barNum}
    <div class="grid-cell" class:grid-cell--odd={barNum % 2 === 1}></div>
  {/each}
  {#each track.blocks as block (block.id)}
    <div
      class="block-wrapper"
      style:grid-column="{block.startBar} / {block.endBar + 1}"
      style:grid-row="1"
      data-block-id={block.id}
    >
      <DirectiveBlockComp
        {block}
        trackColor={track.instrument}
        onClick={() => onBlockClick(block)}
      />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="resize-edge"
        onmousedown={(e) => handleResizeStart(block.id, e)}
      ></div>
    </div>
  {/each}
</div>

{#if contextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    style:left="{contextMenu.x}px"
    style:top="{contextMenu.y}px"
  >
    <button class="ctx-item" onclick={handleCopy}>Duplicate</button>
    <button class="ctx-item ctx-item--danger" onclick={handleDelete}>Delete</button>
  </div>
{/if}

<style>
  .track-grid {
    display: grid;
    gap: 0;
    position: relative;
    min-height: 32px;
    padding: 0 2px;
  }

  .grid-cell {
    border-right: 1px solid var(--border-subtle);
    min-height: 32px;
    grid-row: 1;
  }

  .grid-cell:last-child {
    border-right: none;
  }

  .grid-cell--odd {
    background: rgba(255, 255, 255, 0.01);
  }

  .block-wrapper {
    position: relative;
    z-index: 1;
    padding: 2px 0;
  }

  .resize-edge {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 2;
  }

  .context-menu {
    position: fixed;
    z-index: 200;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-elevated);
    padding: 4px 0;
    min-width: 120px;
  }

  .ctx-item {
    display: block;
    width: 100%;
    padding: 6px 14px;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 0.78rem;
    font-family: var(--font-sans);
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .ctx-item:hover {
    background: var(--bg-hover);
  }

  .ctx-item--danger {
    color: var(--error);
  }
</style>
