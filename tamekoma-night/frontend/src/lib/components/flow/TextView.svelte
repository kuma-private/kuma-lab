<script lang="ts">
  import type { Song, Section, Track } from '$lib/types/song';
  import { serializeSong, deserializeSong, mergeParsedSong } from '$lib/song-serializer';
  import { parseProgression, resolveRepeats, type ParsedBar } from '$lib/chord-parser';
  import { chordToDegree } from '$lib/chord-degree';
  import '$lib/styles/chord-colors.css';

  let {
    song,
    onSongChange,
  }: {
    song: Song;
    onSongChange: (song: Song) => void;
  } = $props();

  // Serialize song to text on mount / when song changes externally
  let text = $state(serializeSong(song));
  let parseErrors = $state<{ line: number; message: string }[]>([]);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Track whether the last change came from the textarea (internal)
  // to avoid re-serializing when we just deserialized
  let internalEdit = false;

  // Preview state — kept in a $state bag so edits can mutate it locally
  // before `onSongChange` commits, but synced against the prop below so
  // external song updates don't get masked by the stale initial snapshot.
  let previewSong = $state<Partial<Song>>({
    title: song.title,
    bpm: song.bpm,
    key: song.key,
    timeSignature: song.timeSignature,
    chordProgression: song.chordProgression,
    sections: song.sections,
    tracks: song.tracks,
  });

  // Re-sync local state on external song updates (e.g. parent reload, AI
  // arrange result, other tab commits). Skip when the last change came
  // from our own textarea — that path is already deserialized back into
  // `song` via `onSongChange`. Fixes Svelte 5 `state_referenced_locally`.
  $effect(() => {
    if (internalEdit) return;
    text = serializeSong(song);
    previewSong = {
      title: song.title,
      bpm: song.bpm,
      key: song.key,
      timeSignature: song.timeSignature,
      chordProgression: song.chordProgression,
      sections: song.sections,
      tracks: song.tracks,
    };
  });

  // Derived: parsed chord bars for preview
  let parsedBars = $derived.by(() => {
    const prog = previewSong.chordProgression ?? '';
    if (!prog.trim()) return [] as ParsedBar[];
    try {
      const { bars } = parseProgression(prog);
      return resolveRepeats(bars);
    } catch {
      return [] as ParsedBar[];
    }
  });

  // Derived: group bars by section
  let sectionedBars = $derived.by(() => {
    const sections = (previewSong.sections ?? []).slice().sort((a, b) => a.startBar - b.startBar);
    const bars = parsedBars;

    if (sections.length === 0 && bars.length > 0) {
      return [{ section: null as Section | null, bars }];
    }

    const groups: { section: Section | null; bars: ParsedBar[] }[] = [];

    for (const sec of sections) {
      // bars are 1-based barNumber; section.startBar is 0-based, endBar is exclusive
      const sectionBars = bars.filter(
        (b) => b.barNumber > sec.startBar && b.barNumber <= sec.endBar
      );
      groups.push({ section: sec, bars: sectionBars });
    }

    // Any bars not covered by sections
    const coveredBarNums = new Set(groups.flatMap((g) => g.bars.map((b) => b.barNumber)));
    const uncovered = bars.filter((b) => !coveredBarNums.has(b.barNumber));
    if (uncovered.length > 0) {
      groups.unshift({ section: null, bars: uncovered });
    }

    return groups;
  });

  // Sync: when song prop changes from outside, re-serialize
  $effect(() => {
    // Read song to create dependency
    const _s = song;
    if (!internalEdit) {
      text = serializeSong(_s);
      parseErrors = [];
      previewSong = {
        title: _s.title,
        bpm: _s.bpm,
        key: _s.key,
        timeSignature: _s.timeSignature,
        chordProgression: _s.chordProgression,
        sections: _s.sections,
        tracks: _s.tracks,
      };
    }
    internalEdit = false;
  });

  function handleInput(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    text = textarea.value;

    // Clear previous timer
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }

    // Debounce parse + callback
    debounceTimer = setTimeout(() => {
      const { song: parsed, errors } = deserializeSong(text);
      parseErrors = errors;
      previewSong = parsed;
      internalEdit = true;
      onSongChange(mergeParsedSong(song, parsed));
    }, 300);
  }

  function handleKeydown(event: KeyboardEvent) {
    // Tab inserts spaces instead of changing focus
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = event.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      textarea.value = value.substring(0, start) + '  ' + value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      // Trigger input handling
      text = textarea.value;
      handleInput(event as unknown as Event);
    }
  }

  function degreeFor(chordRaw: string): string {
    const key = previewSong.key ?? 'C Major';
    try {
      return chordToDegree(chordRaw, key);
    } catch {
      return '';
    }
  }

  function directiveSummary(directives: string): string[] {
    if (!directives.trim()) return [];
    return directives
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
</script>

<div class="text-view-2pane">
  <!-- Left: Text Editor -->
  <div class="pane-left">
    <textarea
      class="text-editor"
      value={text}
      oninput={handleInput}
      onkeydown={handleKeydown}
      spellcheck={false}
      autocomplete="off"
      data-autocorrect="off"
      autocapitalize="off"
    ></textarea>
  </div>

  <!-- Divider -->
  <div class="pane-divider"></div>

  <!-- Right: Preview -->
  <div class="pane-right">
    {#if parseErrors.length > 0}
      <div class="preview-errors">
        {#each parseErrors as err}
          <div class="preview-error-item">
            <span class="error-line">L{err.line}</span>
            <span class="error-msg">{err.message}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Meta info -->
    <div class="preview-meta">
      <div class="meta-title">{previewSong.title || 'Untitled'}</div>
      <div class="meta-details">
        {previewSong.bpm ?? 120} BPM / {previewSong.key ?? 'C Major'} / {previewSong.timeSignature ?? '4/4'}
      </div>
    </div>

    <!-- Chord progression by section -->
    {#if parsedBars.length > 0}
      <div class="preview-chords">
        {#each sectionedBars as group}
          {#if group.bars.length > 0}
            <div class="preview-section">
              {#if group.section}
                <div class="section-label">{group.section.name}</div>
              {/if}
              <div class="section-bars">
                <span class="bar-line">|</span>
                {#each group.bars as bar}
                  <span class="preview-bar">
                    {#each bar.entries as entry}
                      {#if entry.type === 'chord'}
                        <span class="chord-chip" data-root={entry.chord.root}>
                          <span class="chip-name">{entry.chord.raw}</span>
                          <span class="chip-degree">{degreeFor(entry.chord.raw)}</span>
                        </span>
                      {:else if entry.type === 'rest'}
                        <span class="entry-rest">_</span>
                      {:else if entry.type === 'sustain'}
                        <span class="entry-sustain">=</span>
                      {/if}
                    {/each}
                  </span>
                  <span class="bar-line">|</span>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <!-- Track blocks -->
    {#if (previewSong.tracks ?? []).length > 0}
      <div class="preview-tracks">
        {#each previewSong.tracks ?? [] as track}
          <div class="track-card">
            <div class="track-header">
              <span class="track-name">{track.name}</span>
              <span class="track-instrument">{track.instrument}</span>
            </div>
            {#if track.blocks.length > 0}
              <div class="track-blocks">
                {#each track.blocks.slice().sort((a, b) => a.startBar - b.startBar) as block}
                  <div class="block-item">
                    <span class="block-range">bars {block.startBar + 1}-{block.endBar}</span>
                    {#each directiveSummary(block.directives) as line}
                      <span class="block-directive">{line}</span>
                    {/each}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="track-empty">No blocks</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Empty state -->
    {#if parsedBars.length === 0 && (previewSong.tracks ?? []).length === 0}
      <div class="preview-empty">
        Start typing in the editor to see a live preview.
      </div>
    {/if}
  </div>
</div>

<style>
  .text-view-2pane {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Left pane ── */
  .pane-left {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .text-editor {
    flex: 1;
    width: 100%;
    min-height: 300px;
    padding: var(--space-md);
    background: var(--bg-surface);
    color: var(--text-primary);
    border: none;
    outline: none;
    resize: none;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
  }

  .text-editor::placeholder {
    color: var(--text-muted);
  }

  /* ── Divider ── */
  .pane-divider {
    width: 1px;
    background: var(--border-subtle);
  }

  /* ── Right pane ── */
  .pane-right {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-card);
    overflow-y: auto;
    min-width: 0;
    min-height: 0;
  }

  /* ── Parse errors ── */
  .preview-errors {
    padding: var(--space-xs) var(--space-sm);
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: 6px;
  }

  .preview-error-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding: 2px 0;
    font-size: 0.72rem;
    font-family: var(--font-mono);
  }

  .error-line {
    color: rgba(220, 38, 38, 0.8);
    font-weight: 600;
    flex-shrink: 0;
  }

  .error-msg {
    color: var(--text-secondary);
  }

  /* ── Meta info ── */
  .preview-meta {
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-surface);
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
  }

  .meta-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  .meta-details {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  /* ── Chord section ── */
  .preview-chords {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-bars {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .bar-line {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    opacity: 0.4;
    user-select: none;
  }

  .preview-bar {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
  }

  /* chord-chip styles are imported from chord-colors.css */

  .chip-name {
    font-size: 0.85rem;
  }

  .chip-degree {
    font-size: 0.65rem;
    opacity: 0.6;
    margin-left: 2px;
  }

  .entry-rest,
  .entry-sustain {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 4px 8px;
  }

  /* ── Track cards ── */
  .preview-tracks {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .track-card {
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-surface);
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
  }

  .track-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    margin-bottom: 4px;
  }

  .track-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  .track-instrument {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .track-blocks {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .block-item {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-xs);
    font-size: 0.78rem;
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }

  .block-range {
    color: var(--text-muted);
    font-weight: 500;
  }

  .block-directive {
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .track-empty {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* ── Empty state ── */
  .preview-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
