<script lang="ts">
	import { onMount } from 'svelte';
	import type { PianoRollBar } from '$lib/piano-roll-model';
	import { extractRoot } from '$lib/chord-parser';

	interface Props {
		bars: PianoRollBar[];
		scrollX: number;
		scrollY: number;
		pixelsPerTick: number;
		ticksPerBar: number;
		canvasWidth: number;
		canvasHeight: number;
		totalTicks: number;
		activeBarIndex: number;
		noteHeight: number;
		minMidi: number;
		maxMidi: number;
		onScrollChange: (scrollX: number, scrollY: number) => void;
	}

	let {
		bars,
		scrollX,
		scrollY,
		pixelsPerTick,
		ticksPerBar,
		canvasWidth,
		canvasHeight,
		totalTicks,
		activeBarIndex,
		noteHeight,
		minMidi,
		maxMidi,
		onScrollChange,
	}: Props = $props();

	const MAP_HEIGHT = 30;
	const ROOT_COLORS: Record<string, string> = {
		'C':  '#f87171', 'C#': '#fb923c', 'Db': '#fb923c',
		'D':  '#fbbf24', 'D#': '#fde047', 'Eb': '#fde047',
		'E':  '#a3e635',
		'F':  '#34d399', 'F#': '#2dd4bf', 'Gb': '#2dd4bf',
		'G':  '#22d3ee', 'G#': '#60a5fa', 'Ab': '#60a5fa',
		'A':  '#818cf8', 'A#': '#e8a84c', 'Bb': '#e8a84c',
		'B':  '#c084fc',
	};

	let mapCanvasEl: HTMLCanvasElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();
	let mapWidth = $state(400);

	// Drag state
	let isDragging = $state(false);

	// ── Computed scales ─────────────────────────────────

	let noteRange = $derived(maxMidi - minMidi + 1);
	let totalContentWidth = $derived(totalTicks * pixelsPerTick);
	let totalContentHeight = $derived(noteRange * noteHeight);

	// ── Drawing ─────────────────────────────────────────

	$effect(() => {
		void bars;
		void scrollX;
		void scrollY;
		void pixelsPerTick;
		void ticksPerBar;
		void canvasWidth;
		void canvasHeight;
		void totalTicks;
		void activeBarIndex;
		void mapWidth;
		drawMiniMap();
	});

	function drawMiniMap() {
		if (!mapCanvasEl || totalTicks <= 0) return;
		const ctx = mapCanvasEl.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		mapCanvasEl.width = mapWidth * dpr;
		mapCanvasEl.height = MAP_HEIGHT * dpr;
		ctx.scale(dpr, dpr);

		// Background
		ctx.fillStyle = '#090914';
		ctx.fillRect(0, 0, mapWidth, MAP_HEIGHT);

		const xScale = mapWidth / totalTicks;
		const yScale = MAP_HEIGHT / noteRange;

		// Bar lines
		ctx.strokeStyle = 'rgba(90, 90, 170, 0.25)';
		ctx.lineWidth = 0.5;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerBar) {
			const x = tick * xScale;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, MAP_HEIGHT);
			ctx.stroke();
		}

		// Notes
		for (const bar of bars) {
			for (const entry of bar.entries) {
				let color = '#9090b0';
				if (entry.originalChordName) {
					try {
						const root = extractRoot(entry.originalChordName);
						color = ROOT_COLORS[root] ?? '#9090b0';
					} catch { /* ignore */ }
				}

				for (const note of entry.notes) {
					const x = note.startTick * xScale;
					const w = Math.max(note.durationTicks * xScale, 1);
					const y = (maxMidi - note.midi) * yScale;
					const h = Math.max(yScale, 1);

					ctx.fillStyle = color;
					ctx.globalAlpha = note.isChordTone ? 0.8 : 0.4;
					ctx.fillRect(x, y, w, h);
				}
			}
		}
		ctx.globalAlpha = 1;

		// Viewport rectangle
		if (totalContentWidth > 0 && totalContentHeight > 0) {
			const vpX = (scrollX / totalContentWidth) * mapWidth;
			const vpY = (scrollY / totalContentHeight) * MAP_HEIGHT;
			const vpW = (canvasWidth / totalContentWidth) * mapWidth;
			const vpH = (canvasHeight / totalContentHeight) * MAP_HEIGHT;

			ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
			ctx.fillRect(vpX, vpY, vpW, vpH);

			ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
			ctx.lineWidth = 1;
			ctx.strokeRect(vpX, vpY, vpW, vpH);
		}

		// Play cursor
		if (activeBarIndex >= 0) {
			const cursorTick = activeBarIndex * ticksPerBar;
			const cx = cursorTick * xScale;
			ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(cx, 0);
			ctx.lineTo(cx, MAP_HEIGHT);
			ctx.stroke();
		}
	}

	// ── Interaction ─────────────────────────────────────

	function mapPosToScroll(canvasX: number, canvasY: number): { sx: number; sy: number } {
		// Center viewport on click position
		const tickAtPos = (canvasX / mapWidth) * totalTicks;
		const midiAtPos = maxMidi - (canvasY / MAP_HEIGHT) * noteRange;

		const targetScrollX = tickAtPos * pixelsPerTick - canvasWidth / 2;
		const targetScrollY = (maxMidi - midiAtPos) * noteHeight - canvasHeight / 2;

		const maxScrollX = Math.max(0, totalContentWidth - canvasWidth);
		const maxScrollY = Math.max(0, totalContentHeight - canvasHeight);

		return {
			sx: Math.max(0, Math.min(maxScrollX, targetScrollX)),
			sy: Math.max(0, Math.min(maxScrollY, targetScrollY)),
		};
	}

	function handlePointerDown(e: PointerEvent) {
		if (!mapCanvasEl) return;
		const rect = mapCanvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;

		isDragging = true;
		const { sx, sy } = mapPosToScroll(cx, cy);
		onScrollChange(sx, sy);

		document.addEventListener('pointermove', handlePointerMove);
		document.addEventListener('pointerup', handlePointerUp);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || !mapCanvasEl) return;
		const rect = mapCanvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;

		const { sx, sy } = mapPosToScroll(cx, cy);
		onScrollChange(sx, sy);
	}

	function handlePointerUp() {
		isDragging = false;
		document.removeEventListener('pointermove', handlePointerMove);
		document.removeEventListener('pointerup', handlePointerUp);
	}

	// ── Resize observer ─────────────────────────────────

	onMount(() => {
		if (!containerEl) return;

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				mapWidth = entry.contentRect.width;
			}
		});
		ro.observe(containerEl);

		return () => ro.disconnect();
	});
</script>

<div class="minimap" bind:this={containerEl}>
	<canvas
		bind:this={mapCanvasEl}
		style="width: {mapWidth}px; height: {MAP_HEIGHT}px; cursor: pointer;"
		onpointerdown={handlePointerDown}
	></canvas>
</div>

<style>
	.minimap {
		width: 100%;
		height: 30px;
		flex-shrink: 0;
		background: #090914;
		border-bottom: 1px solid var(--border-subtle, #2a2a5a);
	}

	canvas {
		display: block;
		touch-action: none;
	}
</style>
