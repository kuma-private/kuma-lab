<script lang="ts">
  import { ceremony } from '$lib/state/machine.svelte';
  import IdlePhase from './IdlePhase.svelte';
  import SummoningPhase from './SummoningPhase.svelte';
  import ShowingPhase from './ShowingPhase.svelte';
  import PurifyingPhase from './PurifyingPhase.svelte';
  import DonePhase from './DonePhase.svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
</script>

<div class="ceremony-stage">
  {#if ceremony.phase === 'IDLE'}
    <div class="phase-wrapper" in:fade={{ duration: 1000 }} out:fade={{ duration: 300 }}>
      <IdlePhase />
    </div>
  {:else if ceremony.phase === 'SUMMONING'}
    <div class="phase-wrapper" in:scale={{ start: 1.05, duration: 600, easing: cubicOut }} out:fade={{ duration: 200 }}>
      <SummoningPhase />
    </div>
  {:else if ceremony.phase === 'SHOWING'}
    <div class="phase-wrapper" in:fly={{ y: 50, duration: 800, easing: cubicOut }} out:fade={{ duration: 300 }}>
      <ShowingPhase />
    </div>
  {:else if ceremony.phase === 'PURIFYING'}
    <div class="phase-wrapper" in:fade={{ duration: 400 }} out:fade={{ duration: 300 }}>
      <PurifyingPhase />
    </div>
  {:else if ceremony.phase === 'DONE'}
    <div class="phase-wrapper" in:fly={{ y: -40, duration: 1000, easing: cubicOut }} out:fade={{ duration: 800 }}>
      <DonePhase />
    </div>
  {/if}
</div>

<style>
  .ceremony-stage {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--bg, #050508);
  }

  .phase-wrapper {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
</style>
