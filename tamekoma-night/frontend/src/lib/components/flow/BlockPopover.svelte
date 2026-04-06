<script lang="ts">
  import { parseDirectives, type ParsedDirectives, type VelocityLevel } from '$lib/directive-parser';
  import type { DirectiveBlock } from '$lib/types/song';

  interface Props {
    block: DirectiveBlock;
    trackName: string;
    sectionName: string;
    onSave: (directives: string) => void;
    onClose: () => void;
    onPreview?: () => void;
  }

  const PATTERN_OPTIONS = [
    'block', 'arpUp', 'arpDown', 'fingerpick', 'bossa-nova',
    'comp-jazz', '8beat', 'walking', 'root', 'root-fifth', 'sustain',
  ] as const;

  const VOICING_OPTIONS = ['close', 'open', 'drop2', 'spread', 'shell'] as const;
  const VELOCITY_OPTIONS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'] as const;

  const HUMANIZE_MIN = 0;
  const HUMANIZE_MAX = 30;
  const SWING_MIN = 0;
  const SWING_MAX = 70;

  let {
    block,
    trackName,
    sectionName,
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
  let presetMenuOpen = $state(false);

  // --- Derived header ---
  let headerLabel = $derived.by(() => {
    const bars = (block.startBar !== undefined && block.endBar !== undefined) ? ` (bars ${block.startBar + 1}–${block.endBar})` : '';
    return `${trackName} — ${sectionName}${bars}`;
  });

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

  function setVoicing(value: string) {
    directives = { ...directives, voicing: value };
    syncToRaw();
  }

  function setVelocity(value: VelocityLevel) {
    directives = { ...directives, velocity: value };
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

  // --- Presets (placeholder Phase 1) ---
  const PRESETS: Record<string, Partial<ParsedDirectives>> = {
    'Jazz Ballad': { mode: 'block', voicing: 'drop2', velocity: 'mp', humanize: 15, swing: 40 },
    'Pop': { mode: 'block', voicing: 'close', velocity: 'mf', humanize: 8, swing: 0 },
    'Rock': { mode: '8beat', voicing: 'open', velocity: 'f', humanize: 5, swing: 0 },
    'Bossa Nova': { mode: 'bossa-nova', voicing: 'spread', velocity: 'mp', humanize: 12, swing: 20 },
  };

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (preset) {
      directives = { ...directives, ...preset };
      syncToRaw();
    }
    presetMenuOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="popover-overlay" onclick={handleOverlayClick}>
  <div class="popover" role="dialog" aria-label="Block Popover">
    <!-- Header -->
    <div class="popover-header">
      <span class="popover-title">{headerLabel}</span>
      <button class="btn-icon" onclick={onClose} aria-label="Close">&times;</button>
    </div>

    <!-- Body -->
    <div class="popover-body">
      <!-- Pattern dropdown -->
      <div class="field">
        <label class="field-label">Pattern</label>
        <select
          class="field-select"
          value={directives.mode ?? ''}
          onchange={(e) => setMode((e.target as HTMLSelectElement).value)}
        >
          <option value="" disabled>Select...</option>
          {#each PATTERN_OPTIONS as opt}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      </div>

      <!-- Voicing chips -->
      <div class="field">
        <label class="field-label">Voicing</label>
        <div class="chip-group">
          {#each VOICING_OPTIONS as opt}
            <button
              class="chip"
              class:chip--active={directives.voicing === opt}
              onclick={() => setVoicing(opt)}
            >{opt}</button>
          {/each}
        </div>
      </div>

      <!-- Velocity chips -->
      <div class="field">
        <label class="field-label">Velocity</label>
        <div class="chip-group">
          {#each VELOCITY_OPTIONS as opt}
            <button
              class="chip"
              class:chip--active={typeof directives.velocity === 'string' && directives.velocity === opt}
              onclick={() => setVelocity(opt)}
            >{opt}</button>
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

      <!-- Raw text toggle -->
      <div class="raw-section">
        <button class="raw-toggle" onclick={() => (rawOpen = !rawOpen)}>
          <span class="raw-toggle-icon">{rawOpen ? '▾' : '▸'}</span>
          Raw テキストで編集
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
      <div class="footer-left">
        <div class="preset-wrapper">
          <button class="btn btn-secondary btn-sm" onclick={() => (presetMenuOpen = !presetMenuOpen)}>
            Preset
          </button>
          {#if presetMenuOpen}
            <div class="preset-menu">
              {#each Object.keys(PRESETS) as name}
                <button class="preset-item" onclick={() => applyPreset(name)}>{name}</button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn btn-secondary btn-sm" disabled title="Phase 3で実装">
          AI Suggest
        </button>
      </div>
      <div class="footer-right">
        {#if onPreview}
          <button class="btn btn-ghost btn-sm" onclick={handlePreview}>
            &#9654; Preview
          </button>
        {/if}
        <button class="btn btn-primary btn-sm" onclick={handleOk}>
          OK
        </button>
      </div>
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
    z-index: 60;
  }

  /* Popover card */
  .popover {
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    width: 360px;
    max-width: 95vw;
    max-height: 85vh;
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
    padding: var(--space-md);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  /* Field */
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-select {
    width: 100%;
    padding: 6px 10px;
    font-size: 0.85rem;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .field-select:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
    outline: none;
  }

  /* Chip group */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .chip {
    padding: 4px 10px;
    font-size: 0.78rem;
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
    background: #9374e8;
    color: #fff;
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
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent-primary);
    cursor: pointer;
    border: 2px solid var(--bg-surface);
    box-shadow: 0 0 4px rgba(167, 139, 250, 0.4);
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent-primary);
    cursor: pointer;
    border: 2px solid var(--bg-surface);
    box-shadow: 0 0 4px rgba(167, 139, 250, 0.4);
  }

  .slider-value {
    font-size: 0.78rem;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    min-width: 36px;
    text-align: right;
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
    box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
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
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    gap: var(--space-sm);
  }

  .footer-left,
  .footer-right {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .btn-sm {
    padding: 5px 12px;
    font-size: 0.78rem;
  }

  /* Preset menu */
  .preset-wrapper {
    position: relative;
  }

  .preset-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-elevated);
    min-width: 140px;
    z-index: 10;
    overflow: hidden;
  }

  .preset-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    font-size: 0.8rem;
    background: none;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.1s;
  }

  .preset-item:hover {
    background: var(--bg-hover);
  }
</style>
