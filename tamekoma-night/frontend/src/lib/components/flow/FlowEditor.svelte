<script lang="ts">
  import type { Song, DirectiveBlock, Track, MidiNote } from '$lib/types/song';
  import { suggestArrangement, type ArrangeRequest, type ArrangeResponse } from '$lib/api';
  import { showToast } from '$lib/stores/toast.svelte';
  import SectionBar from './SectionBar.svelte';
  import ChordTimeline from './ChordTimeline.svelte';
  import FlowTrackRow from './FlowTrackRow.svelte';
  import TextView from './TextView.svelte';
  import BlockPopover from './BlockPopover.svelte';
  import Visualizer from '$lib/components/visualizer/Visualizer.svelte';
  import MixerView from './MixerView.svelte';

  let {
    song,
    songId,
    onSongChange,
    trackNotes = new Map(),
    currentTime = 0,
    totalDuration = 0,
  }: {
    song: Song;
    songId?: string;
    onSongChange: (song: Song) => void;
    trackNotes?: Map<string, { name: string; instrument: string; notes: MidiNote[] }>;
    currentTime?: number;
    totalDuration?: number;
  } = $props();

  let activeTab = $state<'flow' | 'visualizer' | 'mixer' | 'text'>('flow');

  // --- BlockPopover state ---
  let popoverBlock = $state<DirectiveBlock | null>(null);
  let popoverTrack = $state<Track | null>(null);

  // --- AI Arrange state ---
  let arrangeOpen = $state(false);
  let arrangeGenre = $state('');
  let arrangeLoading = $state(false);

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
  function handleBlockClick(block: DirectiveBlock, track: Track) {
    popoverBlock = block;
    popoverTrack = track;
  }

  function handlePopoverSave(directives: string) {
    if (!popoverBlock || !popoverTrack) return;
    const track = song.tracks.find(t => t.id === popoverTrack!.id);
    if (!track) return;
    const block = track.blocks.find(b => b.id === popoverBlock!.id);
    if (block) {
      block.directives = directives;
      emit();
    }
  }

  function handlePopoverClose() {
    popoverBlock = null;
    popoverTrack = null;
  }

  // --- Section name for popover ---
  function sectionNameForBar(bar: number): string {
    const sec = song.sections.find(s => bar >= s.startBar && bar < s.endBar);
    return sec?.name ?? '';
  }

  // --- AI Arrange ---
  async function handleArrange() {
    if (!songId) {
      showToast('Song ID が不明です', 'error');
      return;
    }
    if (!arrangeGenre.trim()) {
      showToast('ジャンルを入力してください', 'error');
      return;
    }

    arrangeLoading = true;
    try {
      const result: ArrangeResponse = await suggestArrangement(songId, {
        chordProgression: song.chordProgression,
        genre: arrangeGenre.trim(),
        key: song.key,
        bpm: song.bpm,
      });

      // Apply suggested tracks to song
      const newTracks: Track[] = result.tracks.map(t => ({
        id: crypto.randomUUID(),
        name: t.name,
        instrument: t.instrument,
        blocks: t.blocks.map(b => ({
          id: crypto.randomUUID(),
          startBar: b.startBar,
          endBar: b.endBar,
          directives: b.directives,
        })),
        volume: 0,
        mute: false,
        solo: false,
      }));

      song.tracks = newTracks;
      emit();
      arrangeOpen = false;
      arrangeGenre = '';
      showToast('アレンジを生成しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'アレンジ生成に失敗しました';
      showToast(message, 'error');
    } finally {
      arrangeLoading = false;
    }
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

  // --- Mixer handlers ---
  function handleTrackVolume(trackId: string, db: number) {
    const track = song.tracks.find(t => t.id === trackId);
    if (track) {
      track.volume = db;
      emit();
    }
  }

  function handleTrackMute(trackId: string, mute: boolean) {
    const track = song.tracks.find(t => t.id === trackId);
    if (track) {
      track.mute = mute;
      emit();
    }
  }

  function handleTrackSolo(trackId: string, solo: boolean) {
    const track = song.tracks.find(t => t.id === trackId);
    if (track) {
      track.solo = solo;
      emit();
    }
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
        aria-selected={activeTab === 'visualizer'}
        class:tab--active={activeTab === 'visualizer'}
        onclick={() => activeTab = 'visualizer'}
      >Visualizer</button>
      <button
        class="tab"
        role="tab"
        aria-selected={activeTab === 'mixer'}
        class:tab--active={activeTab === 'mixer'}
        onclick={() => activeTab = 'mixer'}
      >Mixer</button>
      <button
        class="tab"
        role="tab"
        aria-selected={activeTab === 'text'}
        class:tab--active={activeTab === 'text'}
        onclick={() => activeTab = 'text'}
      >Text</button>
    </div>
    <!-- Right side: AI Arrange button -->
    <div class="tab-bar-right">
      <button class="btn-arrange" onclick={() => arrangeOpen = !arrangeOpen}>
        AI Arrange
      </button>
    </div>
  </div>

  {#if arrangeOpen}
    <div class="arrange-bar">
      <input
        type="text"
        class="arrange-input"
        placeholder="ジャンルを入力... (例: ボサノバ, ジャズ, ロック)"
        bind:value={arrangeGenre}
        disabled={arrangeLoading}
        onkeydown={(e) => { if (e.key === 'Enter' && !arrangeLoading) handleArrange(); }}
      />
      <button class="btn-arrange-go" onclick={handleArrange} disabled={arrangeLoading}>
        {#if arrangeLoading}
          <span class="spinner-sm"></span>
        {:else}
          アレンジ生成
        {/if}
      </button>
      <button class="btn-arrange-close" onclick={() => arrangeOpen = false} aria-label="Close">&times;</button>
    </div>
  {/if}

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
          <ChordTimeline chords={song.chordProgression} totalBars={totalBars} musicalKey={song.key} />
        </div>

        <!-- Separator -->
        <div class="row-separator"></div>
        <div class="row-separator"></div>

        <!-- Track rows -->
        {#each song.tracks as track (track.id)}
          <div class="row-label track-label">
            <select class="track-instrument-select" value={track.instrument} onchange={(e) => {
              const inst = (e.target as HTMLSelectElement).value;
              track.instrument = inst;
              track.name = inst.charAt(0).toUpperCase() + inst.slice(1);
              emit();
            }}>
              <option value="piano">Piano</option>
              <option value="bass">Bass</option>
              <option value="drums">Drums</option>
              <option value="strings">Strings</option>
              <option value="guitar">Guitar</option>
              <option value="organ">Organ</option>
            </select>
          </div>
          <div class="row-content">
            <FlowTrackRow
              {track}
              totalBars={totalBars}
              onBlockClick={(b) => handleBlockClick(b, track)}
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
  {:else if activeTab === 'visualizer'}
    <div class="visualizer-container">
      <Visualizer
        {trackNotes}
        {currentTime}
        {totalDuration}
        bpm={song.bpm}
      />
    </div>
  {:else if activeTab === 'mixer'}
    <div class="mixer-container">
      <MixerView
        tracks={song.tracks.map(t => ({ id: t.id, name: t.name, instrument: t.instrument, volume: t.volume, mute: t.mute, solo: t.solo }))}
        onTrackVolume={handleTrackVolume}
        onTrackMute={handleTrackMute}
        onTrackSolo={handleTrackSolo}
      />
    </div>
  {:else}
    <div class="text-view-container">
      <TextView {song} {onSongChange} />
    </div>
  {/if}

  {#if popoverBlock && popoverTrack}
    <BlockPopover
      block={popoverBlock}
      trackName={popoverTrack.name}
      instrument={popoverTrack.instrument}
      sectionName={sectionNameForBar(popoverBlock.startBar)}
      {songId}
      chordProgression={song.chordProgression}
      onSave={handlePopoverSave}
      onClose={handlePopoverClose}
    />
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

  .tab-bar-right {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .btn-arrange {
    padding: 4px 12px;
    font-size: 0.72rem;
    font-weight: 600;
    font-family: var(--font-sans);
    border: 1px solid rgba(232, 168, 76, 0.3);
    border-radius: 6px;
    background: rgba(232, 168, 76, 0.08);
    color: var(--accent-primary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-arrange:hover {
    background: rgba(232, 168, 76, 0.18);
    border-color: rgba(232, 168, 76, 0.5);
  }

  /* ---- Arrange bar ---- */
  .arrange-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
  }

  .arrange-input {
    flex: 1;
    padding: 6px 10px;
    font-size: 0.82rem;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
  }

  .arrange-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }

  .arrange-input::placeholder {
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .btn-arrange-go {
    padding: 6px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    font-family: var(--font-sans);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent-primary);
    color: #fff;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    min-width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-arrange-go:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-arrange-go:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-arrange-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .btn-arrange-close:hover {
    color: var(--text-primary);
  }

  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
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
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    font-family: var(--font-sans);
    white-space: nowrap;
    border-right: 1px solid var(--border-subtle);
    min-height: 36px;
  }

  .track-label {
    color: var(--text-secondary);
    font-weight: 600;
  }

  .track-instrument-select {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.68rem;
    font-weight: 600;
    padding: 2px 4px;
    cursor: pointer;
    outline: none;
    width: 100%;
  }
  .track-instrument-select:hover {
    border-color: var(--border-default);
    background: var(--bg-elevated);
  }
  .track-instrument-select:focus {
    border-color: var(--accent-primary);
  }

  .row-content {
    min-height: 36px;
    padding: var(--space-xs) 0;
  }

  .chord-row {
    border-bottom: 1px solid var(--border-subtle);
  }

  .row-separator {
    height: 1px;
    background: var(--border-subtle);
    opacity: 0.5;
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
    color: var(--accent-warm);
    border-color: rgba(232, 168, 76, 0.4);
  }

  /* ---- Visualizer container ---- */
  .visualizer-container {
    display: flex;
    flex: 1;
    min-height: 300px;
  }

  /* ---- Mixer container ---- */
  .mixer-container {
    display: flex;
    flex: 1;
    min-height: 300px;
  }

  /* ---- Text view container ---- */
  .text-view-container {
    display: flex;
    flex: 1;
    min-height: 200px;
  }
</style>
