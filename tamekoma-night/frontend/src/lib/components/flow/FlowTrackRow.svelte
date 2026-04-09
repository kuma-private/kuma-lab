<script lang="ts">
  import type { Track, DirectiveBlock } from '$lib/types/song';
  import DirectiveBlockComp from './DirectiveBlock.svelte';

  let {
    track,
    totalBars,
    selectedRange = null,
    onBlockClick,
    onBlockCreate,
    onBlockMove,
    onBlockResize,
    onBlockDelete,
    onBlockCopy,
  }: {
    track: Track;
    totalBars: number;
    selectedRange?: { startBar: number; endBar: number } | null;
    onBlockClick: (block: DirectiveBlock) => void;
    onBlockCreate: (startBar: number, endBar: number) => void;
    onBlockMove: (blockId: string, newStartBar: number) => void;
    onBlockResize: (blockId: string, newEndBar: number) => void;
    onBlockDelete: (blockId: string) => void;
    onBlockCopy: (blockId: string, targetStartBar: number) => void;
  } = $props();

  function isBarSelected(barNum: number): boolean {
    if (!selectedRange) return false;
    return barNum >= selectedRange.startBar && barNum <= selectedRange.endBar;
  }

  import { tick } from 'svelte';
  let contextMenu = $state<{ x: number; y: number; blockId: string } | null>(null);

  function handleContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const blockEl = target.closest('.directive-block') as HTMLElement | null;
    if (!blockEl) return;

    e.preventDefault();
    const blockId = blockEl.dataset.blockId;
    if (blockId) {
      contextMenu = { x: e.clientX, y: e.clientY, blockId };
      tick().then(() => {
        const menu = document.querySelector('.context-menu [role="menuitem"]') as HTMLElement | null;
        menu?.focus();
      });
    }
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleCopy() {
    if (!contextMenu) return;
    const block = track.blocks.find(b => b.id === contextMenu!.blockId);
    if (block) {
      onBlockCopy(block.id, block.endBar); // endBar is exclusive, so it's already the next start
    }
    closeContextMenu();
  }

  function handleDelete() {
    if (!contextMenu) return;
    onBlockDelete(contextMenu.blockId);
    closeContextMenu();
  }

  // Drag-to-create handling
  let dragCreate = $state<{ startBar: number; currentBar: number } | null>(null);

  function barIndexFromX(grid: HTMLElement, clientX: number): number {
    const cells = grid.querySelectorAll('.grid-cell');
    for (let i = cells.length - 1; i >= 0; i--) {
      const r = cells[i].getBoundingClientRect();
      if (clientX >= r.left) return Number((cells[i] as HTMLElement).dataset.bar ?? i);
    }
    return 0;
  }

  function handleGridMouseDown(e: MouseEvent) {
    // Only left button, not on existing blocks
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.directive-block') || target.closest('.resize-edge')) return;

    const grid = e.currentTarget as HTMLElement;
    const bar = barIndexFromX(grid, e.clientX);

    dragCreate = { startBar: bar, currentBar: bar };

    const handleMove = (me: MouseEvent) => {
      if (!dragCreate) return;
      const curBar = barIndexFromX(grid, me.clientX);
      dragCreate = { ...dragCreate, currentBar: Math.max(0, Math.min(curBar, totalBars - 1)) };
    };

    const handleUp = () => {
      if (dragCreate) {
        const lo = Math.min(dragCreate.startBar, dragCreate.currentBar);
        const hi = Math.max(dragCreate.startBar, dragCreate.currentBar);
        onBlockCreate(lo, hi + 1); // 0-based start, exclusive end
      }
      dragCreate = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function isDragHighlight(barIndex: number): boolean {
    if (!dragCreate) return false;
    const lo = Math.min(dragCreate.startBar, dragCreate.currentBar);
    const hi = Math.max(dragCreate.startBar, dragCreate.currentBar);
    return barIndex >= lo && barIndex <= hi;
  }

  // Resize handling
  let resizingBlock = $state<{ id: string; startX: number; origEnd: number } | null>(null);

  function handleResizeStart(blockId: string, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const block = track.blocks.find(b => b.id === blockId);
    if (!block) return;
    const grid = (e.target as HTMLElement).closest('.track-grid') as HTMLElement;
    resizingBlock = { id: blockId, startX: e.clientX, origEnd: block.endBar };

    const handleMove = (me: MouseEvent) => {
      if (!resizingBlock || !grid) return;
      const newEnd = barIndexFromX(grid, me.clientX) + 1; // exclusive end
      const clamped = Math.max(newEnd, block!.startBar + 1); // at least 1 bar wide
      onBlockResize(resizingBlock.id, Math.min(clamped, totalBars));
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

<div
  class="track-grid"
  role="gridcell"
  tabindex="0"
  style:grid-template-columns="repeat({totalBars}, minmax(0, 140px))"
  onmousedown={handleGridMouseDown}
  oncontextmenu={handleContextMenu}
>
  {#each Array.from({ length: totalBars }, (_, i) => i) as barIndex}
    <div
      class="grid-cell"
      class:grid-cell--odd={barIndex % 2 === 0}
      class:grid-cell--selected={isBarSelected(barIndex + 1)}
      class:grid-cell--drag={isDragHighlight(barIndex)}
      class:grid-cell--inactive={barIndex < (track.activeStart ?? 0) || barIndex >= (track.activeEnd ?? totalBars)}
      style:grid-column={barIndex + 1}
      style:grid-row="1"
      data-bar={barIndex}
    ></div>
  {/each}
  {#if track.blocks.length === 0}
    <div class="empty-track-hint" style:grid-column="1 / {totalBars + 1}" style:grid-row="1">
      ドラッグでブロックを作成 → クリックでAI生成
    </div>
  {/if}
  {#each track.blocks as block (block.id)}
    <div
      class="block-wrapper"
      style:grid-column="{block.startBar + 1} / {block.endBar + 1}"
      style:grid-row="1"
      data-block-id={block.id}
    >
      <DirectiveBlockComp
        {block}
        trackColor={track.instrument}
        onClick={() => onBlockClick(block)}
      />
      <div
        class="resize-edge"
        role="separator"
        tabindex="-1"
        title="ドラッグで範囲を変更"
        onmousedown={(e) => handleResizeStart(block.id, e)}
      ></div>
    </div>
  {/each}
</div>

{#if contextMenu}
  <div
    class="context-menu"
    role="menu"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}
    style:left="{contextMenu.x}px"
    style:top="{contextMenu.y}px"
  >
    <button class="ctx-item" role="menuitem" onclick={handleCopy}>Duplicate</button>
    <button class="ctx-item ctx-item--danger" role="menuitem" onclick={handleDelete}>Delete</button>
  </div>
{/if}

<style>
  .track-grid {
    display: grid;
    gap: 0;
    position: relative;
    min-height: 56px;
    padding: 0 2px;
  }

  .grid-cell {
    border-left: 1px solid rgba(138, 126, 104, 0.4);
    min-height: 56px;
    grid-row: 1;
  }

  .grid-cell:first-child {
    border-left: none;
  }

  .grid-cell--odd {
    background: rgba(255, 255, 255, 0.008);
  }

  .grid-cell--selected {
    background: rgba(232, 168, 76, 0.08);
  }

  .grid-cell--drag {
    background: rgba(232, 168, 76, 0.15);
  }

  .grid-cell--inactive {
    background: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      rgba(0, 0, 0, 0.06) 3px,
      rgba(0, 0, 0, 0.06) 6px
    );
    opacity: 0.45;
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
    width: 12px;
    cursor: ew-resize;
    z-index: 2;
    transition: background 0.15s;
  }

  .resize-edge:hover {
    background: rgba(232, 168, 76, 0.3);
  }

  .empty-track-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 0.72rem;
    font-style: italic;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
  }

  .context-menu {
    position: fixed;
    z-index: var(--z-context-menu);
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
