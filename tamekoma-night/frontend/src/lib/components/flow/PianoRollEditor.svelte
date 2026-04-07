<script lang="ts">
  import type { MidiNote } from '$lib/types/song';
  import { playChordPreview } from '$lib/chord-player';
  import { parseProgression, resolveRepeats } from '$lib/chord-parser';

  interface Props {
    notes: MidiNote[];
    totalBars: number;
    bpm: number;
    timeSignature: string;
    chordProgression?: string;
    musicalKey?: string;
    onNotesChange?: (notes: MidiNote[]) => void;
    onClose: () => void;
    onSeekToBar?: (barIndex: number) => void;
    currentTime?: number;
    totalDuration?: number;
  }

  let { notes, totalBars, bpm, timeSignature, chordProgression, musicalKey, onNotesChange, onClose, onSeekToBar, currentTime, totalDuration }: Props = $props();

  // --- Constants ---
  const TICKS_PER_QUARTER = 480;
  const SNAP_TICKS = TICKS_PER_QUARTER / 4; // 16th note = 120 ticks
  const DEFAULT_DURATION = TICKS_PER_QUARTER; // quarter note
  const DEFAULT_VELOCITY = 100;
  const DEFAULT_CHANNEL = 0;
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const PITCH_LABEL_WIDTH = 40;
  const HEADER_HEIGHT = 20; // beat numbers at top
  const RESIZE_HANDLE_WIDTH = 8;
  const MIN_DURATION = SNAP_TICKS; // 16th note minimum
  const NOTE_COLOR = '#e8a84c';
  const NOTE_HOVER = '#fbbf24';
  const NOTE_SELECTED = '#d97706';
  const GRID_COLOR = 'rgba(138, 126, 104, 0.15)';
  const GRID_BAR_COLOR = 'rgba(138, 126, 104, 0.4)';
  const GRID_BEAT_COLOR = 'rgba(138, 126, 104, 0.25)';
  const BG_COLOR = '#1a1408';
  const BLACK_KEY_BG = 'rgba(0, 0, 0, 0.15)';
  const ROW_HEIGHT = 12; // pixels per semitone
  const MIN_PIXELS_PER_TICK = 0.02;
  const MAX_PIXELS_PER_TICK = 0.8;

  // --- Parse time signature ---
  let beats = $derived(parseInt(timeSignature.split('/')[0]) || 4);
  let beatValue = $derived(parseInt(timeSignature.split('/')[1]) || 4);
  let ticksPerBeat = $derived(TICKS_PER_QUARTER * (4 / beatValue));
  let ticksPerBar = $derived(ticksPerBeat * beats);
  let totalTicks = $derived(totalBars * ticksPerBar);

  // --- State ---
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let minimapCanvas = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let hoveredIndex = $state(-1);
  let selectedIndex = $state(-1);
  let dragMode = $state<'none' | 'move' | 'resize'>('none');
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragOrigStartTick = $state(0);
  let dragOrigMidi = $state(0);
  let dragOrigDuration = $state(0);

  // Scroll & zoom
  let scrollX = $state(0); // ticks offset
  let scrollY = $state(0); // pitch offset (semitones from top)
  let pixelsPerTick = $state(0.12);
  let initialScrollDone = false;

  // Visible pitch range: show 88 keys (A0=21 to C8=108)
  const PITCH_MIN = 21;
  const PITCH_MAX = 108;
  const PITCH_COUNT = PITCH_MAX - PITCH_MIN + 1;

  // --- Helpers ---
  function midiToLabel(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const note = NOTE_NAMES[midi % 12];
    return `${note}${octave}`;
  }

  function isBlackKey(midi: number): boolean {
    const n = midi % 12;
    return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
  }

  function snapTick(tick: number): number {
    return Math.round(tick / SNAP_TICKS) * SNAP_TICKS;
  }

  function noteAtIndex(idx: number): MidiNote {
    return notes[idx];
  }

  // --- Layout helpers ---
  function getCanvasRect(): DOMRect | null {
    return canvasEl?.getBoundingClientRect() ?? null;
  }

  function drawWidth(rect: DOMRect): number {
    return rect.width - PITCH_LABEL_WIDTH;
  }

  function tickToX(tick: number): number {
    return PITCH_LABEL_WIDTH + (tick - scrollX) * pixelsPerTick;
  }

  function midiToY(midi: number): number {
    return HEADER_HEIGHT + (PITCH_MAX - midi - scrollY) * ROW_HEIGHT;
  }

  function xToTick(x: number): number {
    return (x - PITCH_LABEL_WIDTH) / pixelsPerTick + scrollX;
  }

  function yToMidi(y: number): number {
    return PITCH_MAX - Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT) - scrollY;
  }

  // --- Draw ---
  $effect(() => {
    const _notes = notes;
    const _hovered = hoveredIndex;
    const _selected = selectedIndex;
    const _scrollX = scrollX;
    const _scrollY = scrollY;
    const _ppt = pixelsPerTick;
    const _totalTicks = totalTicks;
    const _ticksPerBar = ticksPerBar;
    const _ticksPerBeat = ticksPerBeat;
    const _currentTime = currentTime;
    const _totalDuration = totalDuration;
    const canvas = canvasEl;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Center scroll on notes on first render
    if (!initialScrollDone && _notes.length > 0 && h > 0) {
      initialScrollDone = true;
      let minMidi = 127;
      let maxMidi = 0;
      for (const n of _notes) {
        if (n.midi < minMidi) minMidi = n.midi;
        if (n.midi > maxMidi) maxMidi = n.midi;
      }
      const centerMidi = (minMidi + maxMidi) / 2;
      const canvasRows = (h - HEADER_HEIGHT) / ROW_HEIGHT;
      // scrollY is in semitones from top (PITCH_MAX)
      scrollY = Math.max(0, Math.min(PITCH_COUNT - 20, (PITCH_MAX - centerMidi) - canvasRows / 2));
    }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const dw = drawWidth(rect);

    // --- Black key row backgrounds ---
    for (let midi = PITCH_MAX; midi >= PITCH_MIN; midi--) {
      if (isBlackKey(midi)) {
        const y = midiToY(midi);
        if (y + ROW_HEIGHT < 0 || y > h) continue;
        ctx.fillStyle = BLACK_KEY_BG;
        ctx.fillRect(PITCH_LABEL_WIDTH, y, dw, ROW_HEIGHT);
      }
    }

    // --- Horizontal pitch grid lines ---
    ctx.lineWidth = 1;
    for (let midi = PITCH_MAX; midi >= PITCH_MIN; midi--) {
      const y = midiToY(midi);
      if (y < HEADER_HEIGHT || y > h) continue;
      // Highlight C notes
      const isC = midi % 12 === 0;
      ctx.strokeStyle = isC ? GRID_BEAT_COLOR : GRID_COLOR;
      ctx.beginPath();
      ctx.moveTo(PITCH_LABEL_WIDTH, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // --- Vertical time grid lines ---
    // 16th note sub-grid
    const firstVisibleTick = Math.max(0, Math.floor(_scrollX / SNAP_TICKS) * SNAP_TICKS);
    const lastVisibleTick = Math.min(_totalTicks, _scrollX + dw / _ppt);

    for (let tick = firstVisibleTick; tick <= lastVisibleTick; tick += SNAP_TICKS) {
      const x = tickToX(tick);
      if (x < PITCH_LABEL_WIDTH || x > w) continue;

      const isBar = tick % _ticksPerBar === 0;
      const isBeat = tick % _ticksPerBeat === 0;

      if (isBar) {
        ctx.strokeStyle = GRID_BAR_COLOR;
        ctx.lineWidth = 1.5;
      } else if (isBeat) {
        ctx.strokeStyle = GRID_BEAT_COLOR;
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // --- Header: bar/beat numbers ---
    ctx.fillStyle = 'rgba(20, 16, 8, 0.9)';
    ctx.fillRect(0, 0, w, HEADER_HEIGHT);
    ctx.fillStyle = 'rgba(236, 228, 212, 0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let tick = firstVisibleTick; tick <= lastVisibleTick; tick += _ticksPerBeat) {
      const x = tickToX(tick);
      if (x < PITCH_LABEL_WIDTH || x > w) continue;
      const bar = Math.floor(tick / _ticksPerBar) + 1;
      const beat = Math.floor((tick % _ticksPerBar) / _ticksPerBeat) + 1;
      if (beat === 1) {
        ctx.fillStyle = 'rgba(236, 228, 212, 0.7)';
        ctx.fillText(`${bar}`, x + 3, HEADER_HEIGHT / 2);
      } else {
        ctx.fillStyle = 'rgba(236, 228, 212, 0.35)';
        ctx.fillText(`${bar}.${beat}`, x + 2, HEADER_HEIGHT / 2);
      }
    }

    // --- Pitch labels (left gutter) ---
    ctx.fillStyle = 'rgba(20, 16, 8, 0.95)';
    ctx.fillRect(0, HEADER_HEIGHT, PITCH_LABEL_WIDTH, h - HEADER_HEIGHT);

    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let midi = PITCH_MAX; midi >= PITCH_MIN; midi--) {
      const y = midiToY(midi);
      if (y + ROW_HEIGHT < HEADER_HEIGHT || y > h) continue;
      // Only label C notes and selected octave notes for readability
      const isC = midi % 12 === 0;
      if (isC) {
        ctx.fillStyle = 'rgba(236, 228, 212, 0.6)';
        ctx.fillText(midiToLabel(midi), PITCH_LABEL_WIDTH - 3, y + ROW_HEIGHT / 2);
      }
    }

    // --- Draw notes ---
    for (let i = 0; i < _notes.length; i++) {
      const n = _notes[i];
      const x = tickToX(n.startTick);
      const noteW = n.durationTicks * _ppt;
      const y = midiToY(n.midi);

      // Cull off-screen notes
      if (x + noteW < PITCH_LABEL_WIDTH || x > w) continue;
      if (y + ROW_HEIGHT < HEADER_HEIGHT || y > h) continue;

      // Velocity-based opacity (0.4 to 1.0)
      const velOpacity = 0.4 + (n.velocity / 127) * 0.6;

      let color = NOTE_COLOR;
      if (i === _selected) color = NOTE_SELECTED;
      else if (i === _hovered) color = NOTE_HOVER;

      ctx.globalAlpha = velOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y + 1, Math.max(noteW - 1, 3), ROW_HEIGHT - 2, 2);
      ctx.fill();

      // Resize handle indicator
      if (i === _hovered || i === _selected) {
        ctx.fillStyle = 'rgba(236, 228, 212, 0.3)';
        ctx.fillRect(x + noteW - RESIZE_HANDLE_WIDTH, y + 1, RESIZE_HANDLE_WIDTH - 1, ROW_HEIGHT - 2);
      }

      ctx.globalAlpha = 1.0;
    }

    // --- Playhead cursor ---
    if (currentTime != null && totalDuration && totalDuration > 0) {
      const progress = currentTime / totalDuration;
      const playheadTick = progress * _totalTicks;
      const playheadX = tickToX(playheadTick);
      ctx.strokeStyle = 'rgba(232, 168, 76, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }

    // --- Pitch label gutter border ---
    ctx.strokeStyle = 'rgba(138, 126, 104, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PITCH_LABEL_WIDTH, 0);
    ctx.lineTo(PITCH_LABEL_WIDTH, h);
    ctx.stroke();

    // Also draw minimap whenever main canvas redraws
    drawMinimap(_notes, _totalTicks, _scrollX, _ppt, dw);
  });

  // --- Minimap ---
  function drawMinimap(
    _notes: MidiNote[],
    _totalTicks: number,
    _scrollX: number,
    _ppt: number,
    mainDrawWidth: number
  ) {
    const mc = minimapCanvas;
    if (!mc) return;
    const rect = mc.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    mc.width = w * dpr;
    mc.height = h * dpr;
    const ctx = mc.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (_totalTicks === 0) return;

    // Draw all notes as tiny rectangles
    if (_notes.length > 0) {
      let minMidi = 127;
      let maxMidi = 0;
      for (const n of _notes) {
        if (n.midi < minMidi) minMidi = n.midi;
        if (n.midi > maxMidi) maxMidi = n.midi;
      }
      const range = Math.max(maxMidi - minMidi + 1, 12);
      const padding = 2; // vertical padding

      ctx.fillStyle = 'rgba(232, 168, 76, 0.6)';
      for (const n of _notes) {
        const x = (n.startTick / _totalTicks) * w;
        const nw = Math.max(1, (n.durationTicks / _totalTicks) * w);
        const y = padding + (h - 2 * padding) * (1 - (n.midi - minMidi + 1) / range);
        const nh = Math.max(1, (h - 2 * padding) / range);
        ctx.fillRect(x, y, nw, nh);
      }
    }

    // Draw viewport indicator
    const viewStartFraction = _scrollX / _totalTicks;
    const visibleTicks = mainDrawWidth / _ppt;
    const viewWidthFraction = visibleTicks / _totalTicks;

    const vx = Math.max(0, viewStartFraction * w);
    const vw = Math.min(w - vx, viewWidthFraction * w);

    ctx.fillStyle = 'rgba(236, 228, 212, 0.08)';
    ctx.fillRect(vx, 0, vw, h);

    ctx.strokeStyle = 'rgba(236, 228, 212, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx + 0.5, 0.5, Math.max(vw - 1, 2), h - 1);
  }

  function handleMinimapClick(e: MouseEvent) {
    const mc = minimapCanvas;
    if (!mc) return;
    const rect = mc.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;
    const targetTick = progress * totalTicks;

    // Center the viewport on the clicked position
    const canvasRect = getCanvasRect();
    if (!canvasRect) return;
    const dw = drawWidth(canvasRect);
    const visibleTicks = dw / pixelsPerTick;
    scrollX = Math.max(0, Math.min(totalTicks - visibleTicks, targetTick - visibleTicks / 2));
  }

  // --- Hit testing ---
  function hitTest(clientX: number, clientY: number): { index: number; isResize: boolean } | null {
    const rect = getCanvasRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < PITCH_LABEL_WIDTH || y < HEADER_HEIGHT) return null;

    // Iterate in reverse so topmost (last drawn) note wins
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const nx = tickToX(n.startTick);
      const nw = n.durationTicks * pixelsPerTick;
      const ny = midiToY(n.midi);

      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + ROW_HEIGHT) {
        const isResize = x >= nx + nw - RESIZE_HANDLE_WIDTH;
        return { index: i, isResize };
      }
    }
    return null;
  }

  function clientToTickAndMidi(clientX: number, clientY: number): { tick: number; midi: number } {
    const rect = getCanvasRect()!;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tick = snapTick(Math.max(0, xToTick(x)));
    const midi = Math.max(PITCH_MIN, Math.min(PITCH_MAX, yToMidi(y)));
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

    if (canvasEl) {
      if (hit?.isResize) canvasEl.style.cursor = 'ew-resize';
      else if (hit) canvasEl.style.cursor = 'grab';
      else canvasEl.style.cursor = 'crosshair';
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;

    // Click on header/ruler area -> seek to bar
    const rect = getCanvasRect();
    if (rect && onSeekToBar) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < HEADER_HEIGHT && x >= PITCH_LABEL_WIDTH) {
        const tick = xToTick(x);
        const barIndex = Math.floor(tick / ticksPerBar);
        if (barIndex >= 0 && barIndex < totalBars) {
          onSeekToBar(barIndex);
        }
        return; // Don't start note editing
      }
    }

    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      selectedIndex = -1;
      return;
    }

    selectedIndex = hit.index;
    const n = noteAtIndex(hit.index);

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigStartTick = n.startTick;
    dragOrigMidi = n.midi;
    dragOrigDuration = n.durationTicks;
    dragMode = hit.isResize ? 'resize' : 'move';

    if (canvasEl && dragMode === 'move') {
      canvasEl.style.cursor = 'grabbing';
    }

    e.preventDefault();
  }

  function handleDrag(e: MouseEvent) {
    const rect = getCanvasRect();
    if (!rect) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const deltaTick = snapTick(dx / pixelsPerTick);
    const deltaRows = Math.round(dy / ROW_HEIGHT);

    if (dragMode === 'move') {
      const newStartTick = Math.max(0, snapTick(dragOrigStartTick + deltaTick));
      const newMidi = Math.max(PITCH_MIN, Math.min(PITCH_MAX, dragOrigMidi - deltaRows));

      const updated = [...notes];
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        startTick: newStartTick,
        midi: newMidi,
      };
      onNotesChange?.(updated);
    } else if (dragMode === 'resize') {
      const newDuration = Math.max(MIN_DURATION, snapTick(dragOrigDuration + deltaTick));

      const updated = [...notes];
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        durationTicks: newDuration,
      };
      onNotesChange?.(updated);
    }
  }

  function handleMouseUp(_e: MouseEvent) {
    if (dragMode !== 'none') {
      dragMode = 'none';
      if (canvasEl) canvasEl.style.cursor = 'crosshair';
    }
  }

  function handleDblClick(e: MouseEvent) {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) return; // double-clicked on existing note

    const { tick, midi } = clientToTickAndMidi(e.clientX, e.clientY);

    const newNote: MidiNote = {
      midi,
      startTick: tick,
      durationTicks: DEFAULT_DURATION,
      velocity: DEFAULT_VELOCITY,
      channel: DEFAULT_CHANNEL,
    };

    const updated = [...notes, newNote].sort((a, b) => a.startTick - b.startTick);
    const newIndex = updated.findIndex(
      (n) => n.startTick === tick && n.midi === midi && n.durationTicks === DEFAULT_DURATION
    );
    selectedIndex = newIndex >= 0 ? newIndex : updated.length - 1;
    onNotesChange?.(updated);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      deleteNote(hit.index);
    } else {
      // Right-click on empty space: play chord at this bar + seek
      const rect = getCanvasRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const tick = Math.max(0, xToTick(x));
      const barIndex = Math.floor(tick / ticksPerBar);

      // Seek to the clicked position (fractional bar)
      if (onSeekToBar) {
        const barPosition = tick / ticksPerBar;
        onSeekToBar(barPosition);
      }

      // Play chord preview if chord progression is available
      if (chordProgression) {
        try {
          const parsed = parseProgression(chordProgression);
          const resolved = resolveRepeats(parsed.bars);
          if (barIndex >= 0 && barIndex < resolved.length) {
            for (const entry of resolved[barIndex].entries) {
              if (entry.type === 'chord') {
                playChordPreview(entry.chord.raw).catch(() => {});
                break;
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIndex >= 0 && selectedIndex < notes.length) {
        e.preventDefault();
        deleteNote(selectedIndex);
      }
    }
  }

  function deleteNote(index: number) {
    const updated = [...notes];
    updated.splice(index, 1);
    selectedIndex = -1;
    hoveredIndex = -1;
    onNotesChange?.(updated);
  }

  // --- Scroll / Zoom ---
  function handleWheel(e: WheelEvent) {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom horizontal
      const rect = getCanvasRect()!;
      const mouseX = e.clientX - rect.left;
      const tickAtMouse = xToTick(mouseX);

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newPpt = Math.max(MIN_PIXELS_PER_TICK, Math.min(MAX_PIXELS_PER_TICK, pixelsPerTick * zoomFactor));
      pixelsPerTick = newPpt;

      // Keep tick under mouse stable
      scrollX = tickAtMouse - (mouseX - PITCH_LABEL_WIDTH) / newPpt;
      scrollX = Math.max(0, scrollX);
    } else if (e.shiftKey) {
      // Horizontal scroll
      const tickDelta = (e.deltaY / pixelsPerTick) * 2;
      scrollX = Math.max(0, Math.min(totalTicks - 100, scrollX + tickDelta));
    } else {
      // Vertical scroll (pitch)
      const rowDelta = Math.round(e.deltaY / ROW_HEIGHT);
      scrollY = Math.max(0, Math.min(PITCH_COUNT - 20, scrollY + rowDelta));
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="piano-roll-overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="piano-roll-dialog" tabindex="0" onkeydown={handleKeydown}>
    <div class="piano-roll-header">
      <span class="title">Piano Roll Editor</span>
      <span class="info">{totalBars} bars | {bpm} BPM | {timeSignature} | {notes.length} notes</span>
      <div class="controls">
        <span class="hint">Scroll: pitch | Shift+Scroll: time | Cmd+Scroll: zoom</span>
        <button class="close-btn" onclick={onClose}>&#215;</button>
      </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="piano-roll-minimap" onclick={handleMinimapClick}>
      <canvas class="minimap-canvas" bind:this={minimapCanvas}></canvas>
    </div>
    <div class="piano-roll-body" bind:this={containerEl}>
      <canvas
        bind:this={canvasEl}
        onmousemove={handleMouseMove}
        onmousedown={handleMouseDown}
        onmouseup={handleMouseUp}
        onmouseleave={() => { hoveredIndex = -1; if (dragMode !== 'none') { dragMode = 'none'; } }}
        ondblclick={handleDblClick}
        oncontextmenu={handleContextMenu}
        onwheel={handleWheel}
      ></canvas>
    </div>
  </div>
</div>

<style>
  .piano-roll-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 100);
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .piano-roll-dialog {
    background: var(--bg-surface, #1a1408);
    border: 1px solid var(--border-default, rgba(138, 126, 104, 0.3));
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    width: 90vw;
    max-width: 1200px;
    height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
  }

  .piano-roll-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 12px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(138, 126, 104, 0.2);
    flex-shrink: 0;
    min-height: 28px;
  }

  .title {
    font-weight: 600;
    font-size: 12px;
    color: var(--text-primary, #ece4d4);
  }

  .info {
    font-size: 11px;
    color: var(--text-secondary, rgba(236, 228, 212, 0.5));
  }

  .controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hint {
    font-size: 10px;
    color: var(--text-secondary, rgba(236, 228, 212, 0.35));
  }

  .close-btn {
    background: none;
    border: 1px solid rgba(138, 126, 104, 0.3);
    border-radius: 4px;
    color: var(--text-primary, #ece4d4);
    font-size: 16px;
    line-height: 1;
    padding: 2px 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .close-btn:hover {
    background: rgba(232, 168, 76, 0.15);
  }

  .piano-roll-minimap {
    height: 24px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid var(--border-subtle, rgba(138, 126, 104, 0.15));
    flex-shrink: 0;
    cursor: pointer;
  }

  .minimap-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .piano-roll-body {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
