<script lang="ts">
	import { bridgeStore } from '$lib/stores/bridge.svelte';

	let { trackId, height = 140 }: { trackId: string; height?: number } = $props();

	// Read per-track meter. Phase 5: no events update this so bars stay at 0.
	let level = $derived(bridgeStore.meters[trackId] ?? { peak: 0, rms: 0 });

	function toPct(v: number): number {
		// Clamp 0..1 to a percent.
		const clamped = Math.max(0, Math.min(1, v));
		return clamped * 100;
	}
</script>

<div class="meter" style="height: {height}px" aria-label="レベルメーター" aria-hidden="true">
	<div class="channel">
		<div class="bar peak" style="height: {toPct(level.peak)}%"></div>
		<div class="bar rms" style="height: {toPct(level.rms)}%"></div>
	</div>
	<div class="channel">
		<div class="bar peak" style="height: {toPct(level.peak)}%"></div>
		<div class="bar rms" style="height: {toPct(level.rms)}%"></div>
	</div>
</div>

<style>
	.meter {
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: 3px;
		width: 14px;
		flex-shrink: 0;
	}
	.channel {
		position: relative;
		flex: 1;
		background: linear-gradient(
			to top,
			#1e1b12 0%,
			#2a241a 40%,
			#3a3020 60%,
			#4a3a24 80%,
			#6a4a28 100%
		);
		overflow: hidden;
		border-radius: 1px;
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		transition: height 0.06s linear;
	}
	.bar.peak {
		background: linear-gradient(
			to top,
			#7cb882 0%,
			#7cb882 55%,
			#e8a84c 75%,
			#e06050 100%
		);
		opacity: 0.95;
	}
	.bar.rms {
		background: rgba(232, 168, 76, 0.25);
		pointer-events: none;
	}
</style>
