<script lang="ts">
	import { onMount } from 'svelte';
	import type { MidiNote } from '$lib/types/song';

	interface Props {
		trackNotes: Map<string, { name: string; instrument: string; notes: MidiNote[] }>;
		currentTime?: number;
		totalDuration?: number;
		bpm?: number;
		scrollX?: number;
		onScrollXChange?: (x: number) => void;
		isOpen?: boolean;
		onTrackMute?: (trackId: string, mute: boolean) => void;
		onTrackSolo?: (trackId: string, solo: boolean) => void;
		onTrackVolume?: (trackId: string, db: number) => void;
		onClose?: () => void;
	}

	let {
		trackNotes,
		currentTime = 0,
		totalDuration = 0,
		bpm = 120,
		scrollX = 0,
		onScrollXChange,
		isOpen = true,
		onTrackMute,
		onTrackSolo,
		onTrackVolume,
		onClose,
	}: Props = $props();

	// ── Constants ────────────────────────────────────────
	const TICKS_PER_QUARTER = 480;
	const TRACK_HEIGHT = 44;
	const TRACK_NAME_WIDTH = 50;
	const MIXER_WIDTH = 100;
	const HEADER_HEIGHT = 32;
	const MIN_HEIGHT = 150;
	const MAX_HEIGHT = 500;

	const TRACK_COLORS: Record<string, string> = {
		piano: '#b8a0f0',
		bass: '#7cb882',
		drums: '#e8a84c',
		strings: '#6ea8d0',
		guitar: '#f0c060',
		organ: '#e06050',
	};

	const DEFAULT_COLOR = '#9090b0';

	// ── State ────────────────────────────────────────────
	let containerEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let canvasWidth = $state(600);
	let canvasHeight = $state(200);
	let panelHeight = $state(200);
	let localScrollX = $state(0);
	let pixelsPerTick = $state(200 / 1920);

	// Per-track mixer state
	let mutedTracks = $state<Set<string>>(new Set());
	let soloTracks = $state<Set<string>>(new Set());
	let trackVolumes = $state<Map<string, number>>(new Map());

	// Resize state
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;

	// ── Derived ──────────────────────────────────────────
	let trackEntries = $derived([...trackNotes.entries()]);
	let trackCount = $derived(trackEntries.length);

	let totalTicks = $derived.by(() => {
		let maxTick = 0;
		for (const [, track] of trackEntries) {
			for (const note of track.notes) {
				const end = note.startTick + note.durationTicks;
				if (end > maxTick) maxTick = end;
			}
		}
		return maxTick || TICKS_PER_QUARTER * 4; // at least 1 bar
	});

	let totalCanvasWidth = $derived(Math.max(totalTicks * pixelsPerTick, canvasWidth));

	// Sync scrollX from prop
	$effect(() => {
		if (scrollX !== undefined) {
			localScrollX = Math.max(0, Math.min(totalCanvasWidth - canvasWidth, scrollX));
		}
	});

	// ── Canvas drawing ───────────────────────────────────
	$effect(() => {
		void trackNotes;
		void localScrollX;
		void pixelsPerTick;
		void canvasWidth;
		void canvasHeight;
		void currentTime;
		void mutedTracks;
		void soloTracks;
		drawCanvas();
	});

	function tickToX(tick: number): number {
		return tick * pixelsPerTick;
	}

	function getTrackColor(instrument: string): string {
		const key = instrument.toLowerCase();
		return TRACK_COLORS[key] ?? DEFAULT_COLOR;
	}

	function drawCanvas() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = canvasWidth * dpr;
		canvasEl.height = canvasHeight * dpr;
		ctx.scale(dpr, dpr);

		// Background
		ctx.fillStyle = '#06060f';
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		ctx.save();
		ctx.translate(-localScrollX, 0);

		drawGrid(ctx);
		drawAllTrackNotes(ctx);
		drawPlayCursor(ctx);

		ctx.restore();
	}

	function drawGrid(ctx: CanvasRenderingContext2D) {
		const ticksPerBar = TICKS_PER_QUARTER * 4; // assume 4/4
		const ticksPerBeat = TICKS_PER_QUARTER;
		const contentHeight = canvasHeight;

		// Beat lines
		ctx.strokeStyle = 'rgba(58, 58, 122, 0.4)';
		ctx.lineWidth = 0.5;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerBeat) {
			if (tick % ticksPerBar === 0) continue;
			const x = tickToX(tick);
			if (x < localScrollX - 10 || x > localScrollX + canvasWidth + 10) continue;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, contentHeight);
			ctx.stroke();
		}

		// Bar lines
		ctx.strokeStyle = 'rgba(90, 90, 170, 0.7)';
		ctx.lineWidth = 1;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerBar) {
			const x = tickToX(tick);
			if (x < localScrollX - 10 || x > localScrollX + canvasWidth + 10) continue;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, contentHeight);
			ctx.stroke();
		}
	}

	function drawAllTrackNotes(ctx: CanvasRenderingContext2D) {
		let trackIndex = 0;
		for (const [trackId, track] of trackEntries) {
			const yBase = trackIndex * TRACK_HEIGHT;
			const isEmpty = track.notes.length === 0;
			const color = getTrackColor(track.instrument);

			// Track row separator
			ctx.strokeStyle = 'rgba(42, 42, 90, 0.4)';
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(0, yBase + TRACK_HEIGHT);
			ctx.lineTo(Math.max(totalCanvasWidth, localScrollX + canvasWidth), yBase + TRACK_HEIGHT);
			ctx.stroke();

			if (isEmpty) {
				trackIndex++;
				continue;
			}

			// Compute min-max MIDI range for this track
			let minMidi = 127;
			let maxMidi = 0;
			for (const note of track.notes) {
				if (note.midi < minMidi) minMidi = note.midi;
				if (note.midi > maxMidi) maxMidi = note.midi;
			}
			const range = Math.max(maxMidi - minMidi, 1);
			const padding = 4; // px padding top and bottom within track

			// Draw notes
			const alpha = (mutedTracks.has(trackId) && !soloTracks.has(trackId)) ? 0.15 : 0.85;

			for (const note of track.notes) {
				const x = tickToX(note.startTick);
				const w = Math.max(note.durationTicks * pixelsPerTick - 1, 2);

				// Cull off-screen
				if (x + w < localScrollX - 10 || x > localScrollX + canvasWidth + 10) continue;

				// Normalize Y within the track row
				const normalizedY = 1 - (note.midi - minMidi) / range;
				const y = yBase + padding + normalizedY * (TRACK_HEIGHT - padding * 2 - 4);
				const h = Math.max(3, (TRACK_HEIGHT - padding * 2) / Math.max(range, 12));

				ctx.fillStyle = color;
				ctx.globalAlpha = alpha * (note.velocity / 127);
				roundRect(ctx, x, y, w, h, 1.5);
				ctx.fill();

				ctx.strokeStyle = color;
				ctx.globalAlpha = alpha * 0.4;
				ctx.lineWidth = 0.5;
				roundRect(ctx, x, y, w, h, 1.5);
				ctx.stroke();
			}

			ctx.globalAlpha = 1;
			trackIndex++;
		}
	}

	function drawPlayCursor(ctx: CanvasRenderingContext2D) {
		if (!currentTime || currentTime <= 0) return;

		const secondsPerBeat = 60 / bpm;
		const secondsPerTick = secondsPerBeat / TICKS_PER_QUARTER;
		const cursorTick = currentTime / secondsPerTick;
		const x = tickToX(cursorTick);

		// Glow
		ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, canvasHeight);
		ctx.stroke();

		// Main line
		ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, canvasHeight);
		ctx.stroke();
	}

	function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	// ── Scroll & zoom ───────────────────────────────────
	function handleWheel(e: WheelEvent) {
		e.preventDefault();

		if (e.ctrlKey || e.metaKey) {
			// Zoom
			const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
			const mouseX = e.offsetX + localScrollX;
			const tickAtMouse = mouseX / pixelsPerTick;

			pixelsPerTick = Math.max(0.01, Math.min(2, pixelsPerTick * zoomFactor));

			// Keep tick under mouse stable
			localScrollX = Math.max(0, tickAtMouse * pixelsPerTick - e.offsetX);
			onScrollXChange?.(localScrollX);
		} else {
			// Horizontal scroll
			localScrollX = Math.max(0, Math.min(totalCanvasWidth - canvasWidth, localScrollX + e.deltaX + e.deltaY));
			onScrollXChange?.(localScrollX);
		}
	}

	// ── Auto-follow during playback ─────────────────────
	$effect(() => {
		if (!currentTime || currentTime <= 0) return;
		const secondsPerBeat = 60 / bpm;
		const secondsPerTick = secondsPerBeat / TICKS_PER_QUARTER;
		const cursorTick = currentTime / secondsPerTick;
		const cursorX = tickToX(cursorTick);

		// Auto-scroll when cursor approaches right edge
		const margin = canvasWidth * 0.2;
		if (cursorX > localScrollX + canvasWidth - margin) {
			localScrollX = Math.max(0, cursorX - canvasWidth * 0.5);
			onScrollXChange?.(localScrollX);
		}
		// Auto-scroll when cursor is left of view
		if (cursorX < localScrollX + margin && localScrollX > 0) {
			localScrollX = Math.max(0, cursorX - canvasWidth * 0.5);
			onScrollXChange?.(localScrollX);
		}
	});

	// ── Mixer handlers ──────────────────────────────────
	function toggleMute(trackId: string) {
		const newSet = new Set(mutedTracks);
		const isMuted = newSet.has(trackId);
		if (isMuted) {
			newSet.delete(trackId);
		} else {
			newSet.add(trackId);
		}
		mutedTracks = newSet;
		onTrackMute?.(trackId, !isMuted);
	}

	function toggleSolo(trackId: string) {
		const newSet = new Set(soloTracks);
		const isSolo = newSet.has(trackId);
		if (isSolo) {
			newSet.delete(trackId);
		} else {
			newSet.add(trackId);
		}
		soloTracks = newSet;
		onTrackSolo?.(trackId, !isSolo);
	}

	function handleVolumeChange(trackId: string, e: Event) {
		const input = e.target as HTMLInputElement;
		const db = parseFloat(input.value);
		const newMap = new Map(trackVolumes);
		newMap.set(trackId, db);
		trackVolumes = newMap;
		onTrackVolume?.(trackId, db);
	}

	// ── Resize ──────────────────────────────────────────
	function handleResizeStart(e: PointerEvent) {
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = panelHeight;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleResizeMove(e: PointerEvent) {
		if (!isResizing) return;
		const delta = resizeStartY - e.clientY;
		panelHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStartHeight + delta));
		canvasHeight = Math.max(0, panelHeight - HEADER_HEIGHT);
	}

	function handleResizeEnd() {
		isResizing = false;
	}

	// ── ResizeObserver for canvas width ─────────────────
	onMount(() => {
		if (!containerEl) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const w = entry.contentRect.width - TRACK_NAME_WIDTH - MIXER_WIDTH;
				canvasWidth = Math.max(100, w);
				canvasHeight = Math.max(0, panelHeight - HEADER_HEIGHT);
			}
		});
		observer.observe(containerEl);
		return () => observer.disconnect();
	});
</script>

{#if isOpen}
<div class="visualizer" style="height: {panelHeight}px;" bind:this={containerEl}>
	<!-- Resize handle (top edge) -->
	<div
		class="resize-handle"
		onpointerdown={handleResizeStart}
		onpointermove={handleResizeMove}
		onpointerup={handleResizeEnd}
		onpointercancel={handleResizeEnd}
	></div>

	<!-- Header -->
	<div class="viz-header">
		<span class="viz-label">VISUALIZER</span>
		<button class="viz-close" aria-label="ビジュアライザーを閉じる" onclick={() => onClose?.()}>&#x2715;</button>
	</div>

	<!-- Body -->
	<div class="viz-body">
		<!-- Track names (left column) -->
		<div class="track-names">
			{#each trackEntries as [trackId, track], i}
				<div
					class="track-name"
					class:empty={track.notes.length === 0}
					style="height: {TRACK_HEIGHT}px;"
				>
					<span class="track-name-text" style="color: {getTrackColor(track.instrument)};">
						{track.name}
					</span>
				</div>
			{/each}
		</div>

		<!-- Canvas (center) -->
		<div class="canvas-area" onwheel={handleWheel}>
			<canvas
				bind:this={canvasEl}
				aria-label="MIDI ノートビジュアライザー"
				style="width: {canvasWidth}px; height: {canvasHeight}px;"
			></canvas>
		</div>

		<!-- Mixer controls (right column) -->
		<div class="mixer">
			{#each trackEntries as [trackId, track], i}
				<div class="mixer-row" style="height: {TRACK_HEIGHT}px;">
					<button
						class="mixer-btn"
						class:active={mutedTracks.has(trackId)}
						onclick={() => toggleMute(trackId)}
						title="Mute"
						aria-label="ミュート"
						aria-pressed={mutedTracks.has(trackId)}
					>M</button>
					<button
						class="mixer-btn solo"
						class:active={soloTracks.has(trackId)}
						onclick={() => toggleSolo(trackId)}
						title="Solo"
						aria-label="ソロ"
						aria-pressed={soloTracks.has(trackId)}
					>S</button>
					<input
						type="range"
						class="volume-slider"
						min="-60"
						max="6"
						step="0.5"
						value={trackVolumes.get(trackId) ?? 0}
						oninput={(e) => handleVolumeChange(trackId, e)}
						title="Volume"
						aria-label="音量"
					/>
				</div>
			{/each}
		</div>
	</div>
</div>
{/if}

<style>
	.visualizer {
		display: flex;
		flex-direction: column;
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: 8px;
		overflow: hidden;
		position: relative;
		min-height: 150px;
	}

	.resize-handle {
		position: absolute;
		top: -3px;
		left: 0;
		right: 0;
		height: 6px;
		cursor: ns-resize;
		z-index: 10;
	}

	.resize-handle:hover {
		background: rgba(167, 139, 250, 0.15);
	}

	.viz-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 32px;
		padding: 0 12px;
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.viz-label {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 1.5px;
		color: var(--text-secondary);
	}

	.viz-close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 14px;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		transition: color 0.15s, background 0.15s;
	}

	.viz-close:hover {
		color: var(--text-primary);
		background: rgba(255, 255, 255, 0.08);
	}

	.viz-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.track-names {
		width: 50px;
		flex-shrink: 0;
		border-right: 1px solid var(--border-subtle);
		overflow: hidden;
	}

	.track-name {
		display: flex;
		align-items: center;
		padding: 0 6px;
		border-bottom: 1px solid rgba(42, 42, 90, 0.3);
	}

	.track-name.empty {
		opacity: 0.35;
	}

	.track-name-text {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.canvas-area {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	canvas {
		display: block;
		touch-action: none;
	}

	.mixer {
		width: 100px;
		flex-shrink: 0;
		border-left: 1px solid var(--border-subtle);
		overflow: hidden;
	}

	.mixer-row {
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 0 4px;
		border-bottom: 1px solid rgba(42, 42, 90, 0.3);
	}

	.mixer-btn {
		width: 20px;
		height: 20px;
		border: 1px solid var(--border-subtle);
		border-radius: 3px;
		background: var(--bg-base);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}

	.mixer-btn:hover {
		border-color: var(--border-default);
		color: var(--text-primary);
	}

	.mixer-btn.active {
		background: var(--error);
		color: #fff;
		border-color: var(--error);
	}

	.mixer-btn.solo.active {
		background: var(--accent-warm);
		color: #000;
		border-color: var(--accent-warm);
	}

	.volume-slider {
		flex: 1;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--border-subtle);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.volume-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-secondary);
		border: none;
		cursor: pointer;
	}

	.volume-slider::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-secondary);
		border: none;
		cursor: pointer;
	}

	.volume-slider:hover::-webkit-slider-thumb {
		background: var(--accent-primary);
	}

	.volume-slider:hover::-moz-range-thumb {
		background: var(--accent-primary);
	}
</style>
