<script lang="ts">
  import type { Song } from '$lib/types/song';
  import { serializeSong, deserializeSong, mergeParsedSong } from '$lib/song-serializer';

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

  // Sync: when song prop changes from outside, re-serialize
  $effect(() => {
    // Read song to create dependency
    const _s = song;
    if (!internalEdit) {
      text = serializeSong(_s);
      parseErrors = [];
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
</script>

<div class="text-view">
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

  {#if parseErrors.length > 0}
    <div class="error-bar">
      {#each parseErrors as err}
        <div class="error-item">
          <span class="error-line">L{err.line}</span>
          <span class="error-msg">{err.message}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .text-view {
    display: flex;
    flex-direction: column;
    flex: 1;
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

  .error-bar {
    flex-shrink: 0;
    max-height: 120px;
    overflow-y: auto;
    padding: var(--space-xs) var(--space-md);
    background: rgba(220, 38, 38, 0.08);
    border-top: 1px solid rgba(220, 38, 38, 0.2);
  }

  .error-item {
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
</style>
