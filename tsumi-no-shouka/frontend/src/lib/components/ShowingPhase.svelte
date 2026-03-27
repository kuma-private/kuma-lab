<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ceremony } from '$lib/state/machine.svelte';
  import { demonAppear } from '$lib/animations/transitions';
  import type { CodeLine } from '$lib/state/types';
  import hljs from 'highlight.js/lib/core';
  import java from 'highlight.js/lib/languages/java';
  import python from 'highlight.js/lib/languages/python';
  import cpp from 'highlight.js/lib/languages/cpp';
  import javascript from 'highlight.js/lib/languages/javascript';
  import ruby from 'highlight.js/lib/languages/ruby';
  import php from 'highlight.js/lib/languages/php';
  import 'highlight.js/styles/github-dark.css';

  hljs.registerLanguage('java', java);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('cpp', cpp);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('ruby', ruby);
  hljs.registerLanguage('php', php);

  let response = $derived(ceremony.response);
  let lines = $derived(response?.lines ?? []);
  let language = $derived(response?.lang ?? '');
  let theme = $derived(response?.theme ?? '');

  // Group consecutive sinful lines into annotation blocks
  // Each group: { startLine, endLine, summary (combined sin text) }
  type SinGroup = { start: number; end: number; summary: string };

  let sinGroups = $derived((): SinGroup[] => {
    const groups: SinGroup[] = [];
    let current: { start: number; end: number; sins: string[] } | null = null;

    lines.forEach((line: CodeLine, i: number) => {
      if (line.s) {
        if (current && i - current.end <= 1) {
          current.end = i;
          current.sins.push(line.s);
        } else {
          if (current) groups.push({ start: current.start, end: current.end, summary: current.sins.join('／') });
          current = { start: i, end: i, sins: [line.s] };
        }
      }
    });
    if (current) groups.push({ start: current.start, end: current.end, summary: current.sins.join('／') });
    return groups;
  });

  // For each line, find if it's the "anchor" line for a sin group badge (middle of group)
  function getGroupForLine(lineIndex: number): SinGroup | null {
    for (const g of sinGroups()) {
      const anchor = Math.floor((g.start + g.end) / 2);
      if (lineIndex === anchor) return g;
    }
    return null;
  }

  function isInSinGroup(lineIndex: number): boolean {
    return sinGroups().some(g => lineIndex >= g.start && lineIndex <= g.end);
  }

  let sinCount = $derived(lines.filter((l: CodeLine) => l.s !== null).length);
  let revealedLines = $state(0);
  let revealPhase = $state<'lines' | 'verdict' | 'button'>('lines');
  let displayedSinCount = $state(0);

  let revealInterval: ReturnType<typeof setInterval>;
  let countUpInterval: ReturnType<typeof setInterval>;

  const langMap: Record<string, string> = {
    'Java': 'java', 'java': 'java', 'Python': 'python', 'python': 'python',
    'C++': 'cpp', 'c++': 'cpp', 'JavaScript': 'javascript', 'JS': 'javascript',
    'Ruby': 'ruby', 'ruby': 'ruby', 'PHP': 'php', 'php': 'php',
    'COBOL': 'plaintext', 'cobol': 'plaintext',
  };

  function highlightCode(code: string, lang: string): string {
    const hljsLang = langMap[lang] ?? 'plaintext';
    if (hljsLang === 'plaintext') return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    try { return hljs.highlight(code, { language: hljsLang }).value; }
    catch { return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  }

  function revealNextLine() {
    if (revealedLines >= lines.length) {
      clearInterval(revealInterval);
      setTimeout(() => { revealPhase = 'verdict'; startCountUp(); }, 800);
      return;
    }
    revealedLines++;
  }

  function startCountUp() {
    if (sinCount === 0) { displayedSinCount = 0; setTimeout(() => { revealPhase = 'button'; }, 600); return; }
    displayedSinCount = 0;
    countUpInterval = setInterval(() => {
      displayedSinCount++;
      if (displayedSinCount >= sinCount) { clearInterval(countUpInterval); setTimeout(() => { revealPhase = 'button'; }, 600); }
    }, 80);
  }

  onMount(() => { revealInterval = setInterval(revealNextLine, 120); });
  onDestroy(() => { clearInterval(revealInterval); clearInterval(countUpInterval); });
</script>

<div class="showing-phase" in:demonAppear={{ duration: 1000 }}>
  <div class="header">
    <span class="language-badge">{language}</span>
    {#if theme}
      <span class="theme-text">「{theme}」</span>
    {/if}
  </div>

  <div class="code-panel">
    <div class="code-lines">
      {#each lines.slice(0, revealedLines) as line, i}
        <div class="code-line" class:sin-line={isInSinGroup(i)}>
          <span class="line-number">{i + 1}</span>
          <span class="line-content">{@html highlightCode(line.c, language)}</span>
          {#if getGroupForLine(i)}
            {@const group = getGroupForLine(i)}
            <span class="sin-badge">
              {group?.summary}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if revealPhase === 'verdict' || revealPhase === 'button'}
    <div class="verdict">
      「<span class="verdict-count">{displayedSinCount}</span>つの罪を検出」
    </div>
  {/if}

  {#if revealPhase === 'button'}
    <button class="purify-button portalPulse button-enter" onclick={() => ceremony.purify()}>
      ⚜ 浄化を執行せよ ⚜
    </button>
  {/if}
</div>

<style>
  .showing-phase {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center;
    padding: 2rem; gap: 1.5rem; overflow-y: auto;
  }

  .header { display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }

  .language-badge {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.8rem; padding: 0.3em 0.8em;
    border: 1px solid rgba(200, 122, 96, 0.4); border-radius: 4px;
    color: var(--text-sin, #c87a60); text-transform: uppercase; letter-spacing: 0.1em;
  }

  .theme-text { font-size: 1rem; color: var(--gold, #c9b87a); opacity: 0.7; }

  .code-panel {
    width: 100%; max-width: 1100px;
    background: rgba(20, 15, 10, 0.6);
    border: 1px solid rgba(200, 122, 96, 0.15); border-radius: 8px;
    padding: 1.5rem; overflow-x: auto; flex-shrink: 0;
  }

  .code-lines { display: flex; flex-direction: column; gap: 1px; }

  .code-line {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.2rem 0.5rem; border-radius: 3px;
    font-family: var(--font-code, 'JetBrains Mono'), monospace; font-size: 0.82rem;
    animation: lineReveal 0.3s ease-out;
    border-left: 3px solid transparent;
    min-height: 1.6em;
  }

  .sin-line {
    border-left-color: rgba(255, 68, 0, 0.4);
    background: rgba(255, 34, 0, 0.04);
  }

  @keyframes lineReveal {
    0% { opacity: 0; transform: translateX(-8px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  .line-number {
    color: rgba(200, 122, 96, 0.3); min-width: 2.5em; text-align: right;
    font-size: 0.72rem; user-select: none; flex-shrink: 0;
  }

  .line-content {
    color: var(--text-sin, #c87a60); white-space: pre; flex: 1; min-width: 0;
  }

  .line-content :global(.hljs-keyword) { color: #ff7b72; }
  .line-content :global(.hljs-string) { color: #a5d6ff; }
  .line-content :global(.hljs-number) { color: #79c0ff; }
  .line-content :global(.hljs-comment) { color: #8b949e; font-style: italic; }
  .line-content :global(.hljs-type),
  .line-content :global(.hljs-title.class_) { color: #ffa657; }
  .line-content :global(.hljs-built_in) { color: #ffa657; }
  .line-content :global(.hljs-literal) { color: #79c0ff; }
  .line-content :global(.hljs-params) { color: #c9d1d9; }
  .line-content :global(.hljs-function) { color: #d2a8ff; }

  .sin-badge {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.68rem; line-height: 1.5;
    color: #ffaa88;
    background: rgba(255, 68, 0, 0.08);
    border: 1px solid rgba(255, 68, 0, 0.25);
    border-radius: 4px;
    padding: 0.25em 0.8em;
    margin-left: auto;
    flex-shrink: 0;
    max-width: 320px;
    white-space: normal;
    text-align: right;
    animation: sinBadgePop 0.4s ease-out, sinDanger 3s ease-in-out 1s infinite;
  }

  .verdict {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: 1.2rem; color: #ff4444;
    text-shadow: 0 0 15px rgba(255, 68, 68, 0.4);
    animation: verdictAppear 0.5s ease-out; flex-shrink: 0;
  }
  .verdict-count { font-size: 1.6rem; font-weight: 900; color: #ff2200; }

  @keyframes verdictAppear {
    0% { opacity: 0; transform: scale(0.8); }
    60% { transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }

  .purify-button {
    flex-shrink: 0;
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: 1.1rem; font-weight: 700;
    color: var(--text-fsharp-bright, #c0baff); background: none;
    border: 2px solid rgba(155, 148, 224, 0.4); border-radius: 8px;
    padding: 0.8rem 2.5rem; cursor: pointer; letter-spacing: 0.15em; transition: all 0.3s;
  }
  .button-enter { animation: buttonFadeUp 0.6s ease-out; }
  @keyframes buttonFadeUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
  .purify-button:hover {
    border-color: rgba(155, 148, 224, 0.8);
    box-shadow: 0 0 30px rgba(155, 148, 224, 0.2), inset 0 0 20px rgba(155, 148, 224, 0.05);
    text-shadow: 0 0 15px rgba(192, 186, 255, 0.5);
  }
</style>
