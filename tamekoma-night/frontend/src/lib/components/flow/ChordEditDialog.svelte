<script lang="ts">
  import { parseProgression, parseChord, serialize, type ParsedBar, type BarEntry } from '$lib/chord-parser';
  import { chordToDegree } from '$lib/chord-degree';

  let {
    barNumber,
    initialChords = '',
    musicalKey = 'C Major',
    onOk,
    onCancel,
  }: {
    barNumber: number;
    initialChords: string;
    musicalKey?: string;
    onOk: (chords: string) => void;
    onCancel: () => void;
  } = $props();

  let input = $state(initialChords);
  let selectedRoot = $state<string | null>(null);
  let sharpFlat = $state<'' | '#' | 'b'>('');

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
<div class="chord-dialog-overlay" role="dialog" aria-modal="true" aria-label="小節 {barNumber} のコードを編集" onclick={handleOverlayClick} onkeydown={handleKeydown}>
  <div class="chord-dialog">
    <!-- Header -->
    <div class="chord-dialog-header">
      <span class="chord-dialog-title">小節 {barNumber} のコードを編集</span>
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

        <!-- Root selection -->
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
