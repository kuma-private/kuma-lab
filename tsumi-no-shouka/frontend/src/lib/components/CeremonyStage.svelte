<script lang="ts">
  import { ceremony } from '$lib/state/machine.svelte';
  import IdlePhase from './IdlePhase.svelte';
  import SummoningPhase from './SummoningPhase.svelte';
  import ShowingPhase from './ShowingPhase.svelte';
  import PurifyingPhase from './PurifyingPhase.svelte';
  import DonePhase from './DonePhase.svelte';
  import { fade } from 'svelte/transition';
</script>

<div class="ceremony-stage">
  {#if ceremony.phase === 'IDLE'}
    <div class="phase-wrapper" transition:fade={{ duration: 400 }}>
      <IdlePhase />
    </div>
  {:else if ceremony.phase === 'SUMMONING'}
    <div class="phase-wrapper" transition:fade={{ duration: 400 }}>
      <SummoningPhase />
    </div>
  {:else if ceremony.phase === 'SHOWING'}
    <div class="phase-wrapper" transition:fade={{ duration: 400 }}>
      <ShowingPhase />
    </div>
  {:else if ceremony.phase === 'PURIFYING'}
    <div class="phase-wrapper" transition:fade={{ duration: 400 }}>
      <PurifyingPhase />
    </div>
  {:else if ceremony.phase === 'DONE'}
    <div class="phase-wrapper" transition:fade={{ duration: 400 }}>
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
