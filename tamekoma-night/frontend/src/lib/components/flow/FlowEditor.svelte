<script lang="ts">
  import type { Song, DirectiveBlock } from '$lib/types/song';
  import SectionBar from './SectionBar.svelte';
  import ChordTimeline from './ChordTimeline.svelte';
  import FlowTrackRow from './FlowTrackRow.svelte';
  import TextView from './TextView.svelte';

  let {
    song,
    onSongChange,
  }: {
    song: Song;
    onSongChange: (song: Song) => void;
  } = $props();

  let activeTab = $state<'flow' | 'text'>('flow');

  // --- Computed totalBars ---
  // Derive totalBars from sections and track blocks (max endBar across all, minimum 8)
  let totalBars = $derived.by(() => {
    let max = 8;
    for (const sec of song.sections) {
      if (sec.endBar > max) max = sec.endBar;
    }
    for (const track of song.tracks) {
      for (const block of track.blocks) {
        if (block.endBar > max) max = block.endBar;
      }
    }
    return max;
  });

  // --- Helpers ---

  function emit() {
    onSongChange(structuredClone(song));
  }

  // Section name change
  function handleSectionNameChange(sectionId: string, name: string) {
    const sec = song.sections.find(s => s.id === sectionId);
    if (sec) {
      sec.name = name;
      emit();
    }
  }

  // Block callbacks per track
  function handleBlockClick(_block: DirectiveBlock) {
    // Will be handled by #15 (popover)
  }

  function handleBlockCreate(trackId: string, startBar: number, endBar: number) {
    const track = song.tracks.find(t => t.id === trackId);
    if (!track) return;
    track.blocks.push({
      id: crypto.randomUUID(),
      startBar,
      endBar,
      directives: '',
    });
    emit();
  }

  function handleBlockMove(trackId: string, blockId: string, newStartBar: number) {
    const track = song.tracks.find(t => t.id === trackId);
    if (!track) return;
    const block = track.blocks.find(b => b.id === blockId);
    if (!block) return;
    const duration = block.endBar - block.startBar;
    block.startBar = newStartBar;
    block.endBar = newStartBar + duration;
    emit();
  }

  function handleBlockResize(trackId: string, blockId: string, newEndBar: number) {
    const track = song.tracks.find(t => t.id === trackId);
    if (!track) return;
    const block = track.blocks.find(b => b.id === blockId);
    if (block && newEndBar >= block.startBar) {
      block.endBar = newEndBar;
      emit();
    }
  }

  function handleBlockDelete(trackId: string, blockId: string) {
    const track = song.tracks.find(t => t.id === trackId);
    if (!track) return;
    track.blocks = track.blocks.filter(b => b.id !== blockId);
    emit();
  }

  function handleBlockCopy(trackId: string, blockId: string, targetStartBar: number) {
    const track = song.tracks.find(t => t.id === trackId);
    if (!track) return;
    const src = track.blocks.find(b => b.id === blockId);
    if (!src) return;
    const duration = src.endBar - src.startBar;
    track.blocks.push({
      id: crypto.randomUUID(),
      startBar: targetStartBar,
      endBar: targetStartBar + duration,
      directives: src.directives,
    });
    emit();
  }

  function handleAddTrack() {
    const instruments = ['piano', 'bass', 'drums', 'strings', 'guitar', 'organ'];
    const usedInstruments = new Set(song.tracks.map(t => t.instrument));
    const next = instruments.find(i => !usedInstruments.has(i)) ?? 'piano';
    const name = next.charAt(0).toUpperCase() + next.slice(1);
    song.tracks.push({
      id: crypto.randomUUID(),
      name,
      instrument: next,
      blocks: [],
      volume: 0,
      mute: false,
      solo: false,
    });
    emit();
  }
</script>

<div class="flow-editor">
  <!-- Tab bar -->
  <div class="tab-bar">
    <div class="tab-group" role="tablist">
      <button
        class="tab"
        role="tab"
        aria-selected={activeTab === 'flow'}
        class:tab--active={activeTab === 'flow'}
        onclick={() => activeTab = 'flow'}
      >Flow</button>
      <button
        class="tab"
        role="tab"
        aria-selected={activeTab === 'text'}
        class:tab--active={activeTab === 'text'}
        onclick={() => activeTab = 'text'}
      >Text</button>
    </div>
    <!-- Song metadata shown in page header, not duplicated here -->
  </div>

  {#if activeTab === 'flow'}
    <div class="flow-content">
      <!-- Grid layout: label column + timeline columns -->
      <div class="flow-grid">
        <!-- Section row -->
        <div class="row-label">Section</div>
        <div class="row-content">
          <SectionBar
            sections={song.sections}
            totalBars={totalBars}
            onSectionNameChange={handleSectionNameChange}
          />
        </div>

        <!-- Chord row -->
        <div class="row-label">Chords</div>
        <div class="row-content chord-row">
          <ChordTimeline chords={song.chordProgression} totalBars={totalBars} />
        </div>

        <!-- Separator -->
        <div class="row-separator"></div>
        <div class="row-separator"></div>

        <!-- Track rows -->
        {#each song.tracks as track (track.id)}
          <div class="row-label track-label">{track.name}</div>
          <div class="row-content">
            <FlowTrackRow
              {track}
              totalBars={totalBars}
              onBlockClick={handleBlockClick}
              onBlockCreate={(s, e) => handleBlockCreate(track.id, s, e)}
              onBlockMove={(bid, s) => handleBlockMove(track.id, bid, s)}
              onBlockResize={(bid, e) => handleBlockResize(track.id, bid, e)}
              onBlockDelete={(bid) => handleBlockDelete(track.id, bid)}
              onBlockCopy={(bid, s) => handleBlockCopy(track.id, bid, s)}
            />
          </div>
        {/each}

        <!-- Add track button -->
        <div class="row-label">
          <button class="add-track-btn" onclick={handleAddTrack}>+ Track</button>
        </div>
        <div class="row-content"></div>
      </div>
    </div>
  {:else}
    <div class="text-view-container">
      <TextView {song} {onSongChange} />
    </div>
  {/if}
</div>

<style>
  .flow-editor {
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  /* ---- Tab bar ---- */
  .tab-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-md);
    height: 40px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-base);
    flex-shrink: 0;
  }

  .tab-group {
    display: flex;
    gap: 0;
  }

  .tab {
    padding: 8px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover {
    color: var(--text-secondary);
  }

  .tab--active {
    color: var(--accent-warm);
    border-bottom-color: var(--accent-warm);
  }

  /* ---- Flow content ---- */
  .flow-content {
    overflow-x: auto;
    padding: var(--space-md) 0;
    flex: 1;
    min-height: 300px;
  }

  .flow-grid {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 0;
    min-width: max-content;
  }

  .row-label {
    display: flex;
    align-items: center;
    padding: 0 var(--space-sm);
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-muted);
    font-family: var(--font-sans);
    white-space: nowrap;
    border-right: 1px solid var(--border-subtle);
    min-height: 28px;
  }

  .track-label {
    color: var(--text-secondary);
    font-weight: 600;
  }

  .row-content {
    min-height: 28px;
  }

  .chord-row {
    border-bottom: 1px solid var(--border-subtle);
  }

  .row-separator {
    height: 1px;
    background: var(--border-subtle);
  }

  .add-track-btn {
    background: none;
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: 0.68rem;
    font-family: var(--font-sans);
    padding: 2px 10px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .add-track-btn:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  /* ---- Text view container ---- */
  .text-view-container {
    display: flex;
    flex: 1;
    min-height: 200px;
  }
</style>
