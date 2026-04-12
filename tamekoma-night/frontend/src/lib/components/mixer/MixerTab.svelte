<script lang="ts">
	import type { Song } from '$lib/types/song';
	import { songStore } from '$lib/stores/song.svelte';
	import { bridgeStore } from '$lib/stores/bridge.svelte';
	import ChannelStrip from './ChannelStrip.svelte';
	import MixerChat from './MixerChat.svelte';
	import BridgeOfflineCurtain from './BridgeOfflineCurtain.svelte';

	let { song }: { song: Song } = $props();

	let buses = $derived(song.buses ?? []);
	let master = $derived(song.master ?? { chain: [], volume: 1 });
	let online = $derived(bridgeStore.state === 'connected');

	// Synthetic "track" for the master strip so we can reuse ChannelStrip styles
	// where possible. Rendering the master strip bespoke though.
	function handleAddBus() {
		songStore.addBus(`Bus ${buses.length + 1}`);
	}

	function handleTrackRename(trackId: string, name: string) {
		songStore.updateTrack(trackId, { name });
	}
</script>

<div class="mixer-tab">
	<div class="mixer-rail" class:offline={!online}>
		<div class="strips">
			{#each song.tracks as track (track.id)}
				<ChannelStrip {track} {buses} onRename={(n) => handleTrackRename(track.id, n)} />
			{/each}

			<!-- Master strip -->
			<div class="master-strip">
				<div class="master-head">MASTER</div>
				<div class="master-chain">
					<div class="section-label">Inserts</div>
					{#if master.chain.length === 0}
						<div class="master-empty">(空)</div>
					{:else}
						{#each master.chain as node (node.id)}
							<div class="master-node" title={node.plugin.name}>
								{node.plugin.name}
							</div>
						{/each}
					{/if}
				</div>
				<div class="master-volume">
					<div class="db-display">{master.volume.toFixed(2)}</div>
					<input
						type="range"
						class="master-fader"
						min="0"
						max="2"
						step="0.01"
						value={master.volume}
						disabled
						aria-label="マスター音量"
					/>
				</div>
			</div>

			<!-- Add bus button -->
			<div class="add-bus-col">
				<button type="button" class="add-bus" onclick={handleAddBus}>+ Bus</button>
				{#each buses as bus (bus.id)}
					<div class="bus-pill">{bus.name}</div>
				{/each}
			</div>
		</div>

		{#if !online}
			<BridgeOfflineCurtain />
		{/if}
	</div>

	<MixerChat {song} />
</div>

<style>
	.mixer-tab {
		display: flex;
		flex: 1;
		min-height: 400px;
		background: var(--bg-base);
	}
	.mixer-rail {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		padding: var(--space-md);
	}
	.mixer-rail.offline .strips {
		pointer-events: none;
		opacity: 0.35;
	}
	.strips {
		display: flex;
		gap: var(--space-sm);
		align-items: stretch;
		min-width: max-content;
		height: 100%;
	}

	.master-strip {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 124px;
		min-width: 124px;
		padding: 8px;
		background: var(--bg-surface);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}
	.master-head {
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--accent-primary);
		text-align: center;
		letter-spacing: 1px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--border-subtle);
	}
	.master-chain {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.section-label {
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
	}
	.master-empty {
		font-size: 0.68rem;
		color: var(--text-muted);
		font-style: italic;
		padding: 4px 0;
	}
	.master-node {
		padding: 3px 4px;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: 3px;
		font-size: 0.66rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.master-volume {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding-top: 4px;
		border-top: 1px solid var(--border-subtle);
	}
	.db-display {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-muted);
	}
	.master-fader {
		writing-mode: vertical-lr;
		direction: rtl;
		width: 8px;
		flex: 1;
		min-height: 140px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--border-default);
		border-radius: 4px;
		outline: none;
		padding: 0;
		border: none;
	}
	.master-fader::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 24px;
		height: 12px;
		border-radius: 3px;
		background: var(--accent-primary);
		cursor: pointer;
		border: none;
	}
	.master-fader::-moz-range-thumb {
		width: 24px;
		height: 12px;
		border-radius: 3px;
		background: var(--accent-primary);
		cursor: pointer;
		border: none;
	}

	.add-bus-col {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		width: 100px;
		flex-shrink: 0;
	}
	.add-bus {
		background: none;
		border: 1px dashed var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: 0.68rem;
		padding: 4px 8px;
		cursor: pointer;
	}
	.add-bus:hover {
		color: var(--accent-primary);
		border-color: rgba(232, 168, 76, 0.5);
	}
	.bus-pill {
		padding: 3px 6px;
		font-size: 0.65rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		text-align: center;
	}
</style>
