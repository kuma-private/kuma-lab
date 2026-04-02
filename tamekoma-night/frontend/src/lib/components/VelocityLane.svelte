<script lang="ts">
	import { onMount } from 'svelte';
	import type { PianoRollBar, PianoRollNote } from '$lib/piano-roll-model';

	interface Props {
		bars: PianoRollBar[];
		selectedNoteIds: Set<string>;
		scrollX: number;
		pixelsPerTick: number;
		ticksPerBar: number;
		onVelocityChange: (noteId: string, velocity: number) => void;
	}

	let {
		bars,
		selectedNoteIds,
		scrollX,
		pixelsPerTick,
		ticksPerBar,
		onVelocityChange,
	}: Props = $props();

	const BAR_MIN_WIDTH = 2;
	const DRAG_TOP_THRESHOLD = 8; // pixels from top of bar to start drag

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();
	let canvasWidth = $state(400);
	let laneHeight = $state(60);

	// Drag state
	let isDragging = $state(false);
	let dragNoteId: string | null = null;
	let dragStartY = 0;
	let dragStartVelocity = 0;
	let dragIsMulti = false;
	let dragMultiIds: string[] = [];
	let dragMultiStartVelocities: Map<string, number> = new Map();

	// ── Collect all notes flat ──────────────────────────

	let allNotes = $derived.by(() => {
		const notes: PianoRollNote[] = [];
		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const note of entry.notes) {
					notes.push(note);
				}
			}
		}
		return notes;
	});

	let totalTicks = $derived(bars.length * ticksPerBar);

	// ── Drawing ─────────────────────────────────────────

	$effect(() => {
		void bars;
		void selectedNoteIds;
		void scrollX;
		void pixelsPerTick;
		void ticksPerBar;
		void canvasWidth;
		void laneHeight;
		drawCanvas();
	});

	function getVelocityColor(velocity: number): string {
		if (velocity <= 40) return '#60a5fa';
		if (velocity <= 80) return '#34d399';
		return '#f87171';
	}

	function drawCanvas() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = canvasWidth * dpr;
		canvasEl.height = laneHeight * dpr;
		ctx.scale(dpr, dpr);

		// Background
		ctx.fillStyle = '#06060f';
		ctx.fillRect(0, 0, canvasWidth, laneHeight);

		// Bar lines
		ctx.strokeStyle = 'rgba(90, 90, 170, 0.4)';
		ctx.lineWidth = 1;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerBar) {
			const x = tick * pixelsPerTick - scrollX;
			if (x < -1 || x > canvasWidth + 1) continue;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, laneHeight);
			ctx.stroke();
		}

		// Velocity reference lines
		ctx.strokeStyle = 'rgba(90, 90, 170, 0.15)';
		ctx.lineWidth = 0.5;
		ctx.setLineDash([2, 4]);
		for (const level of [32, 64, 96]) {
			const y = laneHeight - (level / 127) * laneHeight;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvasWidth, y);
			ctx.stroke();
		}
		ctx.setLineDash([]);

		// Draw velocity bars
		for (const note of allNotes) {
			const x = note.startTick * pixelsPerTick - scrollX;
			const w = Math.max(note.durationTicks * pixelsPerTick - 1, BAR_MIN_WIDTH);
			if (x + w < 0 || x > canvasWidth) continue;

			const barH = (note.velocity / 127) * (laneHeight - 2);
			const y = laneHeight - barH;
			const color = getVelocityColor(note.velocity);
			const isSelected = selectedNoteIds.has(note.id);

			ctx.globalAlpha = isSelected ? 0.9 : 0.5;
			ctx.fillStyle = color;
			ctx.fillRect(x, y, w, barH);

			if (isSelected) {
				ctx.strokeStyle = '#ffffff';
				ctx.globalAlpha = 0.7;
				ctx.lineWidth = 1;
				ctx.strokeRect(x, y, w, barH);
			}

			ctx.globalAlpha = 1;
		}

		// Velocity label for reference
		ctx.fillStyle = 'rgba(144, 144, 176, 0.4)';
		ctx.font = '9px "JetBrains Mono", monospace';
		ctx.textBaseline = 'top';
		ctx.fillText('127', 2, 2);
		ctx.textBaseline = 'bottom';
		ctx.fillText('0', 2, laneHeight - 2);
	}

	// ── Hit detection ───────────────────────────────────

	function findNoteBarAt(canvasX: number, canvasY: number): PianoRollNote | null {
		for (const note of allNotes) {
			const x = note.startTick * pixelsPerTick - scrollX;
			const w = Math.max(note.durationTicks * pixelsPerTick - 1, BAR_MIN_WIDTH);
			const barH = (note.velocity / 127) * (laneHeight - 2);
			const y = laneHeight - barH;

			if (canvasX >= x && canvasX <= x + w && canvasY >= y - DRAG_TOP_THRESHOLD && canvasY <= laneHeight) {
				return note;
			}
		}
		return null;
	}

	// ── Pointer handlers ────────────────────────────────

	function handlePointerDown(e: PointerEvent) {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;

		const hit = findNoteBarAt(cx, cy);
		if (!hit) return;

		isDragging = true;
		dragStartY = e.clientY;
		dragStartVelocity = hit.velocity;
		dragNoteId = hit.id;

		// Multi-select drag
		if (selectedNoteIds.has(hit.id) && selectedNoteIds.size > 1) {
			dragIsMulti = true;
			dragMultiIds = [...selectedNoteIds];
			dragMultiStartVelocities = new Map();
			for (const note of allNotes) {
				if (selectedNoteIds.has(note.id)) {
					dragMultiStartVelocities.set(note.id, note.velocity);
				}
			}
		} else {
			dragIsMulti = false;
			dragMultiIds = [];
		}

		document.addEventListener('pointermove', handlePointerMove);
		document.addEventListener('pointerup', handlePointerUp);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;

		const deltaY = dragStartY - e.clientY; // up = positive = increase velocity
		const deltaVel = Math.round((deltaY / laneHeight) * 127);

		if (dragIsMulti) {
			// Apply relative delta from each note's own starting velocity
			for (const id of dragMultiIds) {
				const startVel = dragMultiStartVelocities.get(id) ?? 100;
				const newVel = Math.max(0, Math.min(127, startVel + deltaVel));
				onVelocityChange(id, newVel);
			}
		} else if (dragNoteId) {
			const newVel = Math.max(0, Math.min(127, dragStartVelocity + deltaVel));
			onVelocityChange(dragNoteId, newVel);
		}
	}

	function handlePointerUp() {
		isDragging = false;
		dragNoteId = null;
		dragIsMulti = false;
		dragMultiIds = [];
		dragMultiStartVelocities = new Map();

		document.removeEventListener('pointermove', handlePointerMove);
		document.removeEventListener('pointerup', handlePointerUp);
	}

	// ── Resize observer ─────────────────────────────────

	onMount(() => {
		if (!containerEl) return;

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				canvasWidth = entry.contentRect.width;
				laneHeight = entry.contentRect.height;
			}
		});
		ro.observe(containerEl);

		return () => ro.disconnect();
	});
</script>

<div class="velocity-lane">
	<div class="velocity-lane-label">Vel</div>
	<div class="velocity-lane-canvas" bind:this={containerEl}>
	<canvas
		bind:this={canvasEl}
		style="width: {canvasWidth}px; height: 100%; cursor: ns-resize;"
		onpointerdown={handlePointerDown}
	></canvas>
	</div>
</div>

<style>
	.velocity-lane {
		display: flex;
		width: 100%;
		height: 60px;
		flex-shrink: 0;
		background: var(--bg-deepest, #06060f);
		border-top: 1px solid var(--border-subtle, #2a2a5a);
	}

	.velocity-lane-label {
		width: 60px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted, #6060a0);
		border-right: 1px solid var(--border-strong, #5a5aaa);
	}

	.velocity-lane-canvas {
		flex: 1;
		overflow: hidden;
	}

	canvas {
		display: block;
		touch-action: none;
	}

	@media (max-width: 600px) {
		.velocity-lane {
			height: 40px;
		}
		.velocity-lane-label {
			width: 40px;
			font-size: 8px;
		}
	}
</style>
