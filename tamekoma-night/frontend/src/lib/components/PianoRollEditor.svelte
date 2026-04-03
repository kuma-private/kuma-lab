<script lang="ts">
	import { onMount } from 'svelte';
	import * as Tone from 'tone';
	import { scoreToPianoRoll, pianoRollToScore, applyAutoVoicing } from '$lib/piano-roll-model';
	import type { PianoRollBar, PianoRollNote, PianoRollBarEntry } from '$lib/piano-roll-model';
	import { base64ToPianoRollBars } from '$lib/midi-io';
	import { extractRoot } from '$lib/chord-parser';
	import { midiToNoteName, getPianoSampler, isPianoLoaded } from '$lib/chord-player';
	import { recognizeChord } from '$lib/chord-recognizer';
	import PianoRollToolbar from './PianoRollToolbar.svelte';

	export interface PianoRollExposedState {
		bars: PianoRollBar[];
		selectedNoteIds: Set<string>;
		scrollX: number;
		scrollY: number;
		pixelsPerTick: number;
		ticksPerBar: number;
		canvasWidth: number;
		canvasHeight: number;
		totalTicks: number;
	}

	interface Props {
		score: string;
		bpm: number;
		timeSignature: string;
		activeBarIndex: number;
		currentTime?: number;
		totalDuration?: number;
		initialMidiData?: string;
		onScoreChange: (newScore: string) => void;
		onSeek?: (time: number) => void;
		onStateExpose?: (state: PianoRollExposedState) => void;
		velocityUpdate?: { noteIds: string[]; velocity: number; seq: number } | null;
		scrollUpdate?: { scrollX: number; scrollY: number; seq: number } | null;
		noteUpdate?: { noteId: string; updates: { midi?: number; velocity?: number; durationTicks?: number; startTick?: number; isChordTone?: boolean }; seq: number } | null;
		midiDataOverride?: { data: string; seq: number } | null;
	}

	let {
		score,
		bpm,
		timeSignature,
		activeBarIndex,
		currentTime = 0,
		totalDuration = 0,
		onScoreChange,
		onSeek,
		initialMidiData,
		onStateExpose,
		velocityUpdate = null,
		scrollUpdate = null,
		noteUpdate = null,
		midiDataOverride = null,
	}: Props = $props();

	// ── Constants ────────────────────────────────────────

	const PIANO_KEY_WIDTH = 60;
	const CHORD_LABEL_HEIGHT = 24;
	const MIN_MIDI = 12;  // C0
	const MAX_MIDI = 108; // C8
	const NOTE_COUNT = MAX_MIDI - MIN_MIDI + 1;
	const NOTE_HEIGHT = 12;
	const TICKS_PER_QUARTER = 480;
	const NOTE_EDGE_THRESHOLD = 6; // pixels for resize handle

	const ROOT_COLORS: Record<string, string> = {
		'C':  '#f87171', 'C#': '#fb923c', 'Db': '#fb923c',
		'D':  '#fbbf24', 'D#': '#fde047', 'Eb': '#fde047',
		'E':  '#a3e635',
		'F':  '#34d399', 'F#': '#2dd4bf', 'Gb': '#2dd4bf',
		'G':  '#22d3ee', 'G#': '#60a5fa', 'Ab': '#60a5fa',
		'A':  '#818cf8', 'A#': '#a78bfa', 'Bb': '#a78bfa',
		'B':  '#c084fc',
	};

	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

	// ── Note audition ────────────────────────────────────

	let auditionSynth: Tone.Synth | null = null;

	function getAuditionFallback(): Tone.Synth {
		if (!auditionSynth) {
			auditionSynth = new Tone.Synth({
				oscillator: { type: 'triangle' },
				envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
				volume: -12,
			}).toDestination();
		}
		return auditionSynth;
	}

	function playNotePreview(midi: number) {
		const noteName = midiToNoteName(midi);
		if (isPianoLoaded()) {
			getPianoSampler().triggerAttackRelease(noteName, '16n');
		} else {
			getAuditionFallback().triggerAttackRelease(noteName, '16n');
		}
	}

	function playChordPreview(midiNotes: number[]) {
		const noteNames = midiNotes.map(midiToNoteName);
		if (isPianoLoaded()) {
			getPianoSampler().triggerAttackRelease(noteNames, 0.5);
		} else {
			// Fallback: play first note only with synth
			if (noteNames.length > 0) {
				getAuditionFallback().triggerAttackRelease(noteNames[0], '8n');
			}
		}
	}

	// Scrub playback: release previous notes before playing new ones
	let scrubActiveNotes: string[] = [];

	function scrubPlayColumn(midiNotes: number[]) {
		// Release previous scrub notes
		if (scrubActiveNotes.length > 0 && isPianoLoaded()) {
			const sampler = getPianoSampler();
			for (const n of scrubActiveNotes) {
				try { sampler.triggerRelease(n); } catch { /* ignore */ }
			}
		}
		const noteNames = midiNotes.map(midiToNoteName);
		scrubActiveNotes = noteNames;
		if (noteNames.length === 0) return;
		if (isPianoLoaded()) {
			getPianoSampler().triggerAttack(noteNames);
		} else if (noteNames.length > 0) {
			getAuditionFallback().triggerAttackRelease(noteNames[0], '16n');
		}
	}

	function scrubRelease() {
		if (scrubActiveNotes.length > 0 && isPianoLoaded()) {
			const sampler = getPianoSampler();
			for (const n of scrubActiveNotes) {
				try { sampler.triggerRelease(n); } catch { /* ignore */ }
			}
		}
		scrubActiveNotes = [];
	}

	// ── State ────────────────────────────────────────────

	let bars: PianoRollBar[] = $state([]);
	let pixelsPerTick = $state(200 / 1920);
	let scrollX = $state(0);
	let scrollY = $state(0);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();
	let pianoKeysEl: HTMLDivElement | undefined = $state();
	let pianoKeysWrapperEl: HTMLDivElement | undefined = $state();
	let canvasWidth = $state(800);
	let canvasHeight = $state(400);

	// Editing state
	let tool = $state<'select' | 'draw' | 'erase'>('select');
	let snapDivision = $state(4);
	let selectedNoteIds = $state<Set<string>>(new Set());
	let undoStack = $state<PianoRollBar[][]>([]);
	let redoStack = $state<PianoRollBar[][]>([]);

	// Drag state
	let isDragging = $state(false);
	let dragMode = $state<'none' | 'draw' | 'move' | 'resize' | 'lasso'>('none');
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartTick = 0;
	let dragStartMidi = 0;
	let dragNote: PianoRollNote | null = null;
	let dragNoteOriginalTick = 0;
	let dragNoteOriginalMidi = 0;
	let dragNoteOriginalDuration = 0;
	let drawPreviewNote: { midi: number; startTick: number; durationTicks: number } | null = $state(null);

	// Lasso selection state
	let lassoRect: { x1: number; y1: number; x2: number; y2: number } | null = $state(null);
	let lassoMoved = false;

	// Ghost & tooltip state for drag feedback
	let dragGhosts: { midi: number; startTick: number; durationTicks: number }[] = $state([]);
	let dragTooltipMidi: number | null = $state(null);
	let dragTooltipCanvasPos: { x: number; y: number } | null = $state(null);
	let dragSnapTick: number | null = $state(null);

	// Scrub (right-click drag) state
	let isScrubbing = $state(false);
	let scrubLastTick = -1;
	let highlightedNoteIds = $state<Set<string>>(new Set());
	let highlightFadeTimer: ReturnType<typeof setTimeout> | null = null;

	// ── Derived ──────────────────────────────────────────

	let parsedTimeSignature = $derived.by(() => {
		const parts = timeSignature.split('/');
		return { beats: parseInt(parts[0]) || 4, beatValue: parseInt(parts[1]) || 4 };
	});

	let ticksPerBar = $derived(TICKS_PER_QUARTER * parsedTimeSignature.beats);
	let totalTicks = $derived(bars.length * ticksPerBar);
	let totalCanvasWidth = $derived(Math.max(totalTicks * pixelsPerTick, canvasWidth));
	let totalNoteHeight = $derived(NOTE_COUNT * NOTE_HEIGHT);
	let canUndo = $derived(undoStack.length > 0);
	let canRedo = $derived(redoStack.length > 0);
	let snapTicks = $derived.by(() => {
		if (snapDivision <= 1) return ticksPerBar;
		return Math.floor(TICKS_PER_QUARTER * 4 / snapDivision);
	});

	// ── Expose state to parent ──────────────────────────

	$effect(() => {
		if (onStateExpose) {
			onStateExpose({
				bars,
				selectedNoteIds,
				scrollX,
				scrollY,
				pixelsPerTick,
				ticksPerBar,
				canvasWidth,
				canvasHeight,
				totalTicks,
			});
		}
	});

	// ── Incoming velocity updates from parent ────────────

	let lastVelocitySeq = -1;

	$effect(() => {
		if (velocityUpdate && velocityUpdate.seq !== lastVelocitySeq) {
			lastVelocitySeq = velocityUpdate.seq;
			const idSet = new Set(velocityUpdate.noteIds);
			const vel = velocityUpdate.velocity;
			for (const bar of bars) {
				for (const entry of bar.entries) {
					for (const note of entry.notes) {
						if (idSet.has(note.id)) {
							note.velocity = Math.max(0, Math.min(127, vel));
						}
					}
				}
			}
			bars = [...bars];
			notifyScoreChange();
		}
	});

	// ── Incoming scroll updates from parent ──────────────

	let lastScrollSeq = -1;

	$effect(() => {
		if (scrollUpdate && scrollUpdate.seq !== lastScrollSeq) {
			lastScrollSeq = scrollUpdate.seq;
			scrollX = Math.max(0, Math.min(totalCanvasWidth - canvasWidth, scrollUpdate.scrollX));
			scrollY = Math.max(0, Math.min(totalNoteHeight - (canvasHeight - CHORD_LABEL_HEIGHT), scrollUpdate.scrollY));
		}
	});

	// ── Incoming note updates from parent ────────────────

	let lastNoteUpdateSeq = -1;

	$effect(() => {
		if (noteUpdate && noteUpdate.seq !== lastNoteUpdateSeq) {
			lastNoteUpdateSeq = noteUpdate.seq;
			const { noteId, updates } = noteUpdate;
			for (const bar of bars) {
				for (const entry of bar.entries) {
					for (const note of entry.notes) {
						if (note.id === noteId) {
							if (updates.midi !== undefined) note.midi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, updates.midi));
							if (updates.velocity !== undefined) note.velocity = Math.max(0, Math.min(127, updates.velocity));
							if (updates.durationTicks !== undefined) note.durationTicks = Math.max(1, updates.durationTicks);
							if (updates.startTick !== undefined) note.startTick = Math.max(0, updates.startTick);
							if (updates.isChordTone !== undefined) note.isChordTone = updates.isChordTone;
							reRecognizeEntry(entry);
						}
					}
				}
			}
			bars = [...bars];
			notifyScoreChange();
		}
	});

	// ── Score → PianoRoll conversion ─────────────────────

	// When midiData exists, the piano roll is the source of truth.
	// Score changes from our own edits are ignored (we already have the bars).
	// Only convert score→pianoRoll when there's no saved midiData.
	let midiIsSourceOfTruth = false;

	// Initial load: use midiData if available, otherwise convert from score
	$effect(() => {
		void score; // track dependency
		if (midiIsSourceOfTruth) {
			// Piano roll owns the data — don't overwrite from score text
			return;
		}
		if (initialMidiData) {
			const result = base64ToPianoRollBars(initialMidiData);
			if (result.bars && result.bars.length > 0) {
				bars = result.bars;
				midiIsSourceOfTruth = true;
				return;
			}
		}
		// No midiData: convert from score text (first-time open)
		if (!score.trim()) return;
		bars = scoreToPianoRoll(score, parsedTimeSignature, bpm);
		midiIsSourceOfTruth = true;
	});

	// midiDataOverride: external MIDI import replaces bars
	let lastMidiOverrideSeq = -1;
	$effect(() => {
		if (midiDataOverride && midiDataOverride.seq !== lastMidiOverrideSeq) {
			lastMidiOverrideSeq = midiDataOverride.seq;
			try {
				const result = base64ToPianoRollBars(midiDataOverride.data);
				if (result.bars && result.bars.length > 0) {
					bars = result.bars;
					midiIsSourceOfTruth = true;
				}
			} catch { /* ignore invalid data */ }
		}
	});

	// ── Canvas drawing ───────────────────────────────────

	$effect(() => {
		void bars;
		void scrollX;
		void scrollY;
		void pixelsPerTick;
		void canvasWidth;
		void canvasHeight;
		void activeBarIndex;
		void currentTime;
		void selectedNoteIds;
		void drawPreviewNote;
		void lassoRect;
		void dragGhosts;
		void dragTooltipMidi;
		void dragTooltipCanvasPos;
		void dragSnapTick;
		void highlightedNoteIds;
		drawCanvas();
	});

	function drawCanvas() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = canvasWidth * dpr;
		canvasEl.height = canvasHeight * dpr;
		ctx.scale(dpr, dpr);

		ctx.fillStyle = '#06060f';
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		ctx.save();
		ctx.translate(-scrollX, -scrollY + CHORD_LABEL_HEIGHT);

		drawNoteRows(ctx);
		drawGrid(ctx);
		drawDragGhosts(ctx);
		drawNotes(ctx);
		drawPreview(ctx);
		drawSnapGuideline(ctx);
		drawPlayCursor(ctx);

		ctx.restore();

		drawChordLabels(ctx);
		drawDragTooltip();
		drawLassoRect(ctx);
	}

	function midiToY(midi: number): number {
		return (MAX_MIDI - midi) * NOTE_HEIGHT;
	}

	function tickToX(tick: number): number {
		return tick * pixelsPerTick;
	}

	function drawNoteRows(ctx: CanvasRenderingContext2D) {
		const startMidi = Math.max(MIN_MIDI, MAX_MIDI - Math.floor((scrollY + canvasHeight) / NOTE_HEIGHT));
		const endMidi = Math.min(MAX_MIDI, MAX_MIDI - Math.floor(scrollY / NOTE_HEIGHT) + 1);

		for (let midi = startMidi; midi <= endMidi; midi++) {
			const y = midiToY(midi);
			const noteInOctave = midi % 12;
			const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);
			const isC = noteInOctave === 0;

			if (isBlackKey) {
				ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
			} else {
				ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
			}
			ctx.fillRect(0, y, totalCanvasWidth, NOTE_HEIGHT);

			if (isC) {
				ctx.strokeStyle = 'rgba(90, 90, 170, 0.5)';
				ctx.lineWidth = 1;
			} else {
				ctx.strokeStyle = 'rgba(42, 42, 90, 0.3)';
				ctx.lineWidth = 0.5;
			}
			ctx.beginPath();
			ctx.moveTo(0, y + NOTE_HEIGHT);
			ctx.lineTo(totalCanvasWidth, y + NOTE_HEIGHT);
			ctx.stroke();
		}
	}

	function drawGrid(ctx: CanvasRenderingContext2D) {
		const ticksPerBeat = TICKS_PER_QUARTER;
		const ticksPerEighth = TICKS_PER_QUARTER / 2;
		const contentHeight = totalNoteHeight;

		ctx.strokeStyle = 'rgba(42, 42, 90, 0.2)';
		ctx.lineWidth = 0.5;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerEighth) {
			if (tick % ticksPerBeat === 0) continue;
			const x = tickToX(tick);
			if (x < scrollX - 10 || x > scrollX + canvasWidth + 10) continue;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, contentHeight);
			ctx.stroke();
		}

		ctx.strokeStyle = 'rgba(58, 58, 122, 0.6)';
		ctx.lineWidth = 0.75;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerBeat) {
			if (tick % ticksPerBar === 0) continue;
			const x = tickToX(tick);
			if (x < scrollX - 10 || x > scrollX + canvasWidth + 10) continue;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, contentHeight);
			ctx.stroke();
		}

		ctx.strokeStyle = 'rgba(90, 90, 170, 0.8)';
		ctx.lineWidth = 1.5;
		for (let tick = 0; tick <= totalTicks; tick += ticksPerBar) {
			const x = tickToX(tick);
			if (x < scrollX - 10 || x > scrollX + canvasWidth + 10) continue;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, contentHeight);
			ctx.stroke();
		}
	}

	function getNoteColor(note: PianoRollNote, entry: PianoRollBarEntry): string {
		// Use recognized chord name first
		if (entry.recognizedChordName) {
			try {
				const root = extractRoot(entry.recognizedChordName);
				return ROOT_COLORS[root] ?? '#9090b0';
			} catch {}
		}
		// If no recognition, use the note's own pitch class as color
		const noteName = NOTE_NAMES[note.midi % 12];
		return ROOT_COLORS[noteName] ?? '#9090b0';
	}

	function drawNotes(ctx: CanvasRenderingContext2D) {
		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const note of entry.notes) {
					const x = tickToX(note.startTick);
					const y = midiToY(note.midi);
					const w = Math.max(note.durationTicks * pixelsPerTick - 1, 2);
					const h = NOTE_HEIGHT;

					if (x + w < scrollX - 10 || x > scrollX + canvasWidth + 10) continue;
					if (y + h < scrollY - CHORD_LABEL_HEIGHT || y > scrollY + canvasHeight) continue;

					const color = getNoteColor(note, entry);
					const isSelected = selectedNoteIds.has(note.id);
					const alpha = note.isChordTone ? 0.85 : 0.4;

					ctx.fillStyle = color;
					ctx.globalAlpha = alpha;
					roundRect(ctx, x, y, w, h, 2);
					ctx.fill();

					// Border: bright if selected
					if (isSelected) {
						ctx.strokeStyle = '#ffffff';
						ctx.globalAlpha = 0.9;
						ctx.lineWidth = 1.5;
					} else {
						ctx.strokeStyle = color;
						ctx.globalAlpha = alpha * 0.5;
						ctx.lineWidth = 0.5;
					}
					roundRect(ctx, x, y, w, h, 2);
					ctx.stroke();

					// Selection glow
					if (isSelected) {
						ctx.shadowColor = color;
						ctx.shadowBlur = 6;
						ctx.strokeStyle = color;
						ctx.globalAlpha = 0.4;
						ctx.lineWidth = 1;
						roundRect(ctx, x, y, w, h, 2);
						ctx.stroke();
						ctx.shadowBlur = 0;
					}

					// Scrub highlight glow
					if (highlightedNoteIds.has(note.id)) {
						ctx.shadowColor = '#ffffff';
						ctx.shadowBlur = 12;
						ctx.fillStyle = '#ffffff';
						ctx.globalAlpha = 0.45;
						roundRect(ctx, x, y, w, h, 2);
						ctx.fill();
						ctx.shadowBlur = 0;
					}

					ctx.globalAlpha = 1;
				}
			}
		}
	}

	function drawPreview(ctx: CanvasRenderingContext2D) {
		if (!drawPreviewNote) return;
		const x = tickToX(drawPreviewNote.startTick);
		const y = midiToY(drawPreviewNote.midi);
		const w = Math.max(drawPreviewNote.durationTicks * pixelsPerTick - 1, 2);
		const h = NOTE_HEIGHT;

		ctx.fillStyle = '#6366f1';
		ctx.globalAlpha = 0.5;
		roundRect(ctx, x, y, w, h, 2);
		ctx.fill();
		ctx.strokeStyle = '#6366f1';
		ctx.globalAlpha = 0.8;
		ctx.lineWidth = 1;
		roundRect(ctx, x, y, w, h, 2);
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	function drawChordLabels(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.fillStyle = 'rgba(6, 6, 15, 0.9)';
		ctx.fillRect(0, 0, canvasWidth, CHORD_LABEL_HEIGHT);

		ctx.font = '10px "JetBrains Mono", monospace';
		ctx.textBaseline = 'middle';

		for (const bar of bars) {
			for (const entry of bar.entries) {
				const chordName = entry.recognizedChordName ?? (entry.notes.length > 0 ? '?' : entry.originalChordName);
				if (!chordName) continue;

				const x = tickToX(entry.startTick) - scrollX;
				if (x + 100 < 0 || x > canvasWidth) continue;

				// Custom voicing: amber background badge
				if (entry.isCustomVoicing) {
					const textWidth = ctx.measureText(chordName + ' ★').width;
					ctx.fillStyle = 'rgba(217, 119, 6, 0.25)';
					roundRect(ctx, x + 1, 2, textWidth + 6, CHORD_LABEL_HEIGHT - 4, 3);
					ctx.fill();
				}

				let color = '#9090b0';
				try {
					const root = extractRoot(chordName);
					color = ROOT_COLORS[root] ?? '#9090b0';
				} catch { /* ignore */ }

				ctx.fillStyle = color;
				ctx.globalAlpha = 0.8;
				if (entry.isCustomVoicing) {
					ctx.fillText(chordName + ' ★', x + 3, CHORD_LABEL_HEIGHT / 2);
				} else {
					ctx.fillText(chordName, x + 3, CHORD_LABEL_HEIGHT / 2);
				}
				ctx.globalAlpha = 1;
			}
		}
		ctx.restore();
	}

	function drawPlayCursor(ctx: CanvasRenderingContext2D) {
		if (activeBarIndex < 0 && currentTime <= 0) return;
		// Use currentTime for smooth real-time cursor position
		let cursorTick: number;
		if (currentTime > 0) {
			const secondsPerBeat = 60 / bpm;
			const secondsPerTick = secondsPerBeat / TICKS_PER_QUARTER;
			cursorTick = currentTime / secondsPerTick;
		} else if (activeBarIndex >= 0) {
			cursorTick = activeBarIndex * ticksPerBar;
		} else {
			return;
		}
		const x = tickToX(cursorTick);

		ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, totalNoteHeight);
		ctx.stroke();

		ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, totalNoteHeight);
		ctx.stroke();
	}

	function drawDragGhosts(ctx: CanvasRenderingContext2D) {
		if (dragGhosts.length === 0) return;
		for (const ghost of dragGhosts) {
			const x = tickToX(ghost.startTick);
			const y = midiToY(ghost.midi);
			const w = Math.max(ghost.durationTicks * pixelsPerTick - 1, 2);
			const h = NOTE_HEIGHT;
			ctx.fillStyle = '#9090b0';
			ctx.globalAlpha = 0.3;
			roundRect(ctx, x, y, w, h, 2);
			ctx.fill();
			ctx.strokeStyle = '#9090b0';
			ctx.globalAlpha = 0.2;
			ctx.lineWidth = 1;
			ctx.setLineDash([3, 3]);
			roundRect(ctx, x, y, w, h, 2);
			ctx.stroke();
			ctx.setLineDash([]);
		}
		ctx.globalAlpha = 1;
	}

	function drawSnapGuideline(ctx: CanvasRenderingContext2D) {
		if (dragSnapTick === null) return;
		const x = tickToX(dragSnapTick);
		ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, totalNoteHeight);
		ctx.stroke();
		ctx.setLineDash([]);
	}

	function drawDragTooltip() {
		if (!dragTooltipMidi || !dragTooltipCanvasPos || !canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.save();

		const noteName = midiToNoteName(dragTooltipMidi);
		ctx.font = '11px "JetBrains Mono", monospace';
		const textWidth = ctx.measureText(noteName).width;
		const px = dragTooltipCanvasPos.x + 14;
		const py = dragTooltipCanvasPos.y - 10;
		const padX = 5;
		const padY = 3;

		ctx.fillStyle = 'rgba(6, 6, 15, 0.85)';
		roundRect(ctx, px - padX, py - 12 - padY, textWidth + padX * 2, 14 + padY * 2, 3);
		ctx.fill();
		ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
		ctx.lineWidth = 1;
		roundRect(ctx, px - padX, py - 12 - padY, textWidth + padX * 2, 14 + padY * 2, 3);
		ctx.stroke();

		ctx.fillStyle = '#e0e0ff';
		ctx.textBaseline = 'middle';
		ctx.fillText(noteName, px, py - 4);
		ctx.restore();
	}

	function drawLassoRect(ctx: CanvasRenderingContext2D) {
		if (!lassoRect) return;
		ctx.save();

		const x = Math.min(lassoRect.x1, lassoRect.x2);
		const y = Math.min(lassoRect.y1, lassoRect.y2);
		const w = Math.abs(lassoRect.x2 - lassoRect.x1);
		const h = Math.abs(lassoRect.y2 - lassoRect.y1);

		ctx.fillStyle = 'rgba(167, 139, 250, 0.08)';
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = 'rgba(167, 139, 250, 0.5)';
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.strokeRect(x, y, w, h);
		ctx.setLineDash([]);

		ctx.restore();
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

	// ── Coordinate conversion helpers ────────────────────

	function yToMidi(canvasY: number): number {
		const worldY = canvasY - CHORD_LABEL_HEIGHT + scrollY;
		return Math.floor(MAX_MIDI - worldY / NOTE_HEIGHT);
	}

	function xToTick(canvasX: number): number {
		return (canvasX + scrollX) / pixelsPerTick;
	}

	function snapToTick(tick: number): number {
		return Math.round(tick / snapTicks) * snapTicks;
	}

	function findNoteAt(canvasX: number, canvasY: number): { note: PianoRollNote; entry: PianoRollBarEntry; bar: PianoRollBar } | null {
		const tick = xToTick(canvasX);
		const worldY = canvasY - CHORD_LABEL_HEIGHT + scrollY;
		const HIT_PAD = 4; // extra pixels above/below for easier clicking

		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const note of entry.notes) {
					const noteY = midiToY(note.midi);
					if (worldY >= noteY - HIT_PAD && worldY < noteY + NOTE_HEIGHT + HIT_PAD &&
						tick >= note.startTick &&
						tick <= note.startTick + note.durationTicks) {
						return { note, entry, bar };
					}
				}
			}
		}
		return null;
	}

	function isNoteRightEdge(canvasX: number, note: PianoRollNote): boolean {
		const noteEndX = tickToX(note.startTick + note.durationTicks) - scrollX;
		return Math.abs(canvasX - noteEndX) < NOTE_EDGE_THRESHOLD;
	}

	// ── Undo/Redo ────────────────────────────────────────

	function pushUndo() {
		undoStack = [...undoStack, JSON.parse(JSON.stringify(bars))];
		redoStack = [];
	}

	function performUndo() {
		if (undoStack.length === 0) return;
		const prev = undoStack[undoStack.length - 1];
		redoStack = [...redoStack, JSON.parse(JSON.stringify(bars))];
		undoStack = undoStack.slice(0, -1);
		bars = prev;
		notifyScoreChange();
	}

	function performRedo() {
		if (redoStack.length === 0) return;
		const next = redoStack[redoStack.length - 1];
		undoStack = [...undoStack, JSON.parse(JSON.stringify(bars))];
		redoStack = redoStack.slice(0, -1);
		bars = next;
		notifyScoreChange();
	}

	// ── Score change notification ────────────────────────

	function notifyScoreChange() {
		const newScore = pianoRollToScore(bars, score);
		onScoreChange(newScore);
	}

	// ── Auto Voicing ────────────────────────────────────

	function handleAutoVoicing() {
		const hasSelection = selectedNoteIds.size > 0;
		const msg = hasSelection
			? `選択中の${selectedNoteIds.size}ノートを含むエントリにAuto Voicingを適用しますか？\nノートの配置が書き換わります。`
			: 'すべてのエントリにAuto Voicingを適用しますか？\nノートの配置が書き換わります。';
		if (!confirm(msg)) return;
		pushUndo();
		bars = applyAutoVoicing(bars, hasSelection ? selectedNoteIds : undefined);
		notifyScoreChange();
	}

	// ── Chord recognition for affected entries ───────────

	function reRecognizeEntry(entry: PianoRollBarEntry) {
		if (entry.notes.length === 0) {
			entry.recognizedChordName = null;
			entry.isCustomVoicing = false;
			return;
		}
		const midiNotes = entry.notes.map((n) => n.midi);
		const result = recognizeChord(midiNotes, entry.originalChordName ?? undefined);
		if (result) {
			entry.recognizedChordName = result.name;
			entry.isCustomVoicing = false;
		} else {
			entry.recognizedChordName = null;
			entry.isCustomVoicing = true;
		}
	}

	function findEntryForTick(tick: number): PianoRollBarEntry | null {
		for (const bar of bars) {
			for (const entry of bar.entries) {
				if (tick >= entry.startTick && tick < entry.startTick + entry.durationTicks) {
					return entry;
				}
			}
		}
		return null;
	}

	// ── Note ID generation ───────────────────────────────

	let noteIdCounter = 0;
	function generateNoteId(): string {
		return `note_edit_${++noteIdCounter}_${Date.now()}`;
	}

	// ── Pointer event handlers ───────────────────────────

	function getCanvasPos(e: PointerEvent): { x: number; y: number } {
		const rect = canvasEl!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function handlePointerDown(e: PointerEvent) {
		if (!canvasEl) return;
		// Ignore right-click (handled by contextmenu for scrub)
		if (e.button === 2) return;
		const pos = getCanvasPos(e);

		// Click on chord label bar → seek playback position
		if (pos.y < CHORD_LABEL_HEIGHT) {
			if (onSeek && totalTicks > 0) {
				const tick = xToTick(pos.x);
				const secondsPerTick = 60 / bpm / TICKS_PER_QUARTER;
				onSeek(Math.max(0, tick * secondsPerTick));
			}
			return;
		}

		// Unified mode: click=select, drag empty=lasso, drag note=move, double-click=add
		handleSelectStart(pos, e);
	}

	// ── Double-click to add note ─────────────────────────

	function handleDoubleClick(e: MouseEvent) {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

		// Ignore if on chord label bar
		if (pos.y < CHORD_LABEL_HEIGHT) return;

		// Only add note if clicking on empty area
		const hit = findNoteAt(pos.x, pos.y);
		if (hit) return; // already a note here

		handleDrawStart(pos);
		// Immediately finalize the note (single click = 1 snap unit)
		handleDrawEnd();
	}

	// ── Draw tool ────────────────────────────────────────

	function handleDrawStart(pos: { x: number; y: number }) {
		const midi = yToMidi(pos.y);
		if (midi < MIN_MIDI || midi > MAX_MIDI) return;

		const rawTick = xToTick(pos.x);
		const startTick = snapToTick(rawTick);
		if (startTick < 0 || startTick >= totalTicks) return;

		isDragging = true;
		dragMode = 'draw';
		dragStartTick = startTick;
		dragStartMidi = midi;

		drawPreviewNote = { midi, startTick, durationTicks: snapTicks };
		playNotePreview(midi);

		document.addEventListener('pointermove', handlePointerMove);
		document.addEventListener('pointerup', handlePointerUp);
	}

	function handleDrawMove(pos: { x: number; y: number }) {
		const rawTick = xToTick(pos.x);
		const endTick = snapToTick(rawTick);
		const duration = Math.max(snapTicks, endTick - dragStartTick + snapTicks);

		drawPreviewNote = {
			midi: dragStartMidi,
			startTick: dragStartTick,
			durationTicks: Math.min(duration, totalTicks - dragStartTick),
		};
	}

	function handleDrawEnd() {
		if (!drawPreviewNote) return;

		pushUndo();

		const entry = findEntryForTick(drawPreviewNote.startTick);
		const barIndex = Math.floor(drawPreviewNote.startTick / ticksPerBar);

		const newNote: PianoRollNote = {
			id: generateNoteId(),
			midi: drawPreviewNote.midi,
			startTick: drawPreviewNote.startTick,
			durationTicks: drawPreviewNote.durationTicks,
			velocity: 100,
			barIndex,
			entryIndex: entry?.entryIndex ?? 0,
			isChordTone: false,
		};

		if (entry) {
			entry.notes = [...entry.notes, newNote];
			reRecognizeEntry(entry);
		} else if (bars[barIndex]) {
			// Add to first entry of the bar
			const firstEntry = bars[barIndex].entries[0];
			if (firstEntry) {
				firstEntry.notes = [...firstEntry.notes, newNote];
				reRecognizeEntry(firstEntry);
			}
		}

		bars = [...bars]; // trigger reactivity
		drawPreviewNote = null;
		notifyScoreChange();
	}

	// ── Select tool ──────────────────────────────────────

	function handleSelectStart(pos: { x: number; y: number }, e: PointerEvent) {
		const hit = findNoteAt(pos.x, pos.y);

		if (!hit) {
			// Start lasso (rubber band) selection from empty area
			if (!e.shiftKey) selectedNoteIds = new Set();
			isDragging = true;
			dragMode = 'lasso';
			dragStartX = pos.x;
			dragStartY = pos.y;
			lassoRect = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
			lassoMoved = false;

			document.addEventListener('pointermove', handlePointerMove);
			document.addEventListener('pointerup', handlePointerUp);
			return;
		}

		const { note } = hit;

		// Check if clicking on right edge for resize
		if (isNoteRightEdge(pos.x, note)) {
			pushUndo();
			isDragging = true;
			dragMode = 'resize';
			dragNote = note;
			dragNoteOriginalDuration = note.durationTicks;
			dragStartX = pos.x;

			document.addEventListener('pointermove', handlePointerMove);
			document.addEventListener('pointerup', handlePointerUp);
			return;
		}

		// Audition note on click
		playNotePreview(note.midi);

		// Select note
		if (e.shiftKey) {
			const newSet = new Set(selectedNoteIds);
			if (newSet.has(note.id)) {
				newSet.delete(note.id);
			} else {
				newSet.add(note.id);
			}
			selectedNoteIds = newSet;
		} else if (!selectedNoteIds.has(note.id)) {
			// Only reset selection if clicking an unselected note
			selectedNoteIds = new Set([note.id]);
		}
		// If clicking an already-selected note (without shift), keep the multi-selection
		// so that dragging moves all selected notes together

		// Start move drag
		pushUndo();
		isDragging = true;
		dragMode = 'move';
		dragNote = note;
		dragNoteOriginalTick = note.startTick;
		dragNoteOriginalMidi = note.midi;
		dragStartX = pos.x;
		dragStartY = pos.y;

		// Capture ghost positions for all selected notes
		dragGhosts = [];
		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const n of entry.notes) {
					if (selectedNoteIds.has(n.id)) {
						dragGhosts.push({ midi: n.midi, startTick: n.startTick, durationTicks: n.durationTicks });
					}
				}
			}
		}

		document.addEventListener('pointermove', handlePointerMove);
		document.addEventListener('pointerup', handlePointerUp);
	}

	function handleSelectMove(pos: { x: number; y: number }) {
		if (!dragNote) return;

		if (dragMode === 'move') {
			const deltaTick = xToTick(pos.x) - xToTick(dragStartX);
			const deltaMidi = yToMidi(pos.y) - yToMidi(dragStartY);
			const newTick = snapToTick(dragNoteOriginalTick + deltaTick);
			const newMidi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, dragNoteOriginalMidi + deltaMidi));

			// Move all selected notes by the same delta
			const tickDelta = newTick - dragNote.startTick;
			const midiDelta = newMidi - dragNote.midi;

			for (const bar of bars) {
				for (const entry of bar.entries) {
					for (const note of entry.notes) {
						if (selectedNoteIds.has(note.id)) {
							note.startTick = Math.max(0, note.startTick + tickDelta);
							note.midi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, note.midi + midiDelta));
						}
					}
				}
			}
			// Reassign notes to correct entries and re-recognize during drag
			reassignNotesToEntries();
			for (const bar of bars) {
				for (const entry of bar.entries) {
					reRecognizeEntry(entry);
				}
			}
			bars = [...bars];

			// Update tooltip and snap guideline
			dragTooltipMidi = newMidi;
			dragTooltipCanvasPos = pos;
			dragSnapTick = newTick;
		} else if (dragMode === 'resize') {
			const deltaTick = xToTick(pos.x) - xToTick(dragStartX);
			const newDuration = snapToTick(Math.max(snapTicks, dragNoteOriginalDuration + deltaTick));
			dragNote.durationTicks = newDuration;
			bars = [...bars];
		}
	}

	function handleSelectEnd() {
		if (dragMode === 'move' || dragMode === 'resize') {
			// Reassign notes to correct entries based on their tick position
			reassignNotesToEntries();
			// Re-recognize all affected entries
			for (const bar of bars) {
				for (const entry of bar.entries) {
					reRecognizeEntry(entry);
				}
			}
			notifyScoreChange();
		}
	}

	/** Move notes to the entry that matches their tick position */
	function reassignNotesToEntries() {
		// Collect all notes that were selected (moved)
		const movedNotes: PianoRollNote[] = [];
		for (const bar of bars) {
			for (const entry of bar.entries) {
				const staying: PianoRollNote[] = [];
				for (const note of entry.notes) {
					if (selectedNoteIds.has(note.id)) {
						movedNotes.push(note);
					} else {
						staying.push(note);
					}
				}
				entry.notes = staying;
			}
		}

		// Re-insert each moved note into the correct entry
		for (const note of movedNotes) {
			const targetEntry = findEntryForTick(note.startTick);
			if (targetEntry) {
				note.barIndex = Math.floor(note.startTick / ticksPerBar);
				note.entryIndex = targetEntry.entryIndex;
				targetEntry.notes = [...targetEntry.notes, note];
			} else {
				// If no entry found (note moved past end), put in last entry
				const lastBar = bars[bars.length - 1];
				if (lastBar && lastBar.entries.length > 0) {
					const lastEntry = lastBar.entries[lastBar.entries.length - 1];
					note.barIndex = lastBar.barIndex;
					note.entryIndex = lastEntry.entryIndex;
					lastEntry.notes = [...lastEntry.notes, note];
				}
			}
		}
	}

	// ── Erase tool ───────────────────────────────────────

	function handleEraseAt(pos: { x: number; y: number }) {
		const hit = findNoteAt(pos.x, pos.y);
		if (!hit) return;

		pushUndo();

		const { note, entry } = hit;
		entry.notes = entry.notes.filter((n) => n.id !== note.id);
		selectedNoteIds.delete(note.id);
		selectedNoteIds = new Set(selectedNoteIds);

		reRecognizeEntry(entry);
		bars = [...bars];
		notifyScoreChange();
	}

	// ── Global pointer handlers ──────────────────────────

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || !canvasEl) return;
		const pos = getCanvasPos(e);

		if (dragMode === 'draw') {
			handleDrawMove(pos);
		} else if (dragMode === 'move' || dragMode === 'resize') {
			handleSelectMove(pos);
		} else if (dragMode === 'lasso') {
			handleLassoMove(pos);
		}
	}

	function handleLassoMove(pos: { x: number; y: number }) {
		lassoRect = { x1: dragStartX, y1: dragStartY, x2: pos.x, y2: pos.y };
		// Find notes inside the lasso rectangle using world coordinates
		const minCanvasX = Math.min(dragStartX, pos.x);
		const maxCanvasX = Math.max(dragStartX, pos.x);
		const minCanvasY = Math.min(dragStartY, pos.y);
		const maxCanvasY = Math.max(dragStartY, pos.y);
		// Convert canvas coords to world coords for note matching
		const minWorldX = minCanvasX + scrollX;
		const maxWorldX = maxCanvasX + scrollX;
		const minWorldY = minCanvasY - CHORD_LABEL_HEIGHT + scrollY;
		const maxWorldY = maxCanvasY - CHORD_LABEL_HEIGHT + scrollY;
		// Convert world coords to tick/midi for note matching
		const minTick = minWorldX / pixelsPerTick;
		const maxTick = maxWorldX / pixelsPerTick;
		const newSelection = new Set<string>();
		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const note of entry.notes) {
					const noteY = midiToY(note.midi);
					// Check if note's Y range overlaps with lasso's world Y range
					if (noteY + NOTE_HEIGHT > minWorldY && noteY < maxWorldY &&
						note.startTick + note.durationTicks > minTick &&
						note.startTick < maxTick) {
						newSelection.add(note.id);
					}
				}
			}
		}
		selectedNoteIds = newSelection;
	}

	function handleLassoEnd() {
		lassoRect = null;
	}

	function handlePointerUp() {
		if (dragMode === 'draw') {
			handleDrawEnd();
		} else if (dragMode === 'move' || dragMode === 'resize') {
			handleSelectEnd();
		} else if (dragMode === 'lasso') {
			handleLassoEnd();
		}

		isDragging = false;
		dragMode = 'none';
		dragNote = null;
		dragGhosts = [];
		dragTooltipMidi = null;
		dragTooltipCanvasPos = null;
		dragSnapTick = null;

		document.removeEventListener('pointermove', handlePointerMove);
		document.removeEventListener('pointerup', handlePointerUp);
	}

	// ── Keyboard shortcuts ───────────────────────────────

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
			e.preventDefault();
			if (e.shiftKey) {
				performRedo();
			} else {
				performUndo();
			}
			return;
		}

		// Delete selected notes
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedNoteIds.size > 0) {
				e.preventDefault();
				pushUndo();
				for (const bar of bars) {
					for (const entry of bar.entries) {
						const before = entry.notes.length;
						entry.notes = entry.notes.filter((n) => !selectedNoteIds.has(n.id));
						if (entry.notes.length !== before) {
							reRecognizeEntry(entry);
						}
					}
				}
				selectedNoteIds = new Set();
				bars = [...bars];
				notifyScoreChange();
			}
		}
	}

	// ── Right-click scrub playback (FL Studio style) ────

	function findNotesAtTick(tick: number): PianoRollNote[] {
		const result: PianoRollNote[] = [];
		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const note of entry.notes) {
					if (tick >= note.startTick && tick < note.startTick + note.durationTicks) {
						result.push(note);
					}
				}
			}
		}
		return result;
	}

	function scrubAtPosition(canvasX: number) {
		const tick = xToTick(canvasX);
		const snappedTick = snapToTick(tick);
		if (snappedTick === scrubLastTick) return;
		scrubLastTick = snappedTick;

		const notes = findNotesAtTick(snappedTick);
		const midiNotes = notes.map((n) => n.midi);

		// Highlight the notes
		highlightedNoteIds = new Set(notes.map((n) => n.id));
		if (highlightFadeTimer) clearTimeout(highlightFadeTimer);
		highlightFadeTimer = setTimeout(() => {
			highlightedNoteIds = new Set();
			highlightFadeTimer = null;
		}, 300);

		scrubPlayColumn(midiNotes);
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		if (!canvasEl) return;

		const rect = canvasEl.getBoundingClientRect();
		const canvasX = e.clientX - rect.left;

		isScrubbing = true;
		scrubLastTick = -1;
		scrubAtPosition(canvasX);

		document.addEventListener('pointermove', handleScrubMove);
		document.addEventListener('pointerup', handleScrubEnd);
	}

	function handleScrubMove(e: PointerEvent) {
		if (!isScrubbing || !canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const canvasX = e.clientX - rect.left;
		scrubAtPosition(canvasX);
	}

	function handleScrubEnd() {
		isScrubbing = false;
		scrubLastTick = -1;
		scrubRelease();
		// Let highlight fade naturally via the timer
		document.removeEventListener('pointermove', handleScrubMove);
		document.removeEventListener('pointerup', handleScrubEnd);
	}

	// ── Canvas cursor ────────────────────────────────────

	let canvasCursor = $state('default');

	function updateCursor(pos: { x: number; y: number }) {
		if (isDragging) return; // don't change cursor during drag
		if (pos.y < CHORD_LABEL_HEIGHT) {
			canvasCursor = 'pointer';
			return;
		}
		const hit = findNoteAt(pos.x, pos.y);
		if (hit && isNoteRightEdge(pos.x, hit.note)) {
			canvasCursor = 'ew-resize';
		} else if (hit) {
			canvasCursor = 'grab';
		} else {
			canvasCursor = 'crosshair';
		}
	}

	// ── Piano keys ───────────────────────────────────────

	function getPianoKeys(): { midi: number; name: string; isBlack: boolean; label: string | null }[] {
		const keys = [];
		for (let midi = MAX_MIDI; midi >= MIN_MIDI; midi--) {
			const noteInOctave = midi % 12;
			const octave = Math.floor(midi / 12) - 1;
			const name = NOTE_NAMES[noteInOctave];
			const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);
			const label = noteInOctave === 0 ? `C${octave}` : null;
			keys.push({ midi, name, isBlack, label });
		}
		return keys;
	}

	let pianoKeys = $derived(getPianoKeys());

	// ── Scroll & Zoom handlers ───────────────────────────

	function handleWheel(e: WheelEvent) {
		e.preventDefault();

		if (e.ctrlKey || e.metaKey) {
			const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
			pixelsPerTick = Math.max(0.02, Math.min(1, pixelsPerTick * zoomFactor));
		} else if (e.shiftKey) {
			scrollX = Math.max(0, Math.min(totalCanvasWidth - canvasWidth, scrollX + e.deltaY));
		} else {
			scrollY = Math.max(0, Math.min(totalNoteHeight - (canvasHeight - CHORD_LABEL_HEIGHT), scrollY + e.deltaY));
			scrollX = Math.max(0, Math.min(totalCanvasWidth - canvasWidth, scrollX + e.deltaX));
		}
	}

	// ── Touch gestures (pinch zoom, pan, double-tap, long press) ──

	let lastPinchDistance = 0;
	let isPinching = false;
	let touchPanStartX = 0;
	let touchPanStartY = 0;
	let touchPanScrollX = 0;
	let touchPanScrollY = 0;
	let isTouchPanning = false;
	let lastTapTime = 0;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressPos: { x: number; y: number } | null = null;

	function getPinchDistance(touches: TouchList): number {
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			// Pinch zoom start
			isPinching = true;
			isTouchPanning = false;
			lastPinchDistance = getPinchDistance(e.touches);
			clearLongPress();
			e.preventDefault();
			return;
		}

		if (e.touches.length === 1) {
			const touch = e.touches[0];
			const rect = canvasEl!.getBoundingClientRect();
			const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

			// Double-tap detection (delete note)
			const now = Date.now();
			if (now - lastTapTime < 300) {
				clearLongPress();
				const hit = findNoteAt(pos.x, pos.y);
				if (hit) {
					handleEraseAt(pos);
					e.preventDefault();
					lastTapTime = 0;
					return;
				}
			}
			lastTapTime = now;

			// Long press detection (toggle tool)
			longPressPos = pos;
			longPressTimer = setTimeout(() => {
				if (longPressPos) {
					const hit = findNoteAt(longPressPos.x, longPressPos.y);
					if (hit) {
						// Long press on note: delete it
						handleEraseAt(longPressPos);
					}
					longPressPos = null;
				}
			}, 500);

			// Pan: on empty area
			const hit = findNoteAt(pos.x, pos.y);
			if (!hit) {
				isTouchPanning = true;
				touchPanStartX = touch.clientX;
				touchPanStartY = touch.clientY;
				touchPanScrollX = scrollX;
				touchPanScrollY = scrollY;
			}
		}
	}

	function handleTouchMove(e: TouchEvent) {
		clearLongPress();

		if (isPinching && e.touches.length === 2) {
			const newDist = getPinchDistance(e.touches);
			if (lastPinchDistance > 0) {
				const scale = newDist / lastPinchDistance;
				pixelsPerTick = Math.max(0.02, Math.min(1.0, pixelsPerTick * scale));
			}
			lastPinchDistance = newDist;
			e.preventDefault();
			return;
		}

		if (isTouchPanning && e.touches.length === 1) {
			const touch = e.touches[0];
			const dx = touchPanStartX - touch.clientX;
			const dy = touchPanStartY - touch.clientY;
			scrollX = Math.max(0, Math.min(totalCanvasWidth - canvasWidth, touchPanScrollX + dx));
			scrollY = Math.max(0, Math.min(totalNoteHeight - (canvasHeight - CHORD_LABEL_HEIGHT), touchPanScrollY + dy));
			e.preventDefault();
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		clearLongPress();
		if (e.touches.length < 2) {
			isPinching = false;
			lastPinchDistance = 0;
		}
		if (e.touches.length === 0) {
			isTouchPanning = false;
		}
	}

	function clearLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		longPressPos = null;
	}

	// ── Sync piano keys scroll ───────────────────────────

	$effect(() => {
		if (pianoKeysEl) {
			pianoKeysEl.style.transform = `translateY(${-scrollY}px)`;
		}
	});

	// ── Resize observer ──────────────────────────────────

	onMount(() => {
		if (!containerEl) return;

		const c4Y = midiToY(60);
		scrollY = Math.max(0, c4Y - canvasHeight / 2);

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const keysWidth = pianoKeysWrapperEl?.offsetWidth ?? PIANO_KEY_WIDTH;
				canvasWidth = entry.contentRect.width - keysWidth;
				canvasHeight = entry.contentRect.height;
			}
		});
		ro.observe(containerEl);

		return () => ro.disconnect();
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="piano-roll-outer">
	<PianoRollToolbar
		{snapDivision}
		onSnapChange={(s) => { snapDivision = s; }}
		onUndo={performUndo}
		onRedo={performRedo}
		onAutoVoicing={handleAutoVoicing}
		{canUndo}
		{canRedo}
	/>

	<div
		class="piano-roll-container"
		bind:this={containerEl}
	>
		<!-- Piano Keys (DOM) -->
		<div class="piano-keys-wrapper" bind:this={pianoKeysWrapperEl}>
			<div class="piano-keys-spacer"></div>
			<div class="piano-keys-scroll">
				<div class="piano-keys" bind:this={pianoKeysEl}>
					{#each pianoKeys as key (key.midi)}
						<div
							class="piano-key"
							class:black={key.isBlack}
							class:white={!key.isBlack}
						>
							{#if key.label}
								<span class="key-label">{key.label}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Canvas -->
		<div class="canvas-wrapper" onwheel={handleWheel}>
			<canvas
				bind:this={canvasEl}
				style="width: {canvasWidth}px; height: {canvasHeight}px; cursor: {canvasCursor};"
				onpointerdown={handlePointerDown}
				onpointermove={(e) => { if (!isDragging) updateCursor(getCanvasPos(e)); }}
				ondblclick={handleDoubleClick}
				oncontextmenu={handleContextMenu}
				ontouchstart={handleTouchStart}
				ontouchmove={handleTouchMove}
				ontouchend={handleTouchEnd}
			></canvas>
		</div>
	</div>
</div>

<style>
	.piano-roll-outer {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		height: 100%;
	}

	.piano-roll-container {
		display: flex;
		flex: 1;
		min-height: 200px;
		background: var(--bg-deepest, #06060f);
		border: 1px solid var(--border-default, #3a3a7a);
		border-radius: 8px;
		overflow: hidden;
		position: relative;
	}

	.piano-keys-wrapper {
		width: 60px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--border-strong, #5a5aaa);
		overflow: hidden;
		position: relative;
		z-index: 2;
		background: var(--bg-deepest, #06060f);
	}

	.piano-keys-spacer {
		height: 24px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--border-subtle, #2a2a5a);
	}

	.piano-keys-scroll {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.piano-keys {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		will-change: transform;
	}

	.piano-key {
		height: 12px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 4px;
		font-size: 8px;
		font-family: 'JetBrains Mono', monospace;
		box-sizing: border-box;
		border-bottom: 1px solid rgba(42, 42, 90, 0.2);
	}

	.piano-key.white {
		background: rgba(255, 255, 255, 0.06);
	}

	.piano-key.black {
		background: rgba(0, 0, 0, 0.3);
		width: 70%;
	}

	.key-label {
		color: var(--text-secondary, #9090b0);
		font-weight: 500;
	}

	.canvas-wrapper {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	canvas {
		display: block;
		touch-action: none;
	}

	@media (max-width: 600px) {
		.piano-keys-wrapper {
			width: 40px;
		}

		.piano-keys-spacer {
			height: 20px;
		}

		.piano-key {
			height: 14px;
			font-size: 7px;
			padding-right: 2px;
		}

		.piano-roll-outer {
			gap: 4px;
		}

		.piano-roll-container {
			min-height: 180px;
		}
	}
</style>
