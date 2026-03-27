<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ceremony } from '$lib/state/machine.svelte';
  import Pentagram from './Pentagram.svelte';
  import CodeRain from './CodeRain.svelte';
  import GlitchOverlay from './GlitchOverlay.svelte';

  const ritualMessages = [
    '深淵の門を開放中...',
    '罪の気配を探知中...',
    '闇の回廊を通過中...',
  ];

  const accelerationMessages = [
    'NullPointerExceptionが覚醒した...',
    'BoilerPlateが無限に増殖している...',
    '型安全の壁が崩壊していく...',
    '副作用が制御不能に陥った...',
    'getter/setterの地獄が口を開けた...',
    'GOTOの呪縛が蔓延している...',
  ];

  const crescendoMessages = [
    '検出: AbstractSingletonProxyFactoryBean',
    '警告: 冗長性レベル — 致命的',
    '危険: 可読性が消失',
    '限界突破 —',
  ];

  type Stage = 'ritual' | 'acceleration' | 'crescendo' | 'held-breath';

  let stage = $state<Stage>('ritual');
  let messageIndex = $state(0);
  let elapsedTime = $state(0);
  let completionShown = $state(false);
  let heldBreathText = $state('');

  let timerInterval: ReturnType<typeof setInterval>;
  let messageInterval: ReturnType<typeof setInterval>;
  let startTime: number;
  let apiDone = false;
  let crescendoReached = false;

  function getCurrentMessages(): string[] {
    if (stage === 'ritual') return ritualMessages;
    if (stage === 'acceleration') return accelerationMessages;
    if (stage === 'crescendo') return crescendoMessages;
    return [];
  }

  function getMessageInterval(): number {
    if (stage === 'ritual') return 2500;
    if (stage === 'acceleration') {
      const progress = Math.min(1, (elapsedTime - 4000) / 4000);
      return 2000 - progress * 500;
    }
    if (stage === 'crescendo') {
      const progress = Math.min(1, (elapsedTime - 8000) / 4000);
      return 1500 - progress * 500;
    }
    return 1500;
  }

  function getPentagramSpeed(): number {
    if (stage === 'ritual') return 8;
    if (stage === 'acceleration') return 4;
    if (stage === 'crescendo') return 1.5;
    if (stage === 'held-breath') return 12; // slow back down dramatically
    return 8;
  }

  function enterHeldBreath() {
    if (completionShown) return;
    completionShown = true;
    stage = 'held-breath';
    heldBreathText = '';
    clearInterval(messageInterval);
    clearInterval(timerInterval);

    // 800ms pause (silence), then reveal
    setTimeout(() => {
      heldBreathText = '...降臨';
      // After 600ms showing the text, transition
      setTimeout(() => {
        ceremony.summonComplete();
      }, 600);
    }, 800);
  }

  function scheduleNextMessage() {
    clearInterval(messageInterval);
    if (stage === 'held-breath' || completionShown) return;

    const interval = getMessageInterval();
    messageInterval = setInterval(() => {
      const msgs = getCurrentMessages();
      if (msgs.length > 0) {
        messageIndex = (messageIndex + 1) % msgs.length;
      }
      // Re-schedule with potentially new interval
      scheduleNextMessage();
    }, interval);
  }

  onMount(() => {
    startTime = Date.now();

    timerInterval = setInterval(() => {
      elapsedTime = Date.now() - startTime;

      // Check API completion
      if (!ceremony.isLoading) {
        apiDone = true;
      }

      // Stage transitions based on elapsed time (slower progression)
      if (elapsedTime < 4000) {
        if (stage !== 'ritual') {
          stage = 'ritual';
          messageIndex = 0;
          scheduleNextMessage();
        }
      } else if (elapsedTime < 8000) {
        if (stage === 'ritual') {
          stage = 'acceleration';
          messageIndex = 0;
          scheduleNextMessage();
        }
      } else if (elapsedTime >= 8000) {
        if (stage === 'acceleration') {
          stage = 'crescendo';
          crescendoReached = true;
          messageIndex = 0;
          scheduleNextMessage();
        }
      }

      // Enter held-breath when API done AND crescendo reached
      if (apiDone && crescendoReached && stage !== 'held-breath') {
        enterHeldBreath();
      }

      // Safety: if API done before crescendo, let it reach crescendo first
      // but if we've been waiting too long (15s+), force held-breath
      if (apiDone && elapsedTime > 15000 && !completionShown) {
        crescendoReached = true;
        enterHeldBreath();
      }
    }, 50);

    // Start initial message cycling
    scheduleNextMessage();
  });

  onDestroy(() => {
    clearInterval(messageInterval);
    clearInterval(timerInterval);
  });

  let currentMessage = $derived(
    stage === 'held-breath'
      ? heldBreathText
      : getCurrentMessages()[messageIndex % getCurrentMessages().length] ?? ''
  );

  let pentagramSpeed = $derived(getPentagramSpeed());
</script>

<div class="summoning-phase">
  <CodeRain />
  <GlitchOverlay />

  <div class="content">
    <h1 class="title titleGlowRed">⛧ 悪魔召喚中 ⛧</h1>

    <div class="pentagram-wrapper" class:held-breath={stage === 'held-breath'}>
      <Pentagram size={240} speed={pentagramSpeed} />
    </div>

    {#if stage === 'held-breath' && heldBreathText}
      <p class="status completion-flash">{heldBreathText}</p>
    {:else if stage === 'held-breath'}
      <p class="status">&nbsp;</p>
    {:else}
      <p class="status" class:stage-crescendo={stage === 'crescendo'} class:stage-acceleration={stage === 'acceleration'}>
        {currentMessage}
      </p>
    {/if}

    <div class="loading-bar">
      <div
        class="loading-bar-fill"
        class:accelerating={stage === 'acceleration'}
        class:crescendo={stage === 'crescendo'}
        class:paused={stage === 'held-breath'}
      ></div>
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
    transition: opacity 0.3s;
  }

  .pentagram-wrapper.held-breath {
    opacity: 0.4;
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
    transition: color 0.3s, font-size 0.3s;
  }

  .stage-acceleration {
    color: #ff6644;
    font-size: 0.95rem;
  }

  .stage-crescendo {
    color: #ff2200;
    font-size: 0.9rem;
    text-shadow: 0 0 10px rgba(255, 34, 0, 0.4);
    animation: summonFlicker 0.2s ease-out;
  }

  .completion-flash {
    color: #ffcc00;
    text-shadow: 0 0 20px rgba(255, 200, 0, 0.6);
    font-weight: 700;
    font-size: 1.2rem;
    animation: completionPulse 0.6s ease-out;
  }

  @keyframes completionPulse {
    0% { opacity: 0; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
  }

  .loading-bar {
    width: 300px;
    height: 3px;
    background: rgba(200, 0, 0, 0.2);
    border-radius: 1.5px;
    overflow: hidden;
    box-shadow: 0 0 8px rgba(255, 34, 0, 0.4), 0 0 16px rgba(255, 34, 0, 0.2);
  }

  .loading-bar-fill {
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, #ff2200, #cc0000, #ff2200);
    animation: loadingSlide 2s ease-in-out infinite;
    transform-origin: left;
  }

  .loading-bar-fill.accelerating {
    animation-duration: 1s;
  }

  .loading-bar-fill.crescendo {
    animation-duration: 0.4s;
    background: linear-gradient(90deg, #ff2200, #ff6600, #ff2200);
  }

  .loading-bar-fill.paused {
    animation-play-state: paused;
    opacity: 0.3;
  }

  @keyframes loadingSlide {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }
</style>
