<script lang="ts">
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

  const langMap: Record<string, string> = {
    'Java': 'java',
    'java': 'java',
    'Python': 'python',
    'python': 'python',
    'C++': 'cpp',
    'c++': 'cpp',
    'JavaScript': 'javascript',
    'JS': 'javascript',
    'js': 'javascript',
    'Ruby': 'ruby',
    'ruby': 'ruby',
    'PHP': 'php',
    'php': 'php',
    'COBOL': 'plaintext',
    'cobol': 'plaintext',
  };

  function highlightCode(code: string, lang: string): string {
    const hljsLang = langMap[lang] ?? 'plaintext';
    if (hljsLang === 'plaintext') {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    try {
      return hljs.highlight(code, { language: hljsLang }).value;
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  function sinColor(sin: string | null): string {
    if (!sin) return '#ff4400';
    if (sin.includes('null') || sin.includes('Null')) return 'var(--sin-null, #ff2200)';
    if (sin.includes('getter') || sin.includes('Getter') || sin.includes('setter')) return 'var(--sin-getter, #ff6600)';
    if (sin.includes('ボイラー') || sin.includes('Boiler') || sin.includes('boiler')) return 'var(--sin-boiler, #cc4400)';
    if (sin.includes('副作用') || sin.includes('side') || sin.includes('Side')) return 'var(--sin-side-effect, #ff8800)';
    return '#ff4400';
  }
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
      {#each lines as line, i}
        <div class="code-line summonFlicker" style="animation-delay: {i * 60}ms">
          <span class="line-number">{i + 1}</span>
          <span class="line-content">{@html highlightCode(line.c, language)}</span>
          {#if line.s}
            <span
              class="sin-badge sinBadgePop"
              style="--sin-color: {sinColor(line.s)}; animation-delay: {300 + i * 120}ms"
            >
              {line.s}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <button class="purify-button portalPulse" onclick={() => ceremony.purify()}>
    ⚜ PURIFY WITH F# ⚜
  </button>
</div>

<style>
  .showing-phase {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    gap: 1.5rem;
    overflow-y: auto;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
  }

  .language-badge {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.8rem;
    padding: 0.3em 0.8em;
    border: 1px solid rgba(200, 122, 96, 0.4);
    border-radius: 4px;
    color: var(--text-sin, #c87a60);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .theme-text {
    font-size: 1rem;
    color: var(--gold, #c9b87a);
    opacity: 0.7;
  }

  .code-panel {
    width: 100%;
    max-width: 900px;
    background: rgba(20, 15, 10, 0.6);
    border: 1px solid rgba(200, 122, 96, 0.15);
    border-radius: 8px;
    padding: 1.5rem;
    overflow-x: auto;
    flex: 1;
    min-height: 0;
  }

  .code-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .code-line {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.85rem;
    opacity: 0;
    animation: summonFlicker 0.8s ease-out forwards;
  }

  .line-number {
    color: rgba(200, 122, 96, 0.3);
    min-width: 2.5em;
    text-align: right;
    font-size: 0.75rem;
    user-select: none;
    flex-shrink: 0;
  }

  .line-content {
    color: var(--text-sin, #c87a60);
    white-space: pre;
    flex: 1;
    min-width: 0;
  }

  /* Let highlight.js colors show through */
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
    font-size: 0.7rem;
    padding: 0.2em 0.7em;
    border-radius: 3px;
    color: #fff;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0;
    background: var(--sin-color, #ff4400);
    box-shadow: 0 0 8px color-mix(in srgb, var(--sin-color, #ff4400) 60%, transparent),
                0 0 16px color-mix(in srgb, var(--sin-color, #ff4400) 30%, transparent);
    animation: sinBadgePop 0.4s ease-out forwards;
  }

  .purify-button {
    flex-shrink: 0;
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-fsharp-bright, #c0baff);
    background: none;
    border: 2px solid rgba(155, 148, 224, 0.4);
    border-radius: 8px;
    padding: 0.8rem 2.5rem;
    cursor: pointer;
    letter-spacing: 0.15em;
    transition: all 0.3s;
  }

  .purify-button:hover {
    border-color: rgba(155, 148, 224, 0.8);
    box-shadow: 0 0 30px rgba(155, 148, 224, 0.2), inset 0 0 20px rgba(155, 148, 224, 0.05);
    text-shadow: 0 0 15px rgba(192, 186, 255, 0.5);
  }
</style>
