<script lang="ts">
  import { onMount } from 'svelte';

  let { color = 'red', intensity = 0.4, duration = 300, trigger = false }:
    { color?: 'red' | 'gold' | 'purple' | 'white'; intensity?: number; duration?: number; trigger?: boolean } = $props();

  let visible = $state(false);

  const colors = {
    red: '255, 34, 0',
    gold: '201, 184, 122',
    purple: '155, 100, 255',
    white: '255, 255, 255'
  };

  $effect(() => {
    if (trigger) {
      visible = true;
      setTimeout(() => { visible = false; }, duration);
    }
  });
</script>

{#if visible}
  <div class="flash" style="
    --flash-color: {colors[color]};
    --flash-intensity: {intensity};
    --flash-duration: {duration}ms;
  "></div>
{/if}

<style>
  .flash {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    background: radial-gradient(
      ellipse at center,
      rgba(var(--flash-color), var(--flash-intensity)),
      transparent 70%
    );
    animation: flashFade var(--flash-duration) ease-out forwards;
  }

  @keyframes flashFade {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
