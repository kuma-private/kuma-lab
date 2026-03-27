<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ceremony } from '$lib/state/machine.svelte';
  import type { CodeLine } from '$lib/state/types';

  let response = $derived(ceremony.response);
  let sinLines = $derived(response?.lines ?? []);
  let fsharpCode = $derived(response?.fs ?? '');
  let fsharpLines = $derived(fsharpCode.split('\n'));

  // Track which sin lines are still visible (index -> visible)
  let visibleSinLines = $state<boolean[]>([]);
  // Track how many F# lines are shown
  let fsharpVisibleCount = $state(0);
  // Flash effects
  let purpleFlash = $state(false);
  let goldFlash = $state(false);
  let isComplete = $state(false);
  // Dynamic title based on act
  let currentTitle = $state('⚗ 罪と対峙中 ⚗');

  let sinInterval: ReturnType<typeof setInterval>;
  let fsharpInterval: ReturnType<typeof setInterval>;

  function getActTimings(progress: number): { sinDelay: number; fsharpDelay: number } {
    if (progress < 0.4) {
      // Act I: slow, deliberate
      return { sinDelay: 500, fsharpDelay: 700 };
    } else if (progress < 0.8) {
      // Act II: accelerating
      return { sinDelay: 200, fsharpDelay: 350 };
    } else {
      // Act III: furious
      return { sinDelay: 100, fsharpDelay: 200 };
    }
  }

  function updateTitle(progress: number) {
    if (progress < 0.4) {
      currentTitle = '⚗ 罪と対峙中 ⚗';
    } else if (progress < 0.8) {
      currentTitle = '⚗ 浄化加速 ⚗';
    } else {
      currentTitle = '✦ 罪は消滅する ✦';
    }
  }

  onMount(() => {
    // Initialize all sin lines as visible
    visibleSinLines = sinLines.map(() => true);

    // Build removal order: lines with sins first, then the rest
    const sinIndices: number[] = [];
    const nonSinIndices: number[] = [];
    sinLines.forEach((line, i) => {
      if (line.s) {
        sinIndices.push(i);
      } else {
        nonSinIndices.push(i);
      }
    });
    const removalOrder = [...sinIndices, ...nonSinIndices];
    let removalStep = 0;
    const totalSteps = removalOrder.length;

    function scheduleSinRemoval() {
      if (removalStep >= totalSteps) {
        clearInterval(sinInterval);
        return;
      }

      const progress = totalSteps > 0 ? removalStep / totalSteps : 0;
      updateTitle(progress);
      const { sinDelay } = getActTimings(progress);

      sinInterval = setTimeout(() => {
        const idx = removalOrder[removalStep];
        visibleSinLines[idx] = false;
        visibleSinLines = [...visibleSinLines]; // trigger reactivity
        removalStep++;
        scheduleSinRemoval();
      }, sinDelay) as unknown as ReturnType<typeof setInterval>;
    }

    function scheduleFsharpAddition() {
      if (fsharpVisibleCount >= fsharpLines.length) {
        clearInterval(fsharpInterval);
        // Gold flash on completion
        goldFlash = true;
        isComplete = true;
        setTimeout(() => {
          goldFlash = false;
          ceremony.purifyComplete();
        }, 2000);
        return;
      }

      const progress = fsharpLines.length > 0 ? fsharpVisibleCount / fsharpLines.length : 0;
      const { fsharpDelay } = getActTimings(progress);

      fsharpInterval = setTimeout(() => {
        fsharpVisibleCount++;
        // Purple flash on each new line
        purpleFlash = true;
        setTimeout(() => { purpleFlash = false; }, 150);
        scheduleFsharpAddition();
      }, fsharpDelay) as unknown as ReturnType<typeof setInterval>;
    }

    // Start sin removal immediately
    scheduleSinRemoval();

    // Start F# addition slightly after
    setTimeout(() => {
      scheduleFsharpAddition();
    }, 800);
  });

  onDestroy(() => {
    clearTimeout(sinInterval as unknown as number);
    clearTimeout(fsharpInterval as unknown as number);
  });
</script>

<div class="purifying-phase">
  {#if purpleFlash}
    <div class="flash flash-purple"></div>
  {/if}
  {#if goldFlash}
    <div class="flash flash-gold"></div>
  {/if}

  <h2 class="title">{currentTitle}</h2>

  <div class="columns">
    <!-- Sin code (left) -->
    <div class="panel sin-panel" class:border-flare-java={!isComplete}>
      <div class="panel-header">
        <span class="panel-label sin-label">☠ 罪のコード</span>
      </div>
      <div class="panel-code">
        {#each sinLines as line, i}
          {#if visibleSinLines[i]}
            <div class="code-line sin-line">
              <span class="line-number">{i + 1}</span>
              <span class="line-content">{line.c}</span>
              {#if line.s}
                <span class="sin-badge">{line.s}</span>
              {/if}
            </div>
          {:else}
            <div class="code-line sin-line vanishing javaVanish">
              <span class="line-number">{i + 1}</span>
              <span class="line-content">{line.c}</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- F# code (right) -->
    <div class="panel fsharp-panel" class:border-flare-fsharp={fsharpVisibleCount > 0}>
      <div class="panel-header">
        <span class="panel-label fsharp-label">✦ F# 神聖コード</span>
      </div>
      <div class="panel-code">
        {#each fsharpLines.slice(0, fsharpVisibleCount) as line, i}
          <div class="code-line fsharp-line fsharpDescend" style="animation-delay: {i * 50}ms">
            <span class="line-number">{i + 1}</span>
            <span class="line-content">{line}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .purifying-phase {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem;
    gap: 1rem;
    position: relative;
    overflow: hidden;
  }

  .flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    animation: flashPulse 0.15s ease-out forwards;
  }

  .flash-purple {
    background: radial-gradient(circle at center, rgba(155, 100, 255, 0.3), transparent 70%);
  }

  .flash-gold {
    background: radial-gradient(circle at center, rgba(201, 184, 122, 0.5), transparent 70%);
    animation-duration: 2s;
  }

  @keyframes flashPulse {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }

  .title {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: 1.5rem;
    color: var(--gold, #c9b87a);
    margin: 0;
    flex-shrink: 0;
    text-align: center;
    opacity: 0.8;
    transition: all 0.5s ease-out;
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    width: 100%;
    max-width: 1200px;
    flex: 1;
    min-height: 0;
  }

  .panel {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
    min-height: 0;
  }

  .sin-panel {
    background: rgba(30, 15, 10, 0.6);
    border: 1px solid rgba(200, 50, 50, 0.2);
  }

  .border-flare-java {
    animation: borderFlareJava 2s ease-in-out infinite;
  }

  .fsharp-panel {
    background: rgba(15, 10, 30, 0.6);
    border: 1px solid rgba(155, 148, 224, 0.2);
  }

  .border-flare-fsharp {
    animation: borderFlareFsharp 2s ease-in-out infinite;
  }

  .panel-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    flex-shrink: 0;
  }

  .panel-label {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
  }

  .sin-label {
    color: var(--text-sin, #c87a60);
  }

  .fsharp-label {
    color: var(--text-fsharp, #9b94e0);
  }

  .panel-code {
    padding: 1rem;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
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
    opacity: 0.3;
    font-size: 0.7rem;
    user-select: none;
    flex-shrink: 0;
  }

  .line-content {
    white-space: pre;
    flex: 1;
  }

  .sin-line .line-number {
    color: var(--text-sin, #c87a60);
  }

  .sin-line .line-content {
    color: var(--text-sin, #c87a60);
  }

  .fsharp-line .line-number {
    color: var(--text-fsharp, #9b94e0);
  }

  .fsharp-line .line-content {
    color: var(--text-fsharp, #9b94e0);
  }

  .sin-badge {
    font-size: 0.6rem;
    padding: 0.1em 0.5em;
    background: var(--sin-null, #ff2200);
    color: #fff;
    border-radius: 3px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .vanishing {
    opacity: 0;
    height: 0;
    overflow: hidden;
    transition: opacity 0.3s, height 0.3s;
  }

  @media (max-width: 768px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
