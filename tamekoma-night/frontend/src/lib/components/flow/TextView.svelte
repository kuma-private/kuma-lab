<script lang="ts">
  import type { Song } from '$lib/types/song';
  import { serializeSong, deserializeSong, mergeParsedSong } from '$lib/song-serializer';
  import { parseProgression, resolveRepeats, type ParsedBar } from '$lib/chord-parser';
  import { chordToDegree } from '$lib/chord-degree';
  import { playChordPreview } from '$lib/chord-player';
  import '$lib/styles/chord-colors.css';

  let {
    song,
    onSongChange,
    onSeekToBar,
  }: {
    song: Song;
    onSongChange: (song: Song) => void;
    onSeekToBar?: (barIndex: number) => void;
  } = $props();

  // Serialize song to text on mount / when song changes externally
  let text = $state(serializeSong(song));
  let parseErrors = $state<{ line: number; message: string }[]>([]);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Playback state
  let isPlaying = $state(false);
  let playingBarIndex = $state(-1);

  // Track whether the last change came from the textarea (internal)
  // to avoid re-serializing when we just deserialized
  let internalEdit = false;

  // Preview state
  let previewSong = $state<Partial<Song>>({
    title: song.title,
    bpm: song.bpm,
    key: song.key,
    timeSignature: song.timeSignature,
    chordProgression: song.chordProgression,
    sections: song.sections,
    tracks: song.tracks,
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

  // Derived: bars grouped by original text line, with section labels.
  // We extract the chords section from the raw `text` (which includes ### headers)
  // so that section markers can be tracked alongside chord lines.
  let lineGroupedBarsWithLabels = $derived.by(() => {
    // Extract the chords section from the raw text
    const rawLines = text.split('\n');
    let inChords = false;
    const chordSectionLines: string[] = [];
    for (const raw of rawLines) {
      const trimmed = raw.trim();
      // Detect ## Chords or === Chords === header
      if (/^##\s+Chords$/i.test(trimmed) || /^===\s*Chords\s*===$/i.test(trimmed)) {
        inChords = true;
        continue;
      }
      // Detect next section header — stop collecting chord lines
      if (inChords && (/^##\s+/.test(trimmed) || /^===\s*.+\s*===/.test(trimmed))) {
        break;
      }
      if (inChords) {
        chordSectionLines.push(raw);
      }
    }

    const lines: ParsedBar[][] = [];
    const labels: ({ name: string; startBar: number } | null)[] = [];
    let barOffset = 0;
    let pendingSection: string | null = null;

    for (const raw of chordSectionLines) {
      const trimmed = raw.trim();
      if (!trimmed) {
        // Empty line — preserve spacing
        if (lines.length > 0) {
          lines.push([]);
          labels.push(null);
        }
        continue;
      }

      // Section header: ### SectionName, // SectionName, or # SectionName
      const sectionMatch = trimmed.match(/^###\s+(.+)$/) ?? trimmed.match(/^\/\/\s*(.+)$/) ?? trimmed.match(/^#\s+(.+)$/);
      if (sectionMatch) {
        pendingSection = sectionMatch[1].trim();
        continue;
      }

      // Chord line
      try {
        const { bars } = parseProgression(trimmed);
        const resolved = resolveRepeats(bars);
        const renumbered = resolved.map((b, i) => ({
          ...b,
          barNumber: barOffset + i + 1,
        }));
        lines.push(renumbered);

        if (pendingSection) {
          labels.push({ name: pendingSection, startBar: barOffset });
          pendingSection = null;
        } else {
          labels.push(null);
        }

        barOffset += resolved.length;
      } catch {
        // Skip unparseable lines
      }
    }

    return { lines, labels };
  });

  let lineGroupedBars = $derived(lineGroupedBarsWithLabels.lines);
  let lineSectionLabels = $derived(lineGroupedBarsWithLabels.labels);

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

    <!-- Chord progression grouped by text line -->
    {#if parsedBars.length > 0}
      <div class="preview-chords">
        {#each lineGroupedBars as line, i}
          {#if lineSectionLabels[i]}
            <button
              class="section-label"
              class:section-label--clickable={!!onSeekToBar}
              onclick={() => onSeekToBar?.(lineSectionLabels[i]!.startBar)}
            >{lineSectionLabels[i]!.name}</button>
          {/if}
          {#if line.length > 0}
            <div class="chord-line">
              <span class="bar-line">|</span>
              {#each line as bar}
                <button
                  class="preview-bar"
                  class:preview-bar--clickable={!!onSeekToBar}
                  onclick={() => onSeekToBar?.(bar.barNumber - 1)}
                >
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
                </button>
                <span class="bar-line">|</span>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <!-- Tracks -->
    {#if (previewSong.tracks ?? []).length > 0}
      <h3 class="preview-section-title">Tracks</h3>
      <div class="preview-tracks">
        {#each previewSong.tracks ?? [] as track}
          <div class="track-card">
            <span class="track-name">{track.name}</span>
            <span class="track-instrument">{track.instrument}</span>
          </div>
        {/each}
        <div class="tracks-info">トラックの追加・削除は Flow タブで行ってください</div>
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

  /* ── Chord section ── */
  .preview-chords {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .section-label {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-xs);
    padding-left: var(--space-sm);
    border-left: 3px solid var(--accent, #6366f1);
    background: none;
    border-top: none;
    border-right: none;
    border-bottom: none;
    text-align: left;
    transition: color 0.15s;
  }

  .section-label--clickable {
    cursor: pointer;
  }

  .section-label--clickable:hover {
    color: var(--text-primary);
  }

  .chord-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .bar-line {
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: 1.1em;
    opacity: 0.4;
    font-weight: 400;
    user-select: none;
  }

  .preview-bar {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .preview-bar--clickable {
    cursor: pointer;
  }

  .preview-bar--clickable:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .preview-bar--clickable:hover .chord-chip {
    filter: brightness(1.2);
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

  /* ── Section title ── */
  .preview-section-title {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: var(--space-sm) 0 var(--space-xs);
  }

  /* ── Track cards ── */
  .preview-tracks {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .track-card {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--bg-surface);
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
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

  .tracks-info {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-style: italic;
    padding: 0 var(--space-md);
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
