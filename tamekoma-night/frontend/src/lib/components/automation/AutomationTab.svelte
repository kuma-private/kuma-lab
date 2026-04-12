<script lang="ts">
	import type { Song } from '$lib/types/song';
	import type { AutomationPoint } from '$lib/types/chain';
	import { songStore } from '$lib/stores/song.svelte';
	import { bridgeStore } from '$lib/stores/bridge.svelte';
	import { suggestAutomation } from '$lib/api';
	import { descriptorForPlugin } from '$lib/components/mixer/plugin-descriptors';
	import BridgeOfflineCurtain from '$lib/components/mixer/BridgeOfflineCurtain.svelte';
	import AutomationLane from './AutomationLane.svelte';
	import ParamTargetPicker from './ParamTargetPicker.svelte';

	let { song }: { song: Song } = $props();

	let online = $derived(bridgeStore.state === 'connected');

	let selectedTrackId = $state<string | null>(null);
	let pickerOpen = $state(false);

	// Keep selected track in sync with current song
	$effect(() => {
		if (song.tracks.length === 0) {
			selectedTrackId = null;
			return;
		}
		if (!selectedTrackId || !song.tracks.find((t) => t.id === selectedTrackId)) {
			selectedTrackId = song.tracks[0].id;
		}
	});

	let selectedTrack = $derived(
		selectedTrackId ? song.tracks.find((t) => t.id === selectedTrackId) ?? null : null
	);
	let lanes = $derived(selectedTrack?.automation ?? []);

	// Time signature → ticks per bar
	let ticksPerBar = $derived.by(() => {
		const TICKS_PER_QUARTER = 480;
		const [beatsRaw, valueRaw] = song.timeSignature.split('/');
		const beats = Number(beatsRaw);
		const value = Number(valueRaw);
		if (!Number.isFinite(beats) || !Number.isFinite(value) || beats <= 0 || value <= 0) {
			return TICKS_PER_QUARTER * 4;
		}
		return TICKS_PER_QUARTER * (4 / value) * beats;
	});

	let beatsPerBar = $derived.by(() => {
		const [beatsRaw] = song.timeSignature.split('/');
		const n = Number(beatsRaw);
		return Number.isFinite(n) && n > 0 ? n : 4;
	});

	// totalBars — same calculation as FlowEditor
	let totalBars = $derived.by(() => {
		let max = 8;
		for (const sec of song.sections) if (sec.endBar > max) max = sec.endBar;
		for (const t of song.tracks) {
			for (const b of t.blocks) if (b.endBar > max) max = b.endBar;
		}
		return max;
	});

	// Preview state: map of "nodeId:paramId" → preview info
	interface PreviewState {
		points: AutomationPoint[];
		startTick: number;
		endTick: number;
	}
	let previews = $state<Record<string, PreviewState>>({});

	function previewKey(nodeId: string, paramId: string): string {
		return `${nodeId}::${paramId}`;
	}

	function laneLabel(nodeId: string, paramId: string): string {
		const node = selectedTrack?.chain?.find((n) => n.id === nodeId);
		if (!node) return `${paramId} (${nodeId.slice(0, 6)})`;
		const desc = descriptorForPlugin(node.plugin);
		const param = desc?.params.find((p) => p.id === paramId);
		const paramLabel = param?.label ?? paramId;
		return `${paramLabel} (${node.plugin.name})`;
	}

	function handleAddLane(nodeId: string, paramId: string) {
		if (!selectedTrackId) return;
		songStore.addAutomationLane(selectedTrackId, nodeId, paramId);
		pickerOpen = false;
	}

	function handleRemoveLane(nodeId: string, paramId: string) {
		if (!selectedTrackId) return;
		songStore.removeAutomationLane(selectedTrackId, nodeId, paramId);
		const key = previewKey(nodeId, paramId);
		if (key in previews) {
			const { [key]: _, ...rest } = previews;
			previews = rest;
		}
	}

	async function handleRequestPreview(
		nodeId: string,
		paramId: string,
		req: { prompt: string; startTick: number; endTick: number }
	) {
		if (!selectedTrackId) return;
		const res = await suggestAutomation({
			trackId: selectedTrackId,
			nodeId,
			paramId,
			startTick: req.startTick,
			endTick: req.endTick,
			prompt: req.prompt,
			bpmBpb: [song.bpm, beatsPerBar]
		});
		const stamped: AutomationPoint[] = res.points.map((p) => ({
			id: crypto.randomUUID(),
			tick: p.tick,
			value: p.value,
			curve: p.curve
		}));
		previews = {
			...previews,
			[previewKey(nodeId, paramId)]: {
				points: stamped,
				startTick: req.startTick,
				endTick: req.endTick
			}
		};
	}

	function handleApplyPreview(nodeId: string, paramId: string) {
		if (!selectedTrackId) return;
		const key = previewKey(nodeId, paramId);
		const preview = previews[key];
		if (!preview) return;
		songStore.replaceAutomationRange(
			selectedTrackId,
			nodeId,
			paramId,
			preview.startTick,
			preview.endTick,
			preview.points.map((p) => ({ tick: p.tick, value: p.value, curve: p.curve }))
		);
		const { [key]: _, ...rest } = previews;
		previews = rest;
	}

	function handleCancelPreview(nodeId: string, paramId: string) {
		const key = previewKey(nodeId, paramId);
		if (!(key in previews)) return;
		const { [key]: _, ...rest } = previews;
		previews = rest;
	}
</script>

<div class="automation-tab">
	<div class="automation-rail" class:offline={!online}>
		<div class="rail-head">
			<label class="track-select-label" for="automation-track-select">
				<span class="label-text">Track</span>
				<select
					id="automation-track-select"
					class="track-select"
					value={selectedTrackId}
					onchange={(e) => (selectedTrackId = (e.target as HTMLSelectElement).value)}
					disabled={song.tracks.length === 0}
				>
					{#each song.tracks as t (t.id)}
						<option value={t.id}>{t.name}</option>
					{/each}
				</select>
			</label>
			<button
				type="button"
				class="add-lane-btn"
				onclick={() => (pickerOpen = true)}
				disabled={!selectedTrack}
			>
				+ Lane
			</button>
		</div>

		<div class="lanes">
			{#if !selectedTrack}
				<div class="empty">トラックがありません</div>
			{:else if lanes.length === 0}
				<div class="empty">
					オートメーションレーンがありません。[+ Lane] ボタンから追加してください。
				</div>
			{:else}
				{#each lanes as lane (lane.nodeId + ':' + lane.paramId)}
					{@const key = previewKey(lane.nodeId, lane.paramId)}
					{@const preview = previews[key] ?? null}
					<AutomationLane
						trackId={selectedTrack.id}
						nodeId={lane.nodeId}
						paramId={lane.paramId}
						label={laneLabel(lane.nodeId, lane.paramId)}
						points={lane.points}
						totalBars={totalBars}
						ticksPerBar={ticksPerBar}
						barsPerBeat={beatsPerBar}
						bpm={song.bpm}
						previewPoints={preview?.points ?? null}
						previewRange={preview
							? { startTick: preview.startTick, endTick: preview.endTick }
							: null}
						onRequestPreview={(req) =>
							handleRequestPreview(lane.nodeId, lane.paramId, req)}
						onApplyPreview={() => handleApplyPreview(lane.nodeId, lane.paramId)}
						onCancelPreview={() => handleCancelPreview(lane.nodeId, lane.paramId)}
						onRemoveLane={() => handleRemoveLane(lane.nodeId, lane.paramId)}
					/>
				{/each}
			{/if}
		</div>

		{#if !online}
			<BridgeOfflineCurtain />
		{/if}
	</div>
</div>

{#if pickerOpen && selectedTrack}
	<ParamTargetPicker
		track={selectedTrack}
		existingLanes={(selectedTrack.automation ?? []).map((a) => ({
			nodeId: a.nodeId,
			paramId: a.paramId
		}))}
		onPick={(nodeId, paramId) => handleAddLane(nodeId, paramId)}
		onClose={() => (pickerOpen = false)}
	/>
{/if}

<style>
	.automation-tab {
		display: flex;
		flex: 1;
		min-height: 400px;
		background: var(--bg-base);
	}
	.automation-rail {
		position: relative;
		flex: 1;
		min-width: 0;
		padding: var(--space-md);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.automation-rail.offline .rail-head,
	.automation-rail.offline .lanes {
		pointer-events: none;
		opacity: 0.35;
	}
	.rail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--border-subtle);
	}
	.track-select-label {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.label-text {
		font-family: var(--font-sans);
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}
	.track-select {
		padding: 4px 10px;
		font-size: 0.78rem;
		background: var(--bg-surface);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		min-width: 160px;
		cursor: pointer;
	}
	.track-select:focus {
		outline: none;
		border-color: var(--accent-primary);
	}
	.add-lane-btn {
		padding: 4px 12px;
		font-size: 0.72rem;
		font-weight: 600;
		border: 1px solid rgba(232, 168, 76, 0.35);
		background: rgba(232, 168, 76, 0.08);
		color: var(--accent-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.add-lane-btn:hover:not(:disabled) {
		background: rgba(232, 168, 76, 0.2);
		border-color: var(--accent-primary);
	}
	.add-lane-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.lanes {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.empty {
		padding: var(--space-lg);
		text-align: center;
		color: var(--text-muted);
		font-size: 0.8rem;
		background: var(--bg-surface);
		border: 1px dashed var(--border-subtle);
		border-radius: var(--radius-md);
	}
</style>