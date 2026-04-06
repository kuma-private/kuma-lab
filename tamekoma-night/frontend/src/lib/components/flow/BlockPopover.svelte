<script lang="ts">
  import { parseDirectives, type ParsedDirectives, type VelocityLevel } from '$lib/directive-parser';
  import type { DirectiveBlock } from '$lib/types/song';
  import { suggestDirectives } from '$lib/api';
  import { showToast } from '$lib/stores/toast.svelte';
  import MiniPianoRoll from './MiniPianoRoll.svelte';

  interface Props {
    block: DirectiveBlock;
    trackName: string;
    instrument: string;
    sectionName: string;
    songId?: string;
    chordProgression?: string;
    onSave: (directives: string) => void;
    onClose: () => void;
    onPreview?: () => void;
  }

  const MODE_CHIPS = ['block', 'arpUp', 'arpDown', 'bossa', 'jazz', '8beat'] as const;

  const VOICING_SNAPS = [
    { value: 0,   name: 'close' },
    { value: 25,  name: 'open' },
    { value: 50,  name: 'drop2' },
    { value: 75,  name: 'spread' },
    { value: 100, name: 'shell' },
  ] as const;

  const VELOCITY_SNAPS = [
    { value: 0,   name: 'pp' },
    { value: 20,  name: 'p' },
    { value: 40,  name: 'mp' },
    { value: 60,  name: 'mf' },
    { value: 80,  name: 'f' },
    { value: 100, name: 'ff' },
  ] as const;

  const HUMANIZE_MIN = 0;
  const HUMANIZE_MAX = 30;
  const SWING_MIN = 0;
  const SWING_MAX = 70;

  let {
    block,
    trackName,
    instrument,
    sectionName,
    songId,
    chordProgression,
    onSave,
    onClose,
    onPreview,
  }: Props = $props();

  // --- State ---
  let parsed = $state(parseDirectives(block.directives));
  let directives: ParsedDirectives = $state(parsed.directives);
  let rawText = $state(directivesToText(directives));
  let rawOpen = $state(false);
  let parseErrors: string[] = $state([]);
  let aiPrompt = $state('');
  let aiLoading = $state(false);
  let aiError = $state<string | null>(null);

  // --- Free mode / melody ---
  let isFreeMode = $derived(directives.mode === 'free');
  let melodyText = $state(directives.melody ? extractMelodyText(block.directives) : '');

  // --- Slider state (continuous values) ---
  let voicingSlider = $state(voicingNameToValue(directives.voicing));
  let velocitySlider = $state(velocityNameToValue(typeof directives.velocity === 'string' ? directives.velocity : 'mf'));

  // --- Derived ---
  let headerLabel = $derived.by(() => {
    const hasBars = block.startBar !== undefined && block.endBar !== undefined && block.endBar > block.startBar;
    const bars = hasBars ? ` (bars ${block.startBar + 1}–${block.endBar})` : '';
    return `${trackName}${sectionName ? ` — ${sectionName}` : ''}${bars}`;
  });

  let snappedVoicing = $derived.by(() => snapToNearest(voicingSlider, VOICING_SNAPS));
  let snappedVelocity = $derived.by(() => snapToNearest(velocitySlider, VELOCITY_SNAPS));

  // --- Snap helpers ---
  function snapToNearest(value: number, snaps: readonly { value: number; name: string }[]): { value: number; name: string } {
    let closest = snaps[0];
    let minDist = Math.abs(value - snaps[0].value);
    for (const s of snaps) {
      const dist = Math.abs(value - s.value);
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }
    return closest;
  }

  function voicingNameToValue(name: string | undefined): number {
    const found = VOICING_SNAPS.find(s => s.name === name);
    return found ? found.value : 0;
  }

  function velocityNameToValue(name: string | undefined): number {
    const found = VELOCITY_SNAPS.find(s => s.name === name);
    return found ? found.value : 60;
  }

  // --- directivesToText helper ---
  function directivesToText(d: ParsedDirectives): string {
    const lines: string[] = [];
    if (d.mode) lines.push(`@mode: ${d.mode}`);
    if (d.voicing) lines.push(`@voicing: ${d.voicing}`);
    if (d.velocity) {
      if (typeof d.velocity === 'string') lines.push(`@velocity: ${d.velocity}`);
      else lines.push(`@velocity: ${d.velocity.from}→${d.velocity.to}`);
    }
    if (d.humanize !== undefined) lines.push(`@humanize: ${d.humanize}%`);
    if (d.swing !== undefined) lines.push(`@swing: ${d.swing}%`);
    if (d.strum !== undefined) lines.push(`@strum: ${d.strum}ms`);
    if (d.octave !== undefined) lines.push(`@octave: ${d.octave}`);
    if (d.range) lines.push(`@range: ${d.range.low}-${d.range.high}`);
    if (d.lead) lines.push(`@lead: ${d.lead}`);
    if (d.bass) lines.push(`@bass: ${d.bass}`);
    if (d.instrument) lines.push(`@instrument: ${d.instrument}`);
    if (d.comment) lines.push(`@comment: ${d.comment}`);
    if (d.melody && d.melody.notes.length > 0) {
      // Preserve raw melody text if available
      if (melodyText) lines.push(`@melody: ${melodyText}`);
    }
    return lines.join('\n');
  }

  // --- GUI → Raw sync ---
  function syncToRaw() {
    rawText = directivesToText(directives);
    parseErrors = [];
  }

  function setMode(value: string) {
    directives = { ...directives, mode: value };
    syncToRaw();
  }

  function setVoicingFromSlider(value: number) {
    voicingSlider = value;
    const snapped = snapToNearest(value, VOICING_SNAPS);
    directives = { ...directives, voicing: snapped.name };
    syncToRaw();
  }

  function setVelocityFromSlider(value: number) {
    velocitySlider = value;
    const snapped = snapToNearest(value, VELOCITY_SNAPS);
    directives = { ...directives, velocity: snapped.name as VelocityLevel };
    syncToRaw();
  }

  function setHumanize(value: number) {
    directives = { ...directives, humanize: value };
    syncToRaw();
  }

  function setSwing(value: number) {
    directives = { ...directives, swing: value };
    syncToRaw();
  }

  // --- Raw → GUI sync ---
  function onRawInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    rawText = target.value;
    const result = parseDirectives(rawText);
    directives = result.directives;
    parseErrors = result.errors.map(e => e.line ? `Line ${e.line}: ${e.message}` : e.message);
    // Sync slider positions from parsed directives
    voicingSlider = voicingNameToValue(directives.voicing);
    velocitySlider = velocityNameToValue(typeof directives.velocity === 'string' ? directives.velocity : 'mf');
    // Sync melody text from raw input
    melodyText = extractMelodyText(rawText);
  }

  // --- AI generate ---
  async function handleGenerate() {
    if (!songId) {
      showToast('Song ID が不明です', 'error');
      return;
    }
    if (!aiPrompt.trim()) {
      showToast('スタイルを入力してください', 'error');
      return;
    }

    aiLoading = true;
    aiError = null;

    try {
      const barRange = (block.startBar !== undefined && block.endBar !== undefined)
        ? `${block.startBar + 1}-${block.endBar}`
        : '';

      const result = await suggestDirectives(songId, {
        chordProgression: chordProgression ?? '',
        genre: aiPrompt.trim(),
        trackName,
        instrument,
        barRange,
      });

      // Apply the returned directives
      const parsed2 = parseDirectives(result.directives);
      directives = parsed2.directives;
      rawText = directivesToText(directives);
      parseErrors = parsed2.errors.map(e => e.line ? `Line ${e.line}: ${e.message}` : e.message);
      // Sync sliders
      voicingSlider = voicingNameToValue(directives.voicing);
      velocitySlider = velocityNameToValue(typeof directives.velocity === 'string' ? directives.velocity : 'mf');

      showToast('ディレクティブを生成しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成に失敗しました';
      aiError = message;
      showToast(message, 'error');
    } finally {
      aiLoading = false;
    }
  }

  // --- Actions ---
  function handleOk() {
    onSave(rawText);
    onClose();
  }

  function handlePreview() {
    onPreview?.();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  // --- Melody helpers ---
  function extractMelodyText(directivesText: string): string {
    const match = directivesText.match(/@melody\s*:\s*(.+)/);
    return match ? match[1].trim() : '';
  }

  function handleMelodyChange(text: string) {
    melodyText = text;
    // Update rawText: replace or add @melody line
    const lines = rawText.split('\n').filter(l => !l.trim().startsWith('@melody'));
    if (text.trim()) {
      lines.push(`@melody: ${text}`);
    }
    rawText = lines.join('\n');
    // Re-parse to sync directives
    const result = parseDirectives(rawText);
    directives = result.directives;
    parseErrors = result.errors.map(e => e.line ? `Line ${e.line}: ${e.message}` : e.message);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="popover-overlay" role="presentation" onclick={handleOverlayClick}>
  <div class="popover" role="dialog" aria-modal="true" aria-label="Block Popover">
    <!-- Header -->
    <div class="popover-header">
      <span class="popover-title">{headerLabel}</span>
      <button class="btn-icon" onclick={onClose} aria-label="Close">&times;</button>
    </div>

    <!-- Body -->
    <div class="popover-body">
      <!-- AI prompt input + generate button -->
      <div class="field">
        <div class="ai-input-row">
          <input
            type="text"
            class="ai-input"
            placeholder="スタイルを入力... (例: ジャズバラード風)"
            bind:value={aiPrompt}
            disabled={aiLoading}
            onkeydown={(e) => { if (e.key === 'Enter' && !aiLoading) handleGenerate(); }}
          />
          <button class="btn btn-primary btn-sm btn-generate" onclick={handleGenerate} disabled={aiLoading}>
            {#if aiLoading}
              <span class="spinner-sm"></span>
            {:else}
              生成
            {/if}
          </button>
        </div>
        {#if aiError}
          <div class="ai-error">{aiError}</div>
        {/if}
        <!-- Mode preset chips -->
        <div class="chip-group">
          {#each MODE_CHIPS as opt}
            <button
              class="chip"
              class:chip--active={directives.mode === opt}
              onclick={() => setMode(opt)}
            >{opt}</button>
          {/each}
        </div>
      </div>

      <!-- Section divider: パラメータ -->
      <div class="section-divider">
        <span class="section-label">パラメータ</span>
      </div>

      <!-- Voicing slider -->
      <div class="field">
        <label class="field-label">Voicing</label>
        <div class="bar-row">
          <span class="bar-label-left">close</span>
          <input
            type="range"
            class="slider"
            min={0}
            max={100}
            step={1}
            value={voicingSlider}
            oninput={(e) => setVoicingFromSlider(Number((e.target as HTMLInputElement).value))}
          />
          <span class="bar-label-right">spread</span>
        </div>
        <div class="snap-labels">
          {#each VOICING_SNAPS as snap}
            <span
              class="snap-label"
              class:snap-label--active={snappedVoicing.name === snap.name}
            >{snap.name}</span>
          {/each}
        </div>
      </div>

      <!-- Velocity slider -->
      <div class="field">
        <label class="field-label">Velocity</label>
        <div class="bar-row">
          <span class="bar-label-left">pp</span>
          <input
            type="range"
            class="slider"
            min={0}
            max={100}
            step={1}
            value={velocitySlider}
            oninput={(e) => setVelocityFromSlider(Number((e.target as HTMLInputElement).value))}
          />
          <span class="bar-label-right">ff</span>
        </div>
        <div class="snap-labels snap-labels--6">
          {#each VELOCITY_SNAPS as snap}
            <span
              class="snap-label"
              class:snap-label--active={snappedVelocity.name === snap.name}
            >{snap.name}</span>
          {/each}
        </div>
      </div>

      <!-- Humanize slider -->
      <div class="field">
        <label class="field-label">Humanize</label>
        <div class="slider-row">
          <input
            type="range"
            class="slider"
            min={HUMANIZE_MIN}
            max={HUMANIZE_MAX}
            value={directives.humanize ?? 0}
            oninput={(e) => setHumanize(Number((e.target as HTMLInputElement).value))}
          />
          <span class="slider-value">{directives.humanize ?? 0}%</span>
        </div>
      </div>

      <!-- Swing slider -->
      <div class="field">
        <label class="field-label">Swing</label>
        <div class="slider-row">
          <input
            type="range"
            class="slider"
            min={SWING_MIN}
            max={SWING_MAX}
            value={directives.swing ?? 0}
            oninput={(e) => setSwing(Number((e.target as HTMLInputElement).value))}
          />
          <span class="slider-value">{directives.swing ?? 0}%</span>
        </div>
      </div>

      <!-- Section divider: プレビュー -->
      <div class="section-divider">
        <span class="section-label">プレビュー</span>
      </div>

      <!-- MIDI preview placeholder -->
      <div class="preview-box">
        <span class="preview-placeholder">パラメータに基づくMIDIプレビュー（準備中）</span>
      </div>

      <!-- Mini piano roll (free mode) -->
      {#if isFreeMode}
        <div class="section-divider">
          <span class="section-label">Melody</span>
        </div>
        <MiniPianoRoll melody={melodyText} onMelodyChange={handleMelodyChange} />
      {/if}

      <!-- Raw text toggle -->
      <div class="raw-section">
        <button class="raw-toggle" onclick={() => (rawOpen = !rawOpen)}>
          <span class="raw-toggle-icon">{rawOpen ? '▾' : '▸'}</span>
          Raw テキスト
        </button>
        {#if rawOpen}
          <textarea
            class="raw-textarea"
            rows="6"
            value={rawText}
            oninput={onRawInput}
          ></textarea>
          {#if parseErrors.length > 0}
            <div class="parse-errors">
              {#each parseErrors as err}
                <div class="parse-error">{err}</div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="popover-footer">
      <button class="footer-btn" onclick={handlePreview}>&#9654; Preview</button>
      <button class="footer-btn footer-btn--primary" onclick={handleOk}>OK</button>
    </div>
  </div>
</div>

<style>
  /* Overlay */
  .popover-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-popover);
  }

  /* Popover card */
  .popover {
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    width: 400px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
  }

  .popover-title {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0 var(--space-xs);
    line-height: 1;
    transition: color 0.15s;
  }

  .btn-icon:hover {
    color: var(--text-primary);
  }

  /* Body */
  .popover-body {
    padding: var(--space-sm) var(--space-md);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Field */
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field-label {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: none;
    letter-spacing: 0;
    margin-bottom: 2px;
  }

  /* AI input row */
  .ai-input-row {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }

  .ai-input {
    flex: 1;
    padding: 7px 10px;
    font-size: 0.85rem;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
  }

  .ai-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }

  .ai-input::placeholder {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .btn-generate {
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-generate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .ai-error {
    font-size: 0.72rem;
    color: var(--error);
    padding: 2px 0;
  }

  /* Chip group */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .chip {
    padding: 3px 9px;
    font-size: 0.72rem;
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    background: var(--bg-base);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .chip--active {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }

  .chip--active:hover {
    background: #d09440;
    color: #fff;
  }

  /* Section divider */
  .section-divider {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(138, 126, 104, 0.1);
  }

  .section-label {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0.02em;
    white-space: nowrap;
    opacity: 0.7;
  }

  /* Bar row (slider with left/right labels) */
  .bar-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .bar-label-left,
  .bar-label-right {
    font-size: 8px;
    color: var(--text-muted);
    white-space: nowrap;
    min-width: 30px;
  }

  .bar-label-left {
    text-align: right;
  }

  .bar-label-right {
    text-align: left;
  }

  /* Snap labels under slider */
  .snap-labels {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding: 0 34px;
  }

  .snap-labels--6 {
    grid-template-columns: repeat(6, 1fr);
  }

  .snap-label {
    font-size: 7px;
    color: var(--text-muted);
    text-align: center;
    transition: color 0.15s, font-weight 0.15s;
  }

  .snap-label--active {
    color: var(--accent-primary);
    font-weight: 700;
  }

  /* Slider */
  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: var(--border-default);
    border-radius: 2px;
    outline: none;
    accent-color: var(--accent-primary);
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary);
    cursor: pointer;
    border: 2px solid var(--bg-surface);
    box-shadow: 0 0 3px rgba(232, 168, 76, 0.3);
  }

  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary);
    cursor: pointer;
    border: 2px solid var(--bg-surface);
    box-shadow: 0 0 3px rgba(232, 168, 76, 0.3);
  }

  .slider-value {
    font-size: 0.78rem;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    min-width: 36px;
    text-align: right;
  }

  /* Preview box */
  .preview-box {
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    min-height: 56px;
    max-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-sm);
    overflow: hidden;
  }

  .preview-placeholder {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Raw text section */
  .raw-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .raw-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 2px 0;
    transition: color 0.15s;
  }

  .raw-toggle:hover {
    color: var(--text-primary);
  }

  .raw-toggle-icon {
    font-size: 0.7rem;
  }

  .raw-textarea {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    padding: var(--space-sm);
    resize: vertical;
    line-height: 1.5;
  }

  .raw-textarea:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }

  /* Parse errors */
  .parse-errors {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .parse-error {
    font-size: 0.72rem;
    font-family: var(--font-mono);
    color: var(--error);
  }

  /* Footer */
  .popover-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    gap: var(--space-xs);
    position: sticky;
    bottom: 0;
    flex-shrink: 0;
  }

  .footer-btn {
    padding: 5px 12px;
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--bg-base);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .footer-btn:hover {
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .footer-btn--primary {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }

  .footer-btn--primary:hover {
    background: #d09440;
    border-color: #d09440;
    color: #fff;
  }

  .btn-sm {
    padding: 5px 12px;
    font-size: 0.78rem;
  }
</style>
