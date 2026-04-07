<script lang="ts">
  import type { Song, DirectiveBlock, Track, MidiNote, GeneratedMidiData, Section } from '$lib/types/song';
  import { suggestArrangement, type ArrangeRequest, type ArrangeResponse } from '$lib/api';
  import { showToast } from '$lib/stores/toast.svelte';
  import SectionBar from './SectionBar.svelte';
  import ChordTimeline from './ChordTimeline.svelte';
  import FlowTrackRow from './FlowTrackRow.svelte';
  import TextView from './TextView.svelte';
  import BlockPopover from './BlockPopover.svelte';
  import ChordEditDialog from './ChordEditDialog.svelte';
  import ImportDialog from './ImportDialog.svelte';
  import { parseProgression, serialize, resolveRepeats } from '$lib/chord-parser';
  import { playChordPreview } from '$lib/chord-player';
import FlowMinimap from './FlowMinimap.svelte';
  import TrackPianoRollRow from './TrackPianoRollRow.svelte';
  import PianoRollEditor from './PianoRollEditor.svelte';
  // Track note colors for inline piano roll
  const TRACK_NOTE_COLORS: Record<string, string> = {
    piano: '#b8a0f0', bass: '#7cb882', drums: '#e8a84c',
    strings: '#6ea8d0', guitar: '#f0c060', organ: '#e06050',
  };

  function parseSectionsFromChords(chordText: string): Section[] {
    const lines = chordText.split('\n');
    const sections: Section[] = [];
    let currentBar = 0;
    let currentSection: { name: string; startBar: number } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      const sectionMatch = trimmed.match(/^###\s+(.+)/);
      if (sectionMatch) {
        if (currentSection && currentBar > currentSection.startBar) {
          sections.push({
            id: crypto.randomUUID(),
            name: currentSection.name,
            startBar: currentSection.startBar,
            endBar: currentBar,
            color: '',
          });
        }
        currentSection = { name: sectionMatch[1].trim(), startBar: currentBar };
        continue;
      }

      if (trimmed.startsWith('|')) {
        const barCount = (trimmed.match(/\|/g)?.length ?? 1) - 1;
        currentBar += Math.max(barCount, 0);
      }
    }

    if (currentSection && currentBar > currentSection.startBar) {
      sections.push({
        id: crypto.randomUUID(),
        name: currentSection.name,
        startBar: currentSection.startBar,
        endBar: currentBar,
        color: '',
      });
    }

    return sections;
  }

  const GM_CATEGORIES = [
    { name: 'Piano', programs: [
      { num: 0, name: 'Acoustic Grand' },
      { num: 1, name: 'Bright Piano' },
      { num: 2, name: 'Electric Grand' },
      { num: 4, name: 'Rhodes' },
      { num: 5, name: 'Chorus Piano' },
      { num: 7, name: 'Clavinet' },
    ]},
    { name: 'Guitar', programs: [
      { num: 24, name: 'Nylon Guitar' },
      { num: 25, name: 'Steel Guitar' },
      { num: 26, name: 'Jazz Guitar' },
      { num: 27, name: 'Clean Electric' },
      { num: 29, name: 'Overdrive' },
      { num: 30, name: 'Distortion' },
    ]},
    { name: 'Bass', programs: [
      { num: 32, name: 'Acoustic Bass' },
      { num: 33, name: 'Finger Bass' },
      { num: 34, name: 'Pick Bass' },
      { num: 35, name: 'Fretless' },
      { num: 38, name: 'Synth Bass 1' },
    ]},
    { name: 'Strings', programs: [
      { num: 40, name: 'Violin' },
      { num: 42, name: 'Cello' },
      { num: 48, name: 'String Ensemble' },
      { num: 50, name: 'Synth Strings' },
    ]},
    { name: 'Brass', programs: [
      { num: 56, name: 'Trumpet' },
      { num: 57, name: 'Trombone' },
      { num: 60, name: 'French Horn' },
      { num: 61, name: 'Brass Section' },
    ]},
    { name: 'Reed', programs: [
      { num: 65, name: 'Alto Sax' },
      { num: 66, name: 'Tenor Sax' },
      { num: 71, name: 'Clarinet' },
    ]},
    { name: 'Pipe', programs: [
      { num: 73, name: 'Flute' },
      { num: 75, name: 'Pan Flute' },
    ]},
    { name: 'Synth', programs: [
      { num: 80, name: 'Square Lead' },
      { num: 81, name: 'Saw Lead' },
      { num: 88, name: 'New Age Pad' },
      { num: 89, name: 'Warm Pad' },
    ]},
    { name: 'Organ', programs: [
      { num: 16, name: 'Drawbar Organ' },
      { num: 19, name: 'Church Organ' },
    ]},
    { name: 'Drums', programs: [
      { num: -1, name: 'Standard Kit' },
    ]},
  ];

  function getDefaultProgram(instrument: string): number {
    const map: Record<string, number> = {
      piano: 0, bass: 33, guitar: 25, drums: -1,
      strings: 48, organ: 16,
    };
    return map[instrument] ?? 0;
  }

  function findCategoryByProgram(program: number): { instrument: string } | null {
    if (program < 0) return { instrument: 'drums' };
    if (program < 8) return { instrument: 'piano' };
    if (program < 16) return { instrument: 'piano' };
    if (program < 24) return { instrument: 'organ' };
    if (program < 32) return { instrument: 'guitar' };
    if (program < 40) return { instrument: 'bass' };
    if (program < 56) return { instrument: 'strings' };
    if (program < 64) return { instrument: 'strings' };
    if (program < 80) return { instrument: 'strings' };
    return { instrument: 'piano' };
  }

  function findProgramName(program: number): string | null {
    for (const cat of GM_CATEGORIES) {
      for (const prog of cat.programs) {
        if (prog.num === program) return prog.name;
      }
    }
    return null;
  }

  let {
    song,
    songId,
    onSongChange,
    onSeekToBar,
    trackNotes = new Map(),
    currentTime = 0,
    totalDuration = 0,
    activeTab = 'text',
    onTabChange,
  }: {
    song: Song;
    songId?: string;
    onSongChange: (song: Song) => void;
    onSeekToBar?: (barIndex: number) => void;
    trackNotes?: Map<string, { name: string; instrument: string; notes: MidiNote[] }>;
    currentTime?: number;
    totalDuration?: number;
    activeTab?: 'flow' | 'text';
    onTabChange?: (tab: 'flow' | 'text') => void;
  } = $props();

  // --- BlockPopover state ---
  let popoverBlock = $state<DirectiveBlock | null>(null);
  let popoverTrack = $state<Track | null>(null);

  // --- ChordEditDialog state ---
  let editingBar = $state<number | null>(null);
  let editingEndBar = $state<number | null>(null);
  let editingBarInitialChords = $state('');

  // --- Range selection state ---
  let selectedRange = $state<{ startBar: number; endBar: number } | null>(null);

  // --- PianoRollEditor state ---
  let pianoRollTrackId = $state<string | null>(null);
  let pianoRollNotes = $state<MidiNote[]>([]);

  function extractBarChords(barNumber: number): string {
    const { bars } = parseProgression(song.chordProgression);
    const bar = bars.find(b => b.barNumber === barNumber);
    if (!bar) return '';
    return bar.entries
      .map(e => {
        switch (e.type) {
          case 'chord': return e.chord.raw;
          case 'repeat': return '%';
          case 'rest': return '_';
          case 'sustain': return '=';
        }
      })
      .join(' ');
  }

  function handleBarClick(barNumber: number) {
    selectedRange = { startBar: barNumber, endBar: barNumber };
    editingBarInitialChords = extractBarChords(barNumber);
    editingEndBar = null;
    editingBar = barNumber;
  }

  function handleRangeSelect(startBar: number, endBar: number) {
    selectedRange = { startBar, endBar };
    // Collect chords for all bars in range, separated by |
    const parts: string[] = [];
    for (let b = startBar; b <= endBar; b++) {
      parts.push(extractBarChords(b));
    }
    editingBarInitialChords = parts.join(' | ');
    editingEndBar = endBar;
    editingBar = startBar;
  }

  function handleChordEditOk(newChords: string) {
    if (editingBar === null) return;
    const { bars, comments } = parseProgression(song.chordProgression);

    const startBar = editingBar;
    const endBar = editingEndBar ?? editingBar;

    if (startBar === endBar) {
      // Single bar edit (original logic)
      const barIndex = bars.findIndex(b => b.barNumber === startBar);
      const newParsed = parseProgression(`| ${newChords} |`);
      const newEntries = newParsed.bars.length > 0 ? newParsed.bars[0].entries : [];

      if (barIndex !== -1) {
        bars[barIndex] = { barNumber: startBar, entries: newEntries };
      } else if (newChords.trim()) {
        const maxExisting = bars.length > 0 ? Math.max(...bars.map(b => b.barNumber)) : 0;
        for (let i = maxExisting + 1; i < startBar; i++) {
          bars.push({ barNumber: i, entries: [] });
        }
        bars.push({ barNumber: startBar, entries: newEntries });
        bars.sort((a, b) => a.barNumber - b.barNumber);
      }
    } else {
      // Multi-bar edit: split input by | into per-bar segments
      const segments = newChords.split('|').map(s => s.trim());
      const barCount = endBar - startBar + 1;

      for (let i = 0; i < barCount; i++) {
        const barNum = startBar + i;
        const segText = i < segments.length ? segments[i] : '';
        const newParsed = parseProgression(`| ${segText} |`);
        const newEntries = newParsed.bars.length > 0 ? newParsed.bars[0].entries : [];

        const barIndex = bars.findIndex(b => b.barNumber === barNum);
        if (barIndex !== -1) {
          bars[barIndex] = { barNumber: barNum, entries: newEntries };
        } else if (segText.trim()) {
          const maxExisting = bars.length > 0 ? Math.max(...bars.map(b => b.barNumber)) : 0;
          for (let j = maxExisting + 1; j < barNum; j++) {
            if (!bars.find(b => b.barNumber === j)) {
              bars.push({ barNumber: j, entries: [] });
            }
          }
          bars.push({ barNumber: barNum, entries: newEntries });
        }
      }
      bars.sort((a, b) => a.barNumber - b.barNumber);
    }

    song.chordProgression = serialize(bars, comments);
    emit();
    editingBar = null;
    editingEndBar = null;
    selectedRange = null;
  }

  function handleChordEditCancel() {
    editingBar = null;
    editingEndBar = null;
    selectedRange = null;
  }

  // --- AI Arrange state ---
  let arrangeOpen = $state(false);
  let arrangeGenre = $state('');
  let arrangeLoading = $state(false);

  // --- Playhead position ---
  let flowGridEl = $state<HTMLDivElement | null>(null);
  let measuredLabelWidth = $state(120);
  let measuredContentWidth = $state(0);

  // Measure actual grid column widths from the DOM
  $effect(() => {
    if (!flowGridEl) return;
    const observer = new ResizeObserver(() => {
      if (!flowGridEl) return;
      const cols = getComputedStyle(flowGridEl).gridTemplateColumns.split(/\s+/);
      if (cols.length >= 2) {
        measuredLabelWidth = parseFloat(cols[0]) || 120;
        // Sum all remaining columns (the bar columns are inside .row-content, but
        // the outer grid is "120px 1fr" — the 1fr is the content area width)
        measuredContentWidth = parseFloat(cols[1]) || 0;
      }
    });
    observer.observe(flowGridEl);
    return () => observer.disconnect();
  });

  let playheadLeft = $derived.by(() => {
    if (!totalDuration || totalDuration === 0 || currentTime < 0) return -1;
    const progress = currentTime / totalDuration;
    // Each bar is 140px (from CSS minmax(0, 140px))
    return measuredLabelWidth + progress * totalBars * 140;
  });

  // --- Computed totalBars ---
  // Derive totalBars from chord progression, sections, and track blocks
  let totalBars = $derived.by(() => {
    let max = 8;
    // Count bars from chord progression
    try {
      const parsed = parseProgression(song.chordProgression);
      const resolved = resolveRepeats(parsed.bars);
      if (resolved.length > max) max = resolved.length;
    } catch { /* ignore parse errors */ }
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
    onSongChange(JSON.parse(JSON.stringify(song)));
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

  function handlePopoverSave(directives: string, generatedMidi?: GeneratedMidiData) {
    if (!popoverBlock || !popoverTrack) return;
    const track = song.tracks.find(t => t.id === popoverTrack!.id);
    if (!track) return;
    const block = track.blocks.find(b => b.id === popoverBlock!.id);
    if (block) {
      block.directives = directives;
      block.generatedMidi = generatedMidi;
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

    const hasExistingMidi = song.tracks.some(t => t.blocks.some(b => b.generatedMidi));
    if (hasExistingMidi && !window.confirm('既存のトラックとMIDIデータが置き換えられます。続行しますか？')) {
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
      showToast('アレンジを生成しました（既存トラックは置き換えられました）', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'アレンジ生成に失敗しました';
      showToast(message, 'error');
    } finally {
      arrangeLoading = false;
    }
  }

  // --- Chord chart image import ---
  let importDialogOpen = $state(false);

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
    if (block && newEndBar > block.startBar) { // exclusive endBar must be > startBar
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
      generatedMidi: src.generatedMidi ? JSON.parse(JSON.stringify(src.generatedMidi)) : undefined,
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

  function handleTimelineClick(e: MouseEvent) {
    // Only handle clicks on empty grid background, not on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('.directive-block') || target.closest('.block-wrapper') ||
        target.closest('.track-label') || target.closest('.track-controls') ||
        target.closest('.chord-chip') || target.closest('.chord-cell') ||
        target.closest('.section-tag') || target.closest('.piano-roll-clickable') ||
        target.closest('.popover-overlay') || target.closest('.piano-roll-overlay') ||
        target.closest('button') || target.closest('select') || target.closest('input')) return;

    const flowContent = e.currentTarget as HTMLElement;
    const rect = flowContent.getBoundingClientRect();
    const scrollLeft = flowContent.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - measuredLabelWidth;

    if (x < 0) return; // clicked on label area

    const barWidth = 140; // matches minmax(0, 140px) in grid-template-columns
    const barPosition = x / barWidth; // fractional — not snapped to bar head

    if (barPosition >= 0 && barPosition < totalBars) {
      onSeekToBar?.(barPosition);
    }
  }

  function handleTimelineContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.directive-block') || target.closest('button')) return;

    e.preventDefault();

    const flowContent = e.currentTarget as HTMLElement;
    const rect = flowContent.getBoundingClientRect();
    const x = e.clientX - rect.left + flowContent.scrollLeft - measuredLabelWidth;
    if (x < 0 || measuredContentWidth <= 0) return;

    const barIndex = Math.floor(x / measuredContentWidth * totalBars);
    if (barIndex < 0 || barIndex >= totalBars) return;

    // Get chord for this bar and play preview
    const parsed = parseProgression(song.chordProgression);
    const resolved = resolveRepeats(parsed.bars);
    if (barIndex < resolved.length) {
      const bar = resolved[barIndex];
      for (const entry of bar.entries) {
        if (entry.type === 'chord') {
          playChordPreview(entry.chord.raw);
          break;
        }
      }
    }
  }

  function handleAddTrack() {
    const defaultPrograms = [0, 33, -1, 48, 25, 16];
    const usedPrograms = new Set(song.tracks.map(t => t.program ?? getDefaultProgram(t.instrument)));
    const nextProgram = defaultPrograms.find(p => !usedPrograms.has(p)) ?? 0;
    const name = findProgramName(nextProgram) ?? 'Piano';
    const instrument = findCategoryByProgram(nextProgram)?.instrument ?? 'piano';
    song.tracks.push({
      id: crypto.randomUUID(),
      name,
      instrument,
      program: nextProgram >= 0 ? nextProgram : undefined,
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
        aria-selected={activeTab === 'text'}
        class:tab--active={activeTab === 'text'}
        onclick={() => onTabChange?.('text')}
      >Text</button>
      <button
        class="tab"
        role="tab"
        aria-selected={activeTab === 'flow'}
        class:tab--active={activeTab === 'flow'}
        onclick={() => onTabChange?.('flow')}
      >Flow</button>
    </div>
    <!-- Right side: AI Arrange button -->
    <div class="tab-bar-right">
      {#if activeTab === 'text'}
        <button class="btn-import" onclick={() => importDialogOpen = true}>
          画像からインポート
        </button>
      {/if}
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
    <FlowMinimap {song} {totalBars} />
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flow-content" onclick={handleTimelineClick}>
      <!-- Grid layout: label column + timeline columns -->
      <div class="flow-grid" bind:this={flowGridEl}>
        <!-- Section row -->
        <div class="row-label">Section</div>
        <div class="row-content">
          <SectionBar
            sections={song.sections}
            totalBars={totalBars}
            onSectionNameChange={handleSectionNameChange}
            onSectionClick={(startBar) => onSeekToBar?.(startBar)}
          />
        </div>

        <!-- Chord row -->
        <div class="row-label">Chords</div>
        <div class="row-content chord-row">
          <ChordTimeline chords={song.chordProgression} totalBars={totalBars} musicalKey={song.key} onBarClick={handleBarClick} onBarSeek={(bar) => onSeekToBar?.(bar)} {selectedRange} onRangeSelect={handleRangeSelect} />
        </div>

        <!-- Separator -->
        <div class="row-separator"></div>
        <div class="row-separator"></div>

        <!-- Track rows -->
        {#each song.tracks as track (track.id)}
          <div class="row-label track-label">
            <select class="track-instrument-select"
              value={track.program ?? getDefaultProgram(track.instrument)}
              onchange={(e) => {
                const program = Number((e.target as HTMLSelectElement).value);
                const category = findCategoryByProgram(program);
                track.program = program >= 0 ? program : undefined;
                track.instrument = category?.instrument ?? 'piano';
                track.name = findProgramName(program) ?? track.instrument;
                emit();
              }}>
              {#each GM_CATEGORIES as cat}
                <optgroup label={cat.name}>
                  {#each cat.programs as prog}
                    <option value={prog.num}>{prog.name}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
            <div class="track-controls">
              <button class="track-ms-btn" class:track-ms-active={track.mute} onclick={() => handleTrackMute(track.id, !track.mute)} aria-label="ミュート" aria-pressed={track.mute}>M</button>
              <button class="track-ms-btn" class:track-ms-active={track.solo} onclick={() => handleTrackSolo(track.id, !track.solo)} aria-label="ソロ" aria-pressed={track.solo}>S</button>
            </div>
            <div class="track-volume-row">
              <svg class="volume-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <input type="range" class="track-volume" min="-30" max="6" value={track.volume} oninput={(e) => handleTrackVolume(track.id, Number((e.target as HTMLInputElement).value))} aria-label="音量" />
            </div>
          </div>
          <div class="row-content">
            <FlowTrackRow
              {track}
              totalBars={totalBars}
              {selectedRange}
              onBlockClick={(b) => handleBlockClick(b, track)}
              onBlockCreate={(s, e) => handleBlockCreate(track.id, s, e)}
              onBlockMove={(bid, s) => handleBlockMove(track.id, bid, s)}
              onBlockResize={(bid, e) => handleBlockResize(track.id, bid, e)}
              onBlockDelete={(bid) => handleBlockDelete(track.id, bid)}
              onBlockCopy={(bid, s) => handleBlockCopy(track.id, bid, s)}
            />
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="piano-roll-clickable" onclick={() => {
              const tn = trackNotes.get(track.id);
              if (tn?.notes?.length) {
                pianoRollTrackId = track.id;
                pianoRollNotes = tn.notes;
              }
            }}>
              <TrackPianoRollRow
                  notes={trackNotes.get(track.id)?.notes ?? []}
                  {totalBars}
                  bpm={song.bpm}
                  timeSignature={song.timeSignature}
                  color={TRACK_NOTE_COLORS[track.instrument] ?? '#e8a84c'}
                />
            </div>
          </div>
        {/each}

        <!-- Add track button -->
        <div class="row-label">
          <button class="add-track-btn" onclick={handleAddTrack}>+ Track</button>
        </div>
        <div class="row-content"></div>
      </div>
      {#if playheadLeft >= 0}
        <div class="playhead-line" style:left="{playheadLeft}px"></div>
      {/if}
    </div>

  {:else}
    <div class="text-view-container">
      <TextView {song} {onSongChange} {onSeekToBar} />
    </div>
  {/if}

  {#if editingBar !== null}
    <ChordEditDialog
      barNumber={editingBar}
      endBarNumber={editingEndBar ?? undefined}
      initialChords={editingBarInitialChords}
      musicalKey={song.key}
      onOk={handleChordEditOk}
      onCancel={handleChordEditCancel}
    />
  {/if}

  {#if popoverBlock && popoverTrack}
    <BlockPopover
      block={popoverBlock}
      trackName={popoverTrack.name}
      instrument={popoverTrack.instrument}
      sectionName={sectionNameForBar(popoverBlock.startBar)}
      {songId}
      chordProgression={song.chordProgression}
      bpm={song.bpm}
      timeSignature={song.timeSignature}
      onSave={handlePopoverSave}
      onClose={handlePopoverClose}
    />
  {/if}

  {#if importDialogOpen && songId}
    <ImportDialog
      songId={songId}
      bpm={song.bpm}
      timeSignature={song.timeSignature}
      key={song.key}
      onImport={(data) => {
        song.chordProgression = data.chords;
        if (data.title) song.title = data.title;
        if (data.bpm) song.bpm = data.bpm;
        const parsedSections = parseSectionsFromChords(data.chords);
        if (parsedSections.length > 0) {
          song.sections = parsedSections;
        }
        // Auto-create a default piano track if no tracks exist
        if (song.tracks.length === 0) {
          song.tracks = [{
            id: crypto.randomUUID(),
            name: 'Acoustic Grand',
            instrument: 'piano',
            program: 0,
            blocks: [],  // Empty — user drags to create blocks
            volume: 0,
            mute: false,
            solo: false,
          }];
        }
        onSongChange(JSON.parse(JSON.stringify(song)));
        showToast('コード進行をインポートしました', 'success');
        importDialogOpen = false;
      }}
      onClose={() => importDialogOpen = false}
    />
  {/if}

  {#if pianoRollTrackId}
    <PianoRollEditor
      notes={pianoRollNotes}
      {totalBars}
      bpm={song.bpm}
      timeSignature={song.timeSignature}
      chordProgression={song.chordProgression}
      musicalKey={song.key}
      onNotesChange={(newNotes) => {
        pianoRollNotes = newNotes;
      }}
      onClose={() => pianoRollTrackId = null}
      onSeekToBar={onSeekToBar}
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

  .btn-import {
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

  .btn-import:hover:not(:disabled) {
    background: rgba(232, 168, 76, 0.18);
    border-color: rgba(232, 168, 76, 0.5);
  }

  .btn-import:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
    position: relative;
  }

  .playhead-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent-primary);
    opacity: 0.7;
    z-index: 10;
    pointer-events: none;
  }

  .flow-grid {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0;
    min-width: max-content;
    padding-right: 50vw; /* Allow scrolling content to left edge */
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
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    color: var(--text-secondary);
    font-weight: 600;
    min-height: 56px;
    padding: var(--space-xs) var(--space-sm);
  }

  .track-instrument-select {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 4px;
    cursor: pointer;
    outline: none;
    width: 100%;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    padding-right: 14px;
  }
  .track-instrument-select:hover {
    border-color: var(--border-default);
    background-color: var(--bg-elevated);
  }
  .track-instrument-select:focus {
    border-color: var(--accent-primary);
  }
  .track-instrument-select optgroup {
    font-weight: 600;
    color: var(--text-muted);
  }
  .track-instrument-select option {
    font-weight: 400;
    color: var(--text-primary);
  }

  .track-controls {
    display: flex;
    gap: 2px;
  }

  .track-ms-btn {
    padding: 2px 6px;
    border: 1px solid var(--border-subtle);
    border-radius: 3px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.6rem;
    font-weight: 700;
    cursor: pointer;
    line-height: 1;
  }
  .track-ms-btn:hover {
    background: var(--bg-elevated);
  }
  .track-ms-active {
    background: rgba(232, 168, 76, 0.2);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .track-volume-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .volume-icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .track-volume {
    width: 100%;
    height: 2px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--bg-elevated);
    border-radius: 1px;
    outline: none;
    border: none;
    cursor: pointer;
  }
  .track-volume:focus-visible {
    outline: none;
  }
  .track-volume::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    cursor: pointer;
    border: none;
    box-shadow: none;
  }
  .track-volume:hover::-webkit-slider-thumb {
    background: var(--text-secondary);
  }
  .track-volume::-moz-range-thumb {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    cursor: pointer;
    border: none;
  }

  .row-content {
    min-height: 36px;
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

  /* ---- Piano roll clickable ---- */
  .piano-roll-clickable {
    cursor: pointer;
  }
  .piano-roll-clickable:hover {
    outline: 1px solid rgba(232, 168, 76, 0.3);
    border-radius: 4px;
  }

  /* ---- Text view container ---- */
  .text-view-container {
    display: flex;
    flex: 1;
    min-height: 200px;
  }
</style>
