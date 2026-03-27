<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ceremony } from '$lib/state/machine.svelte';
  import Pentagram from './Pentagram.svelte';
  import CodeRain from './CodeRain.svelte';

  const statusMessages = [
    '地獄の門を開放中...',
    'NullPointerを召喚中...',
    'BoilerPlateを積み上げ中...',
    '型安全を破壊中...',
    '副作用を蔓延させ中...',
    'GOTO文を埋め込み中...'
  ];

  let messageIndex = $state(0);
  let messageInterval: ReturnType<typeof setInterval>;
  let startTime: number;
  let completionShown = $state(false);
  let checkInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    startTime = Date.now();

    messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % statusMessages.length;
    }, 2000);

    checkInterval = setInterval(() => {
      if (!ceremony.isLoading && Date.now() - startTime >= 3000 && !completionShown) {
        completionShown = true;
        clearInterval(checkInterval);
        clearInterval(messageInterval);

        setTimeout(() => {
          ceremony.summonComplete();
        }, 500);
      }
    }, 100);
  });

  onDestroy(() => {
    clearInterval(messageInterval);
    clearInterval(checkInterval);
  });
</script>

<div class="summoning-phase">
  <CodeRain />

  <div class="content">
    <h1 class="title titleGlowRed">⛧ 悪魔召喚中 ⛧</h1>

    <div class="pentagram-wrapper">
      <Pentagram size={240} />
    </div>

    {#if completionShown}
      <p class="status completion-flash">⚡ 召喚完了 — 悪魔が降臨する...</p>
    {:else}
      <p class="status" key={messageIndex}>{statusMessages[messageIndex]}</p>
    {/if}

    <div class="loading-bar">
      <div class="loading-bar-fill"></div>
    </div>
  </div>
</div>

<style>
  .summoning-phase {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  .title {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: clamp(1.8rem, 4vw, 3rem);
    font-weight: 700;
    color: #ff2200;
    letter-spacing: 0.1em;
    margin: 0;
    text-align: center;
  }

  .pentagram-wrapper {
    position: relative;
  }

  .pentagram-wrapper::after {
    content: '';
    position: absolute;
    inset: -40px;
    background: radial-gradient(circle, rgba(200, 0, 0, 0.1) 0%, transparent 70%);
    pointer-events: none;
    border-radius: 50%;
  }

  .status {
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 1rem;
    color: #cc4444;
    letter-spacing: 0.05em;
    margin: 0;
    min-height: 1.5em;
    animation: summonFlicker 0.5s ease-out;
  }

  .completion-flash {
    color: #ffcc00;
    text-shadow: 0 0 20px rgba(255, 200, 0, 0.6);
    font-weight: 700;
  }

  .loading-bar {
    width: 300px;
    height: 2px;
    background: rgba(200, 0, 0, 0.2);
    border-radius: 1px;
    overflow: hidden;
  }

  .loading-bar-fill {
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, #ff2200, #cc0000, #ff2200);
    animation: loadingSlide 2s ease-in-out infinite;
    transform-origin: left;
  }

  @keyframes loadingSlide {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }
</style>
