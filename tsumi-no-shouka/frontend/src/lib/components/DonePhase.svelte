<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ceremony } from '$lib/state/machine.svelte';
  import DivineRays from './DivineRays.svelte';
  import CelebrationParticles from './CelebrationParticles.svelte';
  import { divineDescend } from '$lib/animations/transitions';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let response = $derived(ceremony.response);
  let sinLines = $derived(response?.lines ?? []);
  let fsharpCode = $derived(response?.fs ?? '');
  let fsharpLines = $derived(fsharpCode.split('\n'));
  let insight = $derived(response?.why ?? '');
  let theme = $derived(response?.theme ?? '');
  let language = $derived(response?.lang ?? '');

  let sinCount = $derived(sinLines.filter((l) => l.s !== null).length);
  let originalLineCount = $derived(sinLines.length);
  let fsharpLineCount = $derived(fsharpLines.length);
  let reductionPercent = $derived(
    originalLineCount > 0
      ? Math.round(((originalLineCount - fsharpLineCount) / originalLineCount) * 100)
      : 0
  );
  let purityScore = $derived(
    Math.max(0, Math.min(100, 100 - sinCount * 12))
  );

  let revealStep = $state(0);
  let displayedReduction = $state(0);
  let displayedSinCount = $state(0);
  let copySuccess = $state(false);

  let reductionInterval: ReturnType<typeof setInterval>;
  let sinCountInterval: ReturnType<typeof setInterval>;
  let timeouts: ReturnType<typeof setTimeout>[] = [];

  function countUpReduction() {
    const target = reductionPercent;
    if (target <= 0) { displayedReduction = 0; return; }
    const stepDuration = Math.max(10, 1000 / target);
    reductionInterval = setInterval(() => {
      displayedReduction++;
      if (displayedReduction >= target) {
        displayedReduction = target;
        clearInterval(reductionInterval);
      }
    }, stepDuration);
  }

  function countUpSins() {
    const target = sinCount;
    if (target <= 0) { displayedSinCount = 0; return; }
    sinCountInterval = setInterval(() => {
      displayedSinCount++;
      if (displayedSinCount >= target) {
        displayedSinCount = target;
        clearInterval(sinCountInterval);
      }
    }, 80);
  }

  function shareOnX() {
    const text = `罪の昇華 ⚜ Sin Sublimation\n\n${theme}\n${language} → F# で ${reductionPercent}% 削減\n\n${insight}\n\nhttps://tsumi-no-shouka.dev`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  async function copyToClipboard() {
    const text = `// 罪の昇華 — ${theme}\n// ${insight}\n\n${fsharpCode}`;
    try {
      await navigator.clipboard.writeText(text);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    }
  }

  onMount(() => {
    timeouts.push(setTimeout(() => { revealStep = 1; }, 300));    // Title
    timeouts.push(setTimeout(() => { revealStep = 2; }, 1500));   // F# code
    timeouts.push(setTimeout(() => {
      revealStep = 3;  // Metrics
      countUpReduction();
      countUpSins();
    }, 2800));
    timeouts.push(setTimeout(() => { revealStep = 4; }, 4200));   // Insight
    timeouts.push(setTimeout(() => { revealStep = 5; }, 5200));   // Original code
    timeouts.push(setTimeout(() => { revealStep = 6; }, 6200));   // Action buttons
  });

  onDestroy(() => {
    timeouts.forEach(clearTimeout);
    clearInterval(reductionInterval);
    clearInterval(sinCountInterval);
  });
</script>

<div class="done-phase" in:divineDescend={{ duration: 1000 }}>
  <DivineRays intensity="triumphant" />
  <CelebrationParticles />

  <div class="content">
    {#if revealStep >= 1}
      <div in:fade={{ duration: 800, easing: cubicOut }}>
        <h1 class="title titleGlow">⚜ 浄化完了 ⚜</h1>
      </div>
    {/if}

    <!-- F# Code Display -->
    {#if revealStep >= 2}
      <div class="fsharp-panel victoryPulse" in:fly={{ y: 30, duration: 800, easing: cubicOut }}>
        <div class="panel-header">
          <span class="panel-label">✦ 神聖なるF#コード</span>
          <span class="language-tag">F#</span>
        </div>
        <div class="panel-code">
          {#each fsharpLines as line, i}
            <div class="code-line" style="animation-delay: {i * 40}ms">
              <span class="line-number">{i + 1}</span>
              <span class="line-content">{line}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Metrics -->
    {#if revealStep >= 3}
      <div class="metrics-section" in:fly={{ y: 20, duration: 600, easing: cubicOut }}>
        <div class="metric-row">
          <div class="metric reduction-metric">
            <span class="metric-label">元コード</span>
            <span class="metric-value">{originalLineCount}行</span>
            <span class="metric-arrow">→</span>
            <span class="metric-label">削減率</span>
            <span class="metric-value highlight">{displayedReduction}%</span>
            <span class="metric-arrow">→</span>
            <span class="metric-label">F#</span>
            <span class="metric-value fsharp-value">{fsharpLineCount}行</span>
          </div>
        </div>

        <div class="metric-row">
          <div class="metric purity-metric">
            <span class="metric-label">魂の純度</span>
            <div class="purity-bar">
              <div class="purity-fill" style="width: {purityScore}%"></div>
            </div>
            <span class="metric-value purity-value">{purityScore}%</span>
          </div>
        </div>

        <div class="metric-row">
          <div class="metric sin-count-metric">
            <span class="metric-label">検出された罪</span>
            <span class="metric-value sin-value">{displayedSinCount}個</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Insight -->
    {#if revealStep >= 4 && insight}
      <div class="insight-panel" in:fade={{ duration: 800, easing: cubicOut }}>
        <p class="insight-label">✧ 神託 ✧</p>
        <p class="insight-text">{insight}</p>
      </div>
    {/if}

    <!-- Original code (成仏 display) -->
    {#if revealStep >= 5}
      <div class="original-section" in:fade={{ duration: 600, easing: cubicOut }}>
        <div class="original-header">
          <span class="original-label">† 成仏したコード ({language})</span>
        </div>
        <div class="original-code">
          {#each sinLines as line, i}
            <div class="code-line original-line">
              <span class="line-number">{i + 1}</span>
              <span class="line-content">{line.c}</span>
              {#if line.s}
                <span class="original-sin">{line.s}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Actions -->
    {#if revealStep >= 6}
      <div class="actions" in:fly={{ y: 20, duration: 600, easing: cubicOut }}>
        <button class="action-btn share-btn" onclick={shareOnX}>
          <span class="btn-icon">𝕏</span>
          <span>共有する</span>
        </button>

        <button class="action-btn copy-btn" onclick={copyToClipboard}>
          <span class="btn-icon">{copySuccess ? '✓' : '📋'}</span>
          <span>{copySuccess ? 'コピー完了' : 'コピー'}</span>
        </button>

        <button class="action-btn restart-btn portalPulse" onclick={() => ceremony.reset()}>
          もう一度召喚する
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .done-phase {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    padding: 2rem;
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
    max-width: 900px;
  }

  .title {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 900;
    color: var(--gold, #c9b87a);
    margin: 0;
    text-align: center;
    letter-spacing: 0.1em;
  }

  /* F# Panel */
  .fsharp-panel {
    width: 100%;
    background: rgba(15, 10, 30, 0.7);
    border: 1px solid rgba(155, 148, 224, 0.3);
    border-radius: 8px;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(155, 148, 224, 0.1);
  }

  .panel-label {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.8rem;
    color: var(--text-fsharp, #9b94e0);
    letter-spacing: 0.1em;
  }

  .language-tag {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.7rem;
    padding: 0.2em 0.6em;
    border: 1px solid rgba(155, 148, 224, 0.3);
    border-radius: 3px;
    color: var(--text-fsharp-bright, #c0baff);
  }

  .panel-code {
    padding: 1rem;
    overflow-x: auto;
  }

  .code-line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.15rem 0.25rem;
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.8rem;
  }

  .line-number {
    min-width: 2em;
    text-align: right;
    color: var(--text-fsharp, #9b94e0);
    opacity: 0.3;
    font-size: 0.7rem;
    user-select: none;
    flex-shrink: 0;
  }

  .line-content {
    white-space: pre;
    color: var(--text-fsharp-bright, #c0baff);
    flex: 1;
  }

  /* Metrics */
  .metrics-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .metric-row {
    display: flex;
    justify-content: center;
  }

  .metric {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1.2rem;
    background: rgba(20, 18, 30, 0.6);
    border: 1px solid rgba(201, 184, 122, 0.15);
    border-radius: 6px;
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.85rem;
  }

  .metric-label {
    color: rgba(201, 184, 122, 0.6);
    font-size: 0.75rem;
  }

  .metric-value {
    color: var(--gold, #c9b87a);
    font-weight: 700;
  }

  .metric-arrow {
    color: rgba(201, 184, 122, 0.3);
  }

  .highlight {
    font-size: 1.1rem;
    text-shadow: 0 0 10px rgba(201, 184, 122, 0.4);
  }

  .fsharp-value {
    color: var(--text-fsharp-bright, #c0baff);
  }

  .sin-value {
    color: #ff4444;
  }

  .purity-metric {
    flex: 1;
    max-width: 400px;
  }

  .purity-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    overflow: hidden;
  }

  .purity-fill {
    height: 100%;
    background: linear-gradient(90deg, #9b94e0, #c0baff);
    border-radius: 3px;
    transition: width 1.5s ease-out;
  }

  .purity-value {
    color: var(--text-fsharp-bright, #c0baff);
  }

  /* Insight */
  .insight-panel {
    width: 100%;
    padding: 1.2rem 1.5rem;
    background: rgba(201, 184, 122, 0.03);
    border: 1px solid rgba(201, 184, 122, 0.15);
    border-radius: 8px;
    text-align: center;
  }

  .insight-label {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: 0.85rem;
    color: var(--gold, #c9b87a);
    opacity: 0.6;
    margin: 0 0 0.5rem;
    letter-spacing: 0.2em;
  }

  .insight-text {
    font-size: 0.95rem;
    line-height: 1.8;
    color: rgba(201, 184, 122, 0.8);
    margin: 0;
  }

  /* Original code */
  .original-section {
    width: 100%;
    background: rgba(20, 15, 10, 0.5);
    border: 1px solid rgba(200, 122, 96, 0.2);
    border-radius: 8px;
    overflow: hidden;
  }

  .original-header {
    padding: 0.6rem 1rem;
    border-bottom: 1px solid rgba(200, 122, 96, 0.08);
  }

  .original-label {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.75rem;
    color: rgba(200, 122, 96, 0.5);
    letter-spacing: 0.1em;
  }

  .original-code {
    padding: 1rem;
    overflow-x: auto;
  }

  .original-line {
    font-size: 0.75rem;
  }

  .original-line .line-number {
    color: rgba(200, 122, 96, 0.5);
  }

  .original-line .line-content {
    color: rgba(200, 122, 96, 0.85);
  }

  .original-sin {
    font-size: 0.65rem;
    color: #ff6644;
    margin-left: auto;
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* Actions */
  .actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
    padding-bottom: 2rem;
  }

  .action-btn {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.85rem;
    padding: 0.6rem 1.5rem;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.3s;
    background: none;
  }

  .share-btn {
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .share-btn:hover {
    border-color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.05);
  }

  .copy-btn {
    color: var(--gold, #c9b87a);
    border: 1px solid rgba(201, 184, 122, 0.2);
  }

  .copy-btn:hover {
    border-color: rgba(201, 184, 122, 0.5);
    background: rgba(201, 184, 122, 0.05);
  }

  .restart-btn {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    color: var(--text-fsharp-bright, #c0baff);
    border: 2px solid rgba(155, 148, 224, 0.3);
    padding: 0.7rem 2rem;
    font-size: 0.9rem;
    letter-spacing: 0.1em;
  }

  .restart-btn:hover {
    border-color: rgba(155, 148, 224, 0.7);
    box-shadow: 0 0 25px rgba(155, 148, 224, 0.15);
  }

  .btn-icon {
    font-size: 1.1rem;
  }
</style>
