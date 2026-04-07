<script lang="ts">
  import { importChordChart } from '$lib/api';

  let {
    songId,
    bpm,
    timeSignature,
    key: musicalKey,
    onImport,
    onClose,
  }: {
    songId: string;
    bpm: number;
    timeSignature: string;
    key: string;
    onImport: (chords: string) => void;
    onClose: () => void;
  } = $props();

  let images = $state<{ dataUri: string; name: string; section: string }[]>([]);
  let songName = $state('');
  let artist = $state('');
  let sourceUrl = $state('');
  let loading = $state(false);
  let error = $state('');

  let canSubmit = $derived(images.length > 0 && !loading);

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) addImage(file);
      }
    }
  }

  async function addImage(file: File) {
    const dataUri = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const section = images.length === 0 ? 'Intro' : String.fromCharCode(65 + images.length - 1);
    images = [...images, { dataUri, name: file.name, section }];
  }

  function removeImage(index: number) {
    images = images.filter((_, i) => i !== index);
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    for (const file of input.files) {
      addImage(file);
    }
    input.value = '';
  }

  function insertSectionHeaders(chords: string, sectionLabels: string[]): string {
    // Split into groups by blank lines
    const lines = chords.split('\n');
    const groups: string[][] = [];
    let currentGroup: string[] = [];

    for (const line of lines) {
      if (line.trim() === '') {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
      } else {
        currentGroup.push(line);
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Insert section headers before each group
    const result: string[] = [];
    for (let i = 0; i < groups.length; i++) {
      const label = sectionLabels[i] || `Section ${i + 1}`;
      result.push(`### ${label}`);
      result.push(...groups[i]);
      result.push(''); // blank line after section
    }

    return result.join('\n').trim();
  }

  async function handleSubmit() {
    loading = true;
    error = '';
    try {
      const sectionHint = images
        .map((img, i) => `画像${i + 1}: ${img.section || `セクション${i + 1}`}`)
        .join('\n');
      const songNameWithSections = [
        songName,
        sectionHint ? `\nセクション構成:\n${sectionHint}` : '',
      ].filter(Boolean).join('');

      const result = await importChordChart(songId, {
        images: images.map(i => i.dataUri),
        songName: songNameWithSections || undefined,
        artist: artist || undefined,
        sourceUrl: sourceUrl || undefined,
        bpm,
        timeSignature,
        key: musicalKey,
      });

      const sectionLabels = images.map(img => img.section).filter(Boolean);
      const hasExistingSections = result.chords.includes('###') || result.chords.includes('//');
      const finalChords = hasExistingSections
        ? result.chords
        : insertSectionHeaders(result.chords, sectionLabels);
      onImport(finalChords);
    } catch (err) {
      error = err instanceof Error ? err.message : 'インポートに失敗しました';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('import-dialog-overlay')) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="import-dialog-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="画像からインポート"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
  onpaste={handlePaste}
>
  <div class="import-dialog">
    <!-- Header -->
    <div class="import-dialog-header">
      <span class="import-dialog-title">画像からインポート</span>
      <button class="import-dialog-close" onclick={onClose} aria-label="閉じる">&times;</button>
    </div>

    <!-- Body -->
    <div class="import-dialog-body">
      <!-- Image area -->
      <div class="image-section">
        <div class="image-section-label">画像</div>

        {#if images.length > 0}
          <div class="image-thumbnails">
            {#each images as img, i}
              <div class="import-image-item">
                <div class="image-thumb-wrapper">
                  <img src={img.dataUri} alt={img.name} class="image-thumb" />
                  <button class="image-remove" onclick={() => removeImage(i)} aria-label="削除">&times;</button>
                </div>
                <input
                  class="section-label-input"
                  bind:value={img.section}
                  placeholder="セクション名"
                />
              </div>
            {/each}
          </div>
        {/if}

        <div class="image-actions">
          <label class="btn-file-select">
            ファイルを選択
            <input
              type="file"
              accept="image/*"
              multiple
              onchange={handleFileSelect}
              class="file-input-hidden"
            />
          </label>
          <span class="paste-hint">Ctrl+V で画像を貼り付け</span>
        </div>
      </div>

      <!-- Metadata fields -->
      <div class="metadata-section">
        <label class="field-label">
          <span>曲名</span>
          <input
            type="text"
            class="field-input"
            bind:value={songName}
            placeholder="任意"
          />
        </label>
        <label class="field-label">
          <span>アーティスト</span>
          <input
            type="text"
            class="field-input"
            bind:value={artist}
            placeholder="任意"
          />
        </label>
        <label class="field-label">
          <span>参照URL</span>
          <input
            type="text"
            class="field-input"
            bind:value={sourceUrl}
            placeholder="任意"
          />
        </label>
      </div>

      <!-- Error -->
      {#if error}
        <div class="import-error">{error}</div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="import-dialog-footer">
      <button class="btn-cancel" onclick={onClose}>キャンセル</button>
      <button class="btn-submit" disabled={!canSubmit} onclick={handleSubmit}>
        {#if loading}
          <span class="spinner-sm"></span>
          読み込み中...
        {:else}
          インポート
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .import-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .import-dialog {
    z-index: calc(var(--z-modal) + 1);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    width: 480px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .import-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .import-dialog-title {
    font-family: var(--font-sans);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .import-dialog-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .import-dialog-close:hover {
    color: var(--text-primary);
  }

  .import-dialog-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Image section */
  .image-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .image-section-label {
    font-family: var(--font-sans);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .image-thumbnails {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .import-image-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .image-thumb-wrapper {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--border-default);
  }

  .image-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .image-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 0.7rem;
    line-height: 1;
    background: rgba(0, 0, 0, 0.7);
    color: var(--text-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .image-remove:hover {
    background: rgba(200, 50, 50, 0.8);
  }

  .section-label-input {
    width: 80px;
    padding: 2px 4px;
    font-size: 0.7rem;
    font-family: var(--font-sans);
    text-align: center;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    box-sizing: border-box;
  }
  .section-label-input:focus {
    border-color: var(--accent-primary);
    outline: none;
  }
  .section-label-input::placeholder {
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .image-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-file-select {
    padding: 6px 14px;
    font-size: 0.78rem;
    font-family: var(--font-sans);
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-file-select:hover {
    background: rgba(232, 168, 76, 0.1);
    border-color: rgba(232, 168, 76, 0.3);
    color: var(--accent-warm);
  }

  .file-input-hidden {
    display: none;
  }

  .paste-hint {
    font-family: var(--font-sans);
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  /* Metadata section */
  .metadata-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: var(--font-sans);
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .field-input {
    width: 100%;
    padding: 6px 10px;
    font-size: 0.82rem;
    font-family: var(--font-sans);
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    box-sizing: border-box;
  }
  .field-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }
  .field-input::placeholder {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  /* Error */
  .import-error {
    padding: 8px 12px;
    font-size: 0.78rem;
    font-family: var(--font-sans);
    color: #f08080;
    background: rgba(240, 80, 80, 0.08);
    border: 1px solid rgba(240, 80, 80, 0.2);
    border-radius: var(--radius-sm);
  }

  /* Footer */
  .import-dialog-footer {
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

  .btn-submit {
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
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-submit:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner-sm {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
