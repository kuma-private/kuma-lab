<script lang="ts">
  import { ceremony } from '$lib/state/machine.svelte';
</script>

<div class="idle-phase">
  <div class="ambient-fog"></div>

  <div class="content">
    <h1 class="title titleGlow">罪の昇華</h1>
    <p class="subtitle">— Sin Sublimation —</p>
    <p class="description">汝のコードに宿る罪を暴き、<br />神聖なるF#の光で浄化せよ</p>

    <button class="skull-button portalPulse" onclick={() => ceremony.summon()}>
      <span class="skull-icon">☠️</span>
    </button>

    <p class="instruction">魂を召喚せよ</p>

    {#if ceremony.error}
      <p class="error-message">{ceremony.error}</p>
      {#if ceremony.error.includes('ログイン')}
        <a href="/auth/google" class="login-link">Googleでログイン</a>
      {/if}
    {/if}
  </div>
</div>

<style>
  .idle-phase {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--gold, #c9b87a);
  }

  .ambient-fog {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at 50% 60%,
      rgba(100, 20, 20, 0.08) 0%,
      transparent 60%
    );
    pointer-events: none;
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
  }

  .title {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    font-weight: 900;
    letter-spacing: 0.15em;
    margin: 0;
    color: var(--gold, #c9b87a);
  }

  .subtitle {
    font-family: var(--font-title, 'Cinzel Decorative'), serif;
    font-size: 1.1rem;
    letter-spacing: 0.3em;
    opacity: 0.6;
    margin: 0;
  }

  .description {
    font-size: 1rem;
    line-height: 2;
    opacity: 0.5;
    margin: 1.5rem 0;
    color: #a09880;
  }

  .skull-button {
    background: none;
    border: 2px solid rgba(201, 184, 122, 0.3);
    border-radius: 50%;
    width: 120px;
    height: 120px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 1.5rem 0;
    transition: border-color 0.3s, box-shadow 0.3s;
    position: relative;
  }

  .skull-button::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 1px solid rgba(201, 184, 122, 0.1);
  }

  .skull-button:hover {
    border-color: rgba(201, 184, 122, 0.7);
    box-shadow: 0 0 40px rgba(201, 184, 122, 0.2), inset 0 0 30px rgba(201, 184, 122, 0.05);
  }

  .skull-icon {
    font-size: 3.5rem;
    filter: grayscale(0.3);
  }

  .instruction {
    font-size: 0.85rem;
    letter-spacing: 0.5em;
    text-transform: uppercase;
    opacity: 0.35;
    margin: 0;
  }

  .error-message {
    color: #ff4444;
    font-family: var(--font-code, 'JetBrains Mono'), monospace;
    font-size: 0.9rem;
    margin: 0;
    padding: 0.5rem 1rem;
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 4px;
    background: rgba(255, 0, 0, 0.05);
  }

  .login-link {
    color: var(--gold, #c9b87a);
    text-decoration: none;
    font-size: 1rem;
    padding: 0.6rem 2rem;
    border: 1px solid rgba(201, 184, 122, 0.4);
    border-radius: 4px;
    transition: all 0.3s;
  }

  .login-link:hover {
    background: rgba(201, 184, 122, 0.1);
    border-color: rgba(201, 184, 122, 0.7);
  }
</style>
