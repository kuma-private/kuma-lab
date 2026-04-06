<script lang="ts">
  import type { Section } from '$lib/types/song';

  const SECTION_COLORS: Record<string, string> = {
    A: '#a78bfa',
    B: '#60a5fa',
    C: '#34d399',
    D: '#fbbf24',
    Chorus: '#f87171',
    Verse: '#818cf8',
    Bridge: '#2dd4bf',
    Intro: '#9ca3af',
    Outro: '#9ca3af',
  };

  let {
    sections,
    totalBars,
    onSectionNameChange,
  }: {
    sections: Section[];
    totalBars: number;
    onSectionNameChange: (sectionId: string, name: string) => void;
  } = $props();

  function getColor(name: string): string {
    return SECTION_COLORS[name] ?? '#a78bfa';
  }

  function handleDblClick(section: Section, e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const span = el.querySelector('.section-label') as HTMLElement;
    if (!span) return;
    span.contentEditable = 'true';
    span.focus();

    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function handleBlur(section: Section, e: FocusEvent) {
    const span = e.target as HTMLElement;
    span.contentEditable = 'false';
    const newName = span.textContent?.trim() || section.name;
    if (newName !== section.name) {
      onSectionNameChange(section.id, newName);
    }
  }

  function handleKeyDown(section: Section, e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Escape') {
      const span = e.target as HTMLElement;
      span.textContent = section.name;
      span.blur();
    }
  }
</script>

<div class="section-bar" style:grid-template-columns="repeat({totalBars}, 1fr)">
  {#each sections as section (section.id)}
    {@const color = getColor(section.name)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="section-tag"
      style:grid-column="{section.startBar} / {section.endBar + 1}"
      style:--section-color={color}
      ondblclick={(e) => handleDblClick(section, e)}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="section-label"
        onblur={(e) => handleBlur(section, e)}
        onkeydown={(e) => handleKeyDown(section, e)}
      >{section.name}</span>
    </div>
  {/each}
</div>

<style>
  .section-bar {
    display: grid;
    gap: 2px;
    padding: 0 2px;
  }

  .section-tag {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--section-color) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--section-color) 30%, transparent);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    min-height: 24px;
  }

  .section-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--section-color);
    white-space: nowrap;
    outline: none;
    cursor: default;
    user-select: none;
  }

  .section-tag :global(.section-label[contenteditable="true"]) {
    cursor: text;
    user-select: text;
    background: var(--bg-base);
    border-radius: 2px;
    padding: 0 4px;
  }
</style>
