<script lang="ts">
	import type { Track } from '$lib/types/song';
	import type { Bus, ChainNode, PluginRef } from '$lib/types/chain';
	import { songStore } from '$lib/stores/song.svelte';
	import NodeSlot from './NodeSlot.svelte';
	import PluginPicker from './PluginPicker.svelte';
	import ParamPopover from './ParamPopover.svelte';
	import SendKnob from './SendKnob.svelte';
	import MeterBar from './MeterBar.svelte';

	let {
		track,
		buses,
		onRename
	}: {
		track: Track;
		buses: Bus[];
		onRename?: (name: string) => void;
	} = $props();

	let pickerOpen = $state(false);
	let pickerPosition = $state(0);
	let popoverNode = $state<ChainNode | null>(null);
	let addSendOpen = $state(false);

	let chain = $derived(track.chain ?? []);
	let sends = $derived(track.sends ?? []);

	function formatDb(db: number): string {
		if (db <= -60) return '-inf';
		return `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
	}

	function openPickerAt(position: number) {
		pickerPosition = position;
		pickerOpen = true;
	}

	function handlePick(plugin: PluginRef) {
		songStore.addChainNode(track.id, pickerPosition, plugin);
		pickerOpen = false;
	}

	function handleBypass(nodeId: string, bypass: boolean) {
		songStore.setChainBypass(track.id, nodeId, bypass);
	}

	function handleRemove(nodeId: string) {
		songStore.removeChainNode(track.id, nodeId);
	}

	function handleParamChange(nodeId: string, paramId: string, value: number) {
		songStore.setChainParam(track.id, nodeId, paramId, value);
		// Keep popoverNode reference fresh so displayed value updates
		const fresh = (songStore.currentSong?.tracks.find((t) => t.id === track.id)?.chain ?? []).find(
			(n) => n.id === nodeId
		);
		if (fresh) popoverNode = fresh;
	}

	function handleSendLevel(sendId: string, level: number) {
		songStore.setSendLevel(track.id, sendId, level);
	}

	function handleSendRemove(sendId: string) {
		songStore.removeSend(track.id, sendId);
	}

	function handleAddSend(busId: string) {
		songStore.addSend(track.id, busId, 0.5, false);
		addSendOpen = false;
	}

	function handleVolume(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		songStore.setTrackVolume(track.id, v);
	}

	function handlePan(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		songStore.setTrackPan(track.id, v);
	}

	function handleMute() {
		songStore.setTrackMute(track.id, !track.mute);
	}

	function handleSolo() {
		songStore.setTrackSolo(track.id, !track.solo);
	}

	function getBusName(busId: string): string {
		return buses.find((b) => b.id === busId)?.name ?? busId.slice(0, 6);
	}

	function handleNameChange(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		if (onRename) onRename(v);
	}
</script>

<div class="strip" data-track-id={track.id}>
	<!-- Name -->
	<div class="name-row">
		<input class="name-input" value={track.name} oninput={handleNameChange} aria-label="トラック名" />
	</div>

	<!-- Insert chain -->
	<div class="section chain-section">
		<div class="section-label">Inserts</div>
		<div class="chain">
			{#each chain as node (node.id)}
				<NodeSlot
					{node}
					onOpenParams={() => (popoverNode = node)}
					onBypass={(b) => handleBypass(node.id, b)}
					onRemove={() => handleRemove(node.id)}
				/>
			{/each}
			<NodeSlot node={null} onAdd={() => openPickerAt(chain.length)} />
		</div>
	</div>

	<!-- Sends -->
	<div class="section sends-section">
		<div class="section-label">Sends</div>
		<div class="sends">
			{#each sends as send (send.id)}
				<SendKnob
					value={send.level}
					label={getBusName(send.destBusId)}
					min={0}
					max={1}
					onChange={(v) => handleSendLevel(send.id, v)}
					onRemove={() => handleSendRemove(send.id)}
				/>
			{/each}
			{#if buses.length > 0}
				{#if addSendOpen}
					<div class="add-send-list">
						{#each buses as bus (bus.id)}
							<button type="button" onclick={() => handleAddSend(bus.id)}>
								+ {bus.name}
							</button>
						{/each}
						<button type="button" class="cancel" onclick={() => (addSendOpen = false)}>
							cancel
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="add-send"
						onclick={() => (addSendOpen = true)}
						disabled={buses.length === 0}
					>
						+ Send
					</button>
				{/if}
			{:else}
				<div class="no-bus">バスなし</div>
			{/if}
		</div>
	</div>

	<!-- Pan -->
	<div class="section pan-section">
		<div class="section-label">Pan</div>
		<input
			type="range"
			class="pan-slider"
			min="-1"
			max="1"
			step="0.01"
			value={track.pan ?? 0}
			oninput={handlePan}
			aria-label="パン"
		/>
	</div>

	<!-- Fader + Meter -->
	<div class="section fader-section">
		<div class="db-display">{formatDb(track.volume)}</div>
		<div class="fader-row">
			<input
				type="range"
				class="fader"
				min="-60"
				max="12"
				step="0.5"
				value={track.volume}
				oninput={handleVolume}
				aria-label="音量"
			/>
			<MeterBar trackId={track.id} />
		</div>
	</div>

	<!-- Mute / Solo -->
	<div class="ms-row">
		<button
			class="ms-btn"
			class:active={track.mute}
			onclick={handleMute}
			aria-label="ミュート"
			aria-pressed={track.mute}
		>
			M
		</button>
		<button
			class="ms-btn solo"
			class:active={track.solo}
			onclick={handleSolo}
			aria-label="ソロ"
			aria-pressed={track.solo}
		>
			S
		</button>
	</div>
</div>

{#if pickerOpen}
	<PluginPicker onPick={handlePick} onClose={() => (pickerOpen = false)} />
{/if}

{#if popoverNode}
	<ParamPopover
		node={popoverNode}
		onParamChange={(paramId, v) => {
			if (popoverNode) handleParamChange(popoverNode.id, paramId, v);
		}}
		onClose={() => (popoverNode = null)}
	/>
{/if}

<style>
	.strip {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 124px;
		min-width: 124px;
		padding: 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}

	.name-row {
		display: flex;
		align-items: center;
	}
	.name-input {
		width: 100%;
		padding: 3px 6px;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-primary);
		background: var(--bg-base);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
	}
	.name-input:hover {
		border-color: var(--border-subtle);
	}
	.name-input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 4px 0;
		border-top: 1px solid var(--border-subtle);
	}
	.section-label {
		font-family: var(--font-sans);
		font-size: 0.58rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
	}

	.chain {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sends {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.add-send {
		background: none;
		border: 1px dashed var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: 0.65rem;
		padding: 2px 6px;
		cursor: pointer;
	}
	.add-send:hover:not(:disabled) {
		color: var(--accent-primary);
		border-color: rgba(232, 168, 76, 0.5);
	}
	.add-send:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.add-send-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		padding: 3px;
	}
	.add-send-list button {
		padding: 3px 6px;
		font-size: 0.65rem;
		background: none;
		border: none;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		border-radius: 2px;
	}
	.add-send-list button:hover {
		background: var(--bg-hover);
	}
	.add-send-list .cancel {
		color: var(--text-muted);
	}
	.no-bus {
		font-size: 0.6rem;
		color: var(--text-muted);
		font-style: italic;
		text-align: center;
	}

	.pan-section {
		display: flex;
		flex-direction: column;
	}
	.pan-slider {
		width: 100%;
		height: 2px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--bg-base);
		border-radius: 1px;
		outline: none;
		padding: 0;
		border: none;
		cursor: pointer;
	}
	.pan-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-primary);
		cursor: pointer;
		border: none;
	}
	.pan-slider::-moz-range-thumb {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-primary);
		cursor: pointer;
		border: none;
	}

	.fader-section {
		flex: 1;
		min-height: 180px;
	}
	.db-display {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-muted);
		text-align: center;
		min-height: 14px;
	}
	.fader-row {
		display: flex;
		align-items: stretch;
		justify-content: center;
		gap: 6px;
		flex: 1;
		min-height: 150px;
	}
	.fader {
		writing-mode: vertical-lr;
		direction: rtl;
		width: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--border-subtle);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
		padding: 0;
		border: none;
	}
	.fader::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 22px;
		height: 10px;
		border-radius: 3px;
		background: var(--text-secondary);
		border: 1px solid var(--border-default);
		cursor: pointer;
	}
	.fader:hover::-webkit-slider-thumb {
		background: var(--accent-warm);
	}
	.fader::-moz-range-thumb {
		width: 22px;
		height: 10px;
		border-radius: 3px;
		background: var(--text-secondary);
		border: 1px solid var(--border-default);
		cursor: pointer;
	}

	.ms-row {
		display: flex;
		gap: 4px;
		padding-top: 4px;
		border-top: 1px solid var(--border-subtle);
	}
	.ms-btn {
		flex: 1;
		height: 22px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}
	.ms-btn:hover {
		border-color: var(--border-default);
		color: var(--text-primary);
	}
	.ms-btn.active {
		background: var(--error);
		color: #fff;
		border-color: var(--error);
	}
	.ms-btn.solo.active {
		background: var(--accent-warm);
		color: #000;
		border-color: var(--accent-warm);
	}
</style>
