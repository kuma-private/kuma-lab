<script lang="ts">
  import { parseProgression, parseChord, serialize, type ParsedBar, type BarEntry } from '$lib/chord-parser';
  import { chordToDegree } from '$lib/chord-degree';

  let {
    barNumber,
    endBarNumber,
    initialChords = '',
    musicalKey = 'C Major',
    onOk,
    onCancel,
  }: {
    barNumber: number;
    endBarNumber?: number;
    initialChords: string;
    musicalKey?: string;
    onOk: (chords: string) => void;
    onCancel: () => void;
  } = $props();

  let isRange = $derived(endBarNumber != null && endBarNumber > barNumber);
  let rangeLabel = $derived(isRange ? `小節 ${barNumber}\u2013${endBarNumber}` : `小節 ${barNumber}`);

  let input = $state(initialChords);
  let selectedRoot = $state<string | null>(null);
  let sharpFlat = $state<'' | '#' | 'b'>('');
  let flashedNote = $state<string | null>(null);

  // Parse input for preview
  let preview = $derived.by(() => {
    if (!input.trim()) return [];
    try {
      const result = parseProgression(`| ${input} |`);
      if (result.bars.length === 0) return [];
      const bar = result.bars[0];
      return bar.entries
        .filter((e: BarEntry) => e.type === 'chord')
        .map(e => {
          const chord = (e as Extract<BarEntry, { type: 'chord' }>).chord;
          return {
            raw: chord.raw,
            root: chord.root as string,
            degree: chordToDegree(chord.raw, musicalKey),
          };
        });
    } catch {
      return [];
    }
  });

  const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const qualities = ['', 'm', '7', 'maj7', 'm7', 'dim', 'sus4', 'add9', 'aug', 'm7b5'];

  // Circle of Fifths data
  const cofMajor = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
  const cofMinor = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];

  // Note name normalization for diatonic detection
  const ENHARMONIC: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
    'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
    'C#': 'C#', 'D#': 'D#', 'F#': 'F#', 'G#': 'G#', 'A#': 'A#',
  };
  const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

  function normalizeNote(n: string): string {
    return ENHARMONIC[n] ?? n;
  }

  // Compute diatonic notes from musicalKey
  let diatonicNotes = $derived.by(() => {
    const trimmed = musicalKey.trim();
    const isMinor = /\bminor\b/i.test(trimmed);
    const rootStr = trimmed.replace(/\s*(major|minor|dorian|mixolydian|lydian|phrygian|locrian|aeolian|ionian)$/i, '').trim();
    const rootIdx = ALL_NOTES.indexOf(normalizeNote(rootStr));
    if (rootIdx === -1) return new Set<string>();
    const intervals = isMinor ? MINOR_SCALE : MAJOR_SCALE;
    return new Set(intervals.map(i => ALL_NOTES[(rootIdx + i) % 12]));
  });

  function isDiatonic(note: string): boolean {
    // Strip 'm' suffix for minor notes in inner circle
    const root = note.replace(/m$/, '');
    return diatonicNotes.has(normalizeNote(root));
  }

  function cofSelectRoot(note: string) {
    // For minor notes like "Am", extract root "A" and set sharpFlat, then selectedRoot
    const isMinor = note.endsWith('m') && note.length > 1 && note[note.length - 2] !== '#' && note[note.length - 2] !== 'b'
      ? true
      : note.endsWith('m') && note.length > 2
        ? true
        : false;

    let root: string;
    if (isMinor) {
      root = note.slice(0, -1); // e.g. "F#m" -> "F#", "Am" -> "A"
    } else {
      root = note;
    }

    // Parse root into base + accidental
    if (root.length > 1 && (root[1] === '#' || root[1] === 'b')) {
      selectedRoot = root[0];
      sharpFlat = root[1] as '#' | 'b';
    } else {
      selectedRoot = root;
      sharpFlat = '';
    }

    // Flash animation
    flashedNote = note;
    setTimeout(() => { flashedNote = null; }, 200);

    // If minor from inner circle, auto-append 'm' chord immediately
    if (isMinor) {
      // Wait a tick so selectedRoot is set, then append
      const chord = root + 'm';
      input = input.trim() ? input.trim() + ' ' + chord : chord;
      selectedRoot = null;
      sharpFlat = '';
    }
  }

  function appendChord(quality: string) {
    if (!selectedRoot) return;
    const chord = selectedRoot + sharpFlat + quality;
    input = input.trim() ? input.trim() + ' ' + chord : chord;
    selectedRoot = null;
    sharpFlat = '';
  }

  function selectRoot(root: string) {
    selectedRoot = root;
  }

  function toggleSharpFlat(type: '#' | 'b') {
    sharpFlat = sharpFlat === type ? '' : type;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onOk(input.trim());
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('chord-dialog-overlay')) {
      onCancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="chord-dialog-overlay" role="dialog" aria-modal="true" aria-label="{rangeLabel} のコードを編集" onclick={handleOverlayClick} onkeydown={handleKeydown}>
  <div class="chord-dialog">
    <!-- Header -->
    <div class="chord-dialog-header">
      <span class="chord-dialog-title">{rangeLabel} のコードを編集</span>
      <button class="chord-dialog-close" onclick={onCancel} aria-label="閉じる">&times;</button>
    </div>

    <!-- Body -->
    <div class="chord-dialog-body">
      <!-- Text input -->
      <input
        type="text"
        class="chord-input"
        bind:value={input}
        placeholder="例: Dm C, Am7 Dm7 G7 Cmaj7"
        onkeydown={handleKeydown}
      />

      <!-- Preview -->
      {#if preview.length > 0}
        <div class="chord-preview">
          <div class="chord-preview-chips">
            {#each preview as item}
              <span class="chord-chip" data-root={item.root}>{item.raw}</span>
            {/each}
          </div>
          <div class="chord-preview-degrees">
            {#each preview as item}
              <span class="chord-degree-label">{item.degree}</span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Quick input -->
      <div class="quick-input-section">
        <div class="quick-input-label">クイック入力</div>

        <!-- Circle of Fifths -->
        <div class="cof-container">
          <svg viewBox="0 0 200 200" class="circle-of-fifths">
            <!-- Outer circle: major keys -->
            {#each cofMajor as note, i}
              {@const angle = (i * 30 - 90) * Math.PI / 180}
              {@const x = 100 + 82 * Math.cos(angle)}
              {@const y = 100 + 82 * Math.sin(angle)}
              <g
                class="cof-note-group"
                onclick={() => cofSelectRoot(note)}
                role="button"
                tabindex="0"
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') cofSelectRoot(note); }}
              >
                <circle
                  cx={x} cy={y} r="13"
                  class="cof-bg"
                  class:cof-bg--diatonic={isDiatonic(note)}
                  class:cof-bg--selected={selectedRoot === note && sharpFlat === ''}
                  class:cof-bg--flash={flashedNote === note}
                />
                <text
                  {x} {y}
                  class="cof-note"
                  class:cof-note--diatonic={isDiatonic(note)}
                >{note}</text>
              </g>
            {/each}
            <!-- Inner circle: minor keys -->
            {#each cofMinor as note, i}
              {@const angle = (i * 30 - 90) * Math.PI / 180}
              {@const x = 100 + 52 * Math.cos(angle)}
              {@const y = 100 + 52 * Math.sin(angle)}
              <g
                class="cof-note-group"
                onclick={() => cofSelectRoot(note)}
                role="button"
                tabindex="0"
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') cofSelectRoot(note); }}
              >
                <circle
                  cx={x} cy={y} r="13"
                  class="cof-bg"
                  class:cof-bg--diatonic={isDiatonic(note)}
                  class:cof-bg--flash={flashedNote === note}
                />
                <text
                  {x} {y}
                  class="cof-note cof-note--minor"
                  class:cof-note--diatonic={isDiatonic(note)}
                >{note}</text>
              </g>
            {/each}
          </svg>
        </div>

        <!-- Root selection (flat row) -->
        <div class="quick-input-row">
          {#each roots as root}
            <button
              class="quick-btn root-btn"
              class:quick-btn--active={selectedRoot === root}
              onclick={() => selectRoot(root)}
            >{root}</button>
          {/each}
          <span class="quick-separator"></span>
          <button
            class="quick-btn accidental-btn"
            class:quick-btn--active={sharpFlat === '#'}
            onclick={() => toggleSharpFlat('#')}
          >#</button>
          <button
            class="quick-btn accidental-btn"
            class:quick-btn--active={sharpFlat === 'b'}
            onclick={() => toggleSharpFlat('b')}
          >b</button>
        </div>

        <!-- Quality selection -->
        <div class="quick-input-row">
          {#each qualities as q}
            <button
              class="quick-btn quality-btn"
              disabled={!selectedRoot}
              onclick={() => appendChord(q)}
            >{q || 'M'}</button>
          {/each}
        </div>

        {#if selectedRoot}
          <div class="root-indicator">
            選択中: <strong>{selectedRoot}{sharpFlat}</strong>
          </div>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="chord-dialog-footer">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button class="btn-ok" onclick={() => onOk(input.trim())}>OK</button>
    </div>
  </div>
</div>

<style>
  .chord-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chord-dialog {
    z-index: calc(var(--z-modal) + 1);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    width: 420px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .chord-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .chord-dialog-title {
    font-family: var(--font-sans);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .chord-dialog-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .chord-dialog-close:hover {
    color: var(--text-primary);
  }

  .chord-dialog-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .chord-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 0.9rem;
    font-family: var(--font-mono);
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    box-sizing: border-box;
  }
  .chord-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }
  .chord-input::placeholder {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  /* Preview */
  .chord-preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: var(--bg-base);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }

  .chord-preview-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chord-preview-degrees {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chord-degree-label {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    min-width: 64px;
    text-align: center;
  }

  /* Quick input */
  .quick-input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .quick-input-label {
    font-family: var(--font-sans);
    font-size: 0.72rem;
    color: var(--text-muted);
    text-align: center;
    position: relative;
  }
  .quick-input-label::before,
  .quick-input-label::after {
    content: '';
    flex: 1;
    display: inline-block;
    width: 30%;
    height: 1px;
    background: var(--border-subtle);
    vertical-align: middle;
    margin: 0 8px;
  }

  .quick-input-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .quick-separator {
    width: 1px;
    height: 24px;
    background: var(--border-subtle);
    margin: 0 2px;
    align-self: center;
  }

  .quick-btn {
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: 4px;
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.12s;
    min-width: 32px;
    text-align: center;
  }
  .quick-btn:hover:not(:disabled) {
    background: rgba(232, 168, 76, 0.1);
    border-color: rgba(232, 168, 76, 0.3);
    color: var(--accent-warm);
  }
  .quick-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .quick-btn--active {
    background: rgba(232, 168, 76, 0.18);
    border-color: var(--accent-primary);
    color: var(--accent-warm);
  }

  /* Circle of Fifths */
  .cof-container {
    display: flex;
    justify-content: center;
  }

  .circle-of-fifths {
    width: 200px;
    height: 200px;
    flex-shrink: 0;
  }

  .cof-note-group {
    cursor: pointer;
  }

  .cof-bg {
    fill: transparent;
    transition: fill 0.12s;
  }
  .cof-bg--diatonic {
    fill: rgba(232, 168, 76, 0.08);
  }
  .cof-note-group:hover .cof-bg {
    fill: rgba(232, 168, 76, 0.18);
  }
  .cof-bg--selected {
    fill: rgba(232, 168, 76, 0.25);
  }
  .cof-bg--flash {
    fill: rgba(232, 168, 76, 0.5);
    transition: none;
  }

  .cof-note {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    fill: var(--text-secondary);
    text-anchor: middle;
    dominant-baseline: central;
    user-select: none;
  }
  .cof-note--diatonic {
    fill: var(--accent-primary);
    font-weight: 600;
  }
  .cof-note--minor {
    font-size: 0.45rem;
  }

  @media (max-width: 400px) {
    .cof-container {
      display: none;
    }
  }

  .root-indicator {
    text-align: center;
    font-family: var(--font-sans);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .root-indicator strong {
    color: var(--accent-warm);
  }

  /* Footer */
  .chord-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
  }

  .btn-cancel {
    padding: 6px 16px;
    font-size: 0.78rem;
    font-family: var(--font-sans);
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-cancel:hover {
    background: var(--bg-elevated);
  }

  .btn-ok {
    padding: 6px 20px;
    font-size: 0.78rem;
    font-family: var(--font-sans);
    font-weight: 600;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent-primary);
    color: #fff;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-ok:hover {
    opacity: 0.9;
  }
</style>
