<script lang="ts">
  import type { Section } from '$lib/types/song';

  const SECTION_COLORS: Record<string, string> = {
    A: '#c8a070',
    B: '#90a8b8',
    C: '#90b890',
    D: '#c8b060',
    Chorus: '#c88878',
    Verse: '#a098b0',
    Bridge: '#80b0a0',
    Intro: '#908880',
    Outro: '#908880',
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

<div class="section-bar" style:grid-template-columns="repeat({totalBars}, minmax(0, 140px))">
  {#each sections as section (section.id)}
    {@const color = getColor(section.name)}
    <div
      class="section-tag"
      role="group"
      style:grid-column="{section.startBar + 1} / {section.endBar + 1}"
      style:--section-color={color}
      ondblclick={(e) => handleDblClick(section, e)}
    >
      <span
        class="section-label"
        role="textbox"
        tabindex="0"
        aria-label="セクション名"
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
    background: color-mix(in srgb, var(--section-color) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--section-color) 18%, transparent);
    border-radius: 6px;
    padding: 1px 6px;
    min-height: 18px;
  }

  .section-label {
    font-family: var(--font-display);
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--section-color);
    white-space: nowrap;
    outline: none;
    cursor: default;
    user-select: none;
    letter-spacing: 0.02em;
  }

  .section-tag :global(.section-label[contenteditable="true"]) {
    cursor: text;
    user-select: text;
    background: var(--bg-base);
    border-radius: 2px;
    padding: 0 4px;
  }
</style>
