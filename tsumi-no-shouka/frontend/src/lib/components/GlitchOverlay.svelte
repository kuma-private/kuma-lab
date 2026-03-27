<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let { active = true }: { active?: boolean } = $props();
  let glitching = $state(false);
  let interval: ReturnType<typeof setInterval>;

  onMount(() => {
    interval = setInterval(() => {
      if (!active) return;
      glitching = true;
      setTimeout(() => { glitching = false; }, 200);
    }, 3000 + Math.random() * 2000);
  });

  onDestroy(() => clearInterval(interval));
</script>

{#if glitching}
  <div class="glitch-overlay">
    <div class="glitch-slice slice-1"></div>
    <div class="glitch-slice slice-2"></div>
    <div class="glitch-slice slice-3"></div>
  </div>
{/if}

<style>
  .glitch-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    pointer-events: none;
  }
  .glitch-slice {
    position: absolute;
    left: 0;
    right: 0;
    background: rgba(255, 0, 0, 0.03);
    animation: glitchSlice 200ms steps(1) forwards;
  }
  .slice-1 { top: 15%; height: 8%; animation-delay: 0ms; }
  .slice-2 { top: 45%; height: 12%; animation-delay: 50ms; }
  .slice-3 { top: 75%; height: 6%; animation-delay: 100ms; }
</style>
