<script lang="ts">
  import { parseMelody, type MelodyNote } from '$lib/directive-parser';

  interface Props {
    melody: string;
    onMelodyChange: (text: string) => void;
  }

  let { melody, onMelodyChange }: Props = $props();

  // --- Constants ---
  const TICKS_PER_QUARTER = 480;
  const DEFAULT_DURATION = TICKS_PER_QUARTER; // quarter note
  const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const GRID_COLOR = 'rgba(232,168,76,0.08)';
  const NOTE_COLOR = '#f59e0b';       // amber-500
  const NOTE_HOVER = '#fbbf24';       // amber-400
  const NOTE_SELECTED = '#d97706';    // amber-600
  const BG_COLOR = '#1a1408'; // matches --bg-surface (Warm Amber)
  const PITCH_LABEL_WIDTH = 32;
  const RESIZE_HANDLE_WIDTH = 6;
  const MIN_DURATION = 120; // 16th note

  // --- State ---
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let notes = $state<MelodyNote[]>([]);
  let hoveredIndex = $state(-1);
  let selectedIndex = $state(-1);
  let dragMode = $state<'none' | 'move' | 'resize'>('none');
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragOrigTick = $state(0);
  let dragOrigMidi = $state(0);
  let dragOrigDuration = $state(0);

  // --- Derived layout ---
  let pitchRange = $derived.by(() => {
    const playable = notes.filter(n => !n.isRest);
    if (playable.length === 0) return { min: 57, max: 69 }; // A3-A4
    const mids = playable.map(n => n.midi);
    const lo = Math.min(...mids);
    const hi = Math.max(...mids);
    const pad = Math.max(2, Math.ceil((hi - lo) * 0.2));
    return { min: Math.max(0, lo - pad), max: Math.min(127, hi + pad) };
  });

  let totalTicks = $derived.by(() => {
    let t = 0;
    for (const n of notes) t += n.durationTicks;
    return Math.max(t, TICKS_PER_QUARTER * 4); // at least 1 bar
  });

  // --- Parse melody when prop changes ---
  $effect(() => {
    const parsed = parseMelody(melody);
    notes = parsed.notes;
  });

  // --- Draw ---
  $effect(() => {
    // depend on reactive state
    const _notes = notes;
    const _hovered = hoveredIndex;
    const _selected = selectedIndex;
    const _pitchRange = pitchRange;
    const _totalTicks = totalTicks;
    const canvas = canvasEl;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const drawW = w - PITCH_LABEL_WIDTH;
    const drawH = h;
    const pitchCount = _pitchRange.max - _pitchRange.min + 1;
    const rowH = drawH / pitchCount;
    const pxPerTick = drawW / _totalTicks;

    // Grid lines (quarter notes)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let tick = 0; tick <= _totalTicks; tick += TICKS_PER_QUARTER) {
      const x = PITCH_LABEL_WIDTH + tick * pxPerTick;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal grid (pitch lines)
    for (let i = 0; i <= pitchCount; i++) {
      const y = i * rowH;
      ctx.strokeStyle = GRID_COLOR;
      ctx.beginPath();
      ctx.moveTo(PITCH_LABEL_WIDTH, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Pitch labels
    ctx.fillStyle = 'rgba(236,228,212,0.4)'; // --text-primary warm tint
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let midi = _pitchRange.max; midi >= _pitchRange.min; midi--) {
      const row = _pitchRange.max - midi;
      const y = row * rowH + rowH / 2;
      const name = midiToLabel(midi);
      ctx.fillText(name, PITCH_LABEL_WIDTH - 3, y);
    }

    // Draw notes
    let tickOffset = 0;
    for (let i = 0; i < _notes.length; i++) {
      const n = _notes[i];
      if (!n.isRest) {
        const x = PITCH_LABEL_WIDTH + tickOffset * pxPerTick;
        const noteW = n.durationTicks * pxPerTick;
        const row = _pitchRange.max - n.midi;
        const y = row * rowH + 1;
        const noteH = rowH - 2;

        let color = NOTE_COLOR;
        if (i === _selected) color = NOTE_SELECTED;
        else if (i === _hovered) color = NOTE_HOVER;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(noteW - 1, 2), noteH, 2);
        ctx.fill();

        // Resize handle indicator
        if (i === _hovered || i === _selected) {
          ctx.fillStyle = 'rgba(236,228,212,0.3)';
          ctx.fillRect(x + noteW - RESIZE_HANDLE_WIDTH, y, RESIZE_HANDLE_WIDTH - 1, noteH);
        }
      }
      tickOffset += n.durationTicks;
    }
  });

  // --- Hit testing ---
  function hitTest(clientX: number, clientY: number): { index: number; isResize: boolean } | null {
    const canvas = canvasEl;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const drawW = rect.width - PITCH_LABEL_WIDTH;
    const pitchCount = pitchRange.max - pitchRange.min + 1;
    const rowH = rect.height / pitchCount;
    const pxPerTick = drawW / totalTicks;

    let tickOffset = 0;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (!n.isRest) {
        const nx = PITCH_LABEL_WIDTH + tickOffset * pxPerTick;
        const nw = n.durationTicks * pxPerTick;
        const row = pitchRange.max - n.midi;
        const ny = row * rowH;

        if (x >= nx && x <= nx + nw && y >= ny && y <= ny + rowH) {
          const isResize = x >= nx + nw - RESIZE_HANDLE_WIDTH;
          return { index: i, isResize };
        }
      }
      tickOffset += n.durationTicks;
    }
    return null;
  }

  function clientToTickAndMidi(clientX: number, clientY: number): { tick: number; midi: number } {
    const canvas = canvasEl!;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - PITCH_LABEL_WIDTH;
    const y = clientY - rect.top;
    const drawW = rect.width - PITCH_LABEL_WIDTH;
    const pitchCount = pitchRange.max - pitchRange.min + 1;
    const rowH = rect.height / pitchCount;
    const pxPerTick = drawW / totalTicks;

    const tick = Math.max(0, Math.round((x / pxPerTick) / (TICKS_PER_QUARTER / 4)) * (TICKS_PER_QUARTER / 4));
    const row = Math.floor(y / rowH);
    const midi = Math.max(0, Math.min(127, pitchRange.max - row));
    return { tick, midi };
  }

  // --- Event handlers ---
  function handleMouseMove(e: MouseEvent) {
    if (dragMode !== 'none') {
      handleDrag(e);
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    hoveredIndex = hit ? hit.index : -1;

    // Cursor
    if (canvasEl) {
      if (hit?.isResize) canvasEl.style.cursor = 'ew-resize';
      else if (hit) canvasEl.style.cursor = 'grab';
      else canvasEl.style.cursor = 'crosshair';
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      selectedIndex = -1;
      return;
    }

    selectedIndex = hit.index;
    const n = notes[hit.index];

    // Calculate start tick of this note
    let tickOffset = 0;
    for (let i = 0; i < hit.index; i++) tickOffset += notes[i].durationTicks;

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigTick = tickOffset;
    dragOrigMidi = n.midi;
    dragOrigDuration = n.durationTicks;
    dragMode = hit.isResize ? 'resize' : 'move';

    e.preventDefault();
  }

  function handleDrag(e: MouseEvent) {
    const canvas = canvasEl!;
    const rect = canvas.getBoundingClientRect();
    const drawW = rect.width - PITCH_LABEL_WIDTH;
    const pitchCount = pitchRange.max - pitchRange.min + 1;
    const rowH = rect.height / pitchCount;
    const pxPerTick = drawW / totalTicks;
    const quantize = TICKS_PER_QUARTER / 4; // 16th note grid

    if (dragMode === 'move') {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const deltaTick = Math.round((dx / pxPerTick) / quantize) * quantize;
      const deltaRows = Math.round(dy / rowH);
      const newMidi = Math.max(0, Math.min(127, dragOrigMidi - deltaRows));

      const updated = [...notes];
      updated[selectedIndex] = { ...updated[selectedIndex], midi: newMidi };
      notes = updated;
    } else if (dragMode === 'resize') {
      const dx = e.clientX - dragStartX;
      const deltaTick = Math.round((dx / pxPerTick) / quantize) * quantize;
      const newDuration = Math.max(MIN_DURATION, dragOrigDuration + deltaTick);

      const updated = [...notes];
      updated[selectedIndex] = { ...updated[selectedIndex], durationTicks: newDuration };
      notes = updated;
    }
  }

  function handleMouseUp(_e: MouseEvent) {
    if (dragMode !== 'none') {
      dragMode = 'none';
      emitChange();
    }
  }

  function handleDblClick(e: MouseEvent) {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) return; // double-clicked on existing note

    const { tick, midi } = clientToTickAndMidi(e.clientX, e.clientY);

    // Insert note at the right position
    const newNote: MelodyNote = { midi, durationTicks: DEFAULT_DURATION, isRest: false };

    // Find insertion point based on tick
    let tickOffset = 0;
    let insertIdx = notes.length;
    for (let i = 0; i < notes.length; i++) {
      if (tickOffset >= tick) {
        insertIdx = i;
        break;
      }
      tickOffset += notes[i].durationTicks;
    }

    const updated = [...notes];
    updated.splice(insertIdx, 0, newNote);
    notes = updated;
    selectedIndex = insertIdx;
    emitChange();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      deleteNote(hit.index);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIndex >= 0 && selectedIndex < notes.length) {
        deleteNote(selectedIndex);
      }
    }
  }

  function deleteNote(index: number) {
    const updated = [...notes];
    updated.splice(index, 1);
    notes = updated;
    selectedIndex = -1;
    hoveredIndex = -1;
    emitChange();
  }

  // --- Emit ---
  function emitChange() {
    const text = melodyToText(notes);
    onMelodyChange(text);
  }

  // --- Helpers ---
  function midiToLabel(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const note = NOTE_NAMES[midi % 12];
    return `${note.toUpperCase()}${octave}`;
  }

  function midiToNotation(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = midi % 12;
    const name = NOTE_NAMES[semitone];
    // Base octave for notation is 3 (undecorated)
    const octaveMarks = octave > 3 ? "'".repeat(octave - 3) : ','.repeat(3 - octave);
    // Handle sharps: c# → c#, but accidental is part of the name
    return name + octaveMarks;
  }

  function durationSuffix(ticks: number): string {
    // Check dotted values first
    if (ticks === Math.round(TICKS_PER_QUARTER * 4 * 1.5)) return '1.';
    if (ticks === Math.round(TICKS_PER_QUARTER * 2 * 1.5)) return '2.';
    if (ticks === Math.round(TICKS_PER_QUARTER * 1.5)) return '.';       // dotted quarter (4.)
    if (ticks === Math.round(TICKS_PER_QUARTER / 2 * 1.5)) return '8.';
    if (ticks === Math.round(TICKS_PER_QUARTER / 4 * 1.5)) return '16.';

    if (ticks === TICKS_PER_QUARTER * 4) return '1';
    if (ticks === TICKS_PER_QUARTER * 2) return '2';
    if (ticks === TICKS_PER_QUARTER) return '';       // default quarter
    if (ticks === TICKS_PER_QUARTER / 2) return '8';
    if (ticks === TICKS_PER_QUARTER / 4) return '16';
    // Fallback: find closest
    return '';
  }

  function melodyToText(noteList: MelodyNote[]): string {
    return noteList.map(n => {
      if (n.isRest) {
        const suffix = durationSuffix(n.durationTicks);
        return 'r' + suffix;
      }
      return midiToNotation(n.midi) + durationSuffix(n.durationTicks);
    }).join(' ');
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="mini-piano-roll" tabindex="0" onkeydown={handleKeydown}>
  <canvas
    bind:this={canvasEl}
    onmousemove={handleMouseMove}
    onmousedown={handleMouseDown}
    onmouseup={handleMouseUp}
    onmouseleave={() => { hoveredIndex = -1; if (dragMode !== 'none') { dragMode = 'none'; emitChange(); } }}
    ondblclick={handleDblClick}
    oncontextmenu={handleContextMenu}
  ></canvas>
</div>

<style>
  .mini-piano-roll {
    width: 100%;
    height: 140px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    overflow: hidden;
    outline: none;
  }

  .mini-piano-roll:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
