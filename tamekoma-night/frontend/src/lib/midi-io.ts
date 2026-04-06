// midi-io.ts
// MIDI file I/O: conversion between PianoRollBar[] and @tonejs/midi

import { Midi } from '@tonejs/midi';
import type { PianoRollBar, PianoRollNote, PianoRollBarEntry } from './piano-roll-model';
import { recognizeChord } from './chord-recognizer';

const TICKS_PER_QUARTER = 480;

// ~1/32 note at 480 TPQ – notes within this window are grouped into one entry
const PROXIMITY_TICKS = 60;

// ── Pure helpers ──────────────────────────────────────

/** Flatten all notes from all bars/entries into a list of MIDI track-note descriptors. */
function collectNotesFromBars(
  bars: ReadonlyArray<PianoRollBar>,
): { midi: number; ticks: number; durationTicks: number; velocity: number }[] {
  return bars.flatMap(bar =>
    bar.entries.flatMap(entry =>
      entry.notes.map(note => ({
        midi: note.midi,
        ticks: note.startTick,
        durationTicks: note.durationTicks,
        velocity: note.velocity / 127,
      })),
    ),
  );
}

interface RawNote {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
}

/** Extract and normalize all notes from a Midi object. */
function extractMidiNotes(midi: Midi): RawNote[] {
  const sourcePPQ = midi.header.ppq;
  const scale = sourcePPQ !== TICKS_PER_QUARTER ? TICKS_PER_QUARTER / sourcePPQ : 1;

  const notes: RawNote[] = midi.tracks.flatMap(track =>
    track.notes.map(note => ({
      midi: note.midi,
      ticks: Math.round(note.ticks * scale),
      durationTicks: Math.round(note.durationTicks * scale),
      velocity: Math.round(note.velocity * 127),
    })),
  );

  return notes.sort((a, b) => a.ticks - b.ticks);
}

/** Resolve time signature from Midi header or fallback. */
function resolveTimeSignature(
  midi: Midi,
  override?: { beats: number; beatValue: number },
): { beats: number; beatValue: number } {
  if (override) return override;
  const ts = midi.header.timeSignatures[0];
  return {
    beats: ts ? ts.timeSignature[0] : 4,
    beatValue: ts ? ts.timeSignature[1] : 4,
  };
}

/** Group sorted notes into bar buckets. */
function groupNotesByBar(notes: ReadonlyArray<RawNote>, ticksPerBar: number, barCount: number): RawNote[][] {
  const buckets: RawNote[][] = Array.from({ length: barCount }, () => []);
  for (const note of notes) {
    const barIdx = Math.min(Math.floor(note.ticks / ticksPerBar), barCount - 1);
    buckets[barIdx].push(note);
  }
  return buckets;
}

/** Group notes within a bar by start-tick proximity into chord groups. */
function groupByProximity(notes: ReadonlyArray<RawNote>): RawNote[][] {
  const groups: RawNote[][] = [];
  let current: RawNote[] = [];
  let groupStart = -Infinity;

  for (const note of notes) {
    if (note.ticks - groupStart > PROXIMITY_TICKS || current.length === 0) {
      if (current.length > 0) groups.push(current);
      current = [note];
      groupStart = note.ticks;
    } else {
      current.push(note);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Convert a group of raw notes into a PianoRollBarEntry (pure). */
function noteGroupToEntry(
  group: ReadonlyArray<RawNote>,
  barIdx: number,
  entryIdx: number,
  idOffset: number,
): PianoRollBarEntry {
  const entryStartTick = Math.min(...group.map(n => n.ticks));
  const entryEndTick = Math.max(...group.map(n => n.ticks + n.durationTicks));

  const notes: PianoRollNote[] = group.map((n, i) => ({
    id: `midi_import_${idOffset + i + 1}_${Date.now()}`,
    midi: n.midi,
    startTick: n.ticks,
    durationTicks: n.durationTicks,
    velocity: n.velocity,
    barIndex: barIdx,
    entryIndex: entryIdx,
    isChordTone: true,
  }));

  const recognized = recognizeChord(notes.map(n => n.midi));

  return {
    entryIndex: entryIdx,
    startTick: entryStartTick,
    durationTicks: entryEndTick - entryStartTick,
    originalChordName: recognized?.name ?? null,
    recognizedChordName: recognized?.name ?? null,
    notes,
    isCustomVoicing: recognized === null,
  };
}

/** Create an empty entry for bars with no notes. */
function emptyEntry(startTick: number, durationTicks: number): PianoRollBarEntry {
  return {
    entryIndex: 0,
    startTick,
    durationTicks,
    originalChordName: null,
    recognizedChordName: null,
    notes: [],
    isCustomVoicing: false,
  };
}

/** Convert a bar's notes into a PianoRollBar (pure except for id generation timestamps). */
function barNotesToPianoRollBar(
  barNotes: ReadonlyArray<RawNote>,
  barIdx: number,
  ticksPerBar: number,
  idOffset: number,
): { bar: PianoRollBar; noteCount: number } {
  const groups = groupByProximity(barNotes);
  let offset = idOffset;

  const entries: PianoRollBarEntry[] = groups.map((group, entryIdx) => {
    const entry = noteGroupToEntry(group, barIdx, entryIdx, offset);
    offset += group.length;
    return entry;
  });

  if (entries.length === 0) {
    const barStartTick = barIdx * ticksPerBar;
    entries.push(emptyEntry(barStartTick, ticksPerBar));
  }

  return {
    bar: { barIndex: barIdx, entries },
    noteCount: offset - idOffset,
  };
}

// ── PianoRollBar[] → Midi ─────────────────────────────

export function pianoRollBarsToMidi(
  bars: PianoRollBar[],
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
): Midi {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [timeSignature.beats, timeSignature.beatValue],
  });

  const track = midi.addTrack();
  track.name = 'Chords';

  for (const desc of collectNotesFromBars(bars)) {
    track.addNote(desc);
  }

  return midi;
}

// ── Midi → PianoRollBar[] ─────────────────────────────

export function midiToPianoRollBars(
  midi: Midi,
  timeSignature?: { beats: number; beatValue: number },
): { bars: PianoRollBar[]; bpm: number; timeSignature: { beats: number; beatValue: number } } {
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const resolvedTS = resolveTimeSignature(midi, timeSignature);
  const allNotes = extractMidiNotes(midi);
  const ticksPerBar = TICKS_PER_QUARTER * resolvedTS.beats;

  if (allNotes.length === 0) {
    return { bars: [], bpm, timeSignature: resolvedTS };
  }

  const maxTick = Math.max(...allNotes.map(n => n.ticks + n.durationTicks));
  const barCount = Math.ceil(maxTick / ticksPerBar) || 1;
  const notesByBar = groupNotesByBar(allNotes, ticksPerBar, barCount);

  let idOffset = 0;
  const bars: PianoRollBar[] = notesByBar.map((barNotes, barIdx) => {
    const { bar, noteCount } = barNotesToPianoRollBar(barNotes, barIdx, ticksPerBar, idOffset);
    idOffset += noteCount;
    return bar;
  });

  return { bars, bpm, timeSignature: resolvedTS };
}

// ── Base64 conversion ─────────────────────────────────

export function midiToBase64(midi: Midi): string {
  const bytes = midi.toArray();
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToMidi(base64: string): Midi {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Midi(bytes);
}

// ── Shortcut functions ────────────────────────────────

export function pianoRollBarsToBase64(
  bars: PianoRollBar[],
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
): string {
  return midiToBase64(pianoRollBarsToMidi(bars, bpm, timeSignature));
}

export function base64ToPianoRollBars(
  base64: string,
  timeSignature?: { beats: number; beatValue: number },
): { bars: PianoRollBar[]; bpm: number; timeSignature: { beats: number; beatValue: number } } {
  return midiToPianoRollBars(base64ToMidi(base64), timeSignature);
}

// ── File I/O ──────────────────────────────────────────

export function downloadMidiFile(midi: Midi, filename: string): void {
  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.mid') ? filename : `${filename}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importMidiFile(
  file: File,
): Promise<{ bars: PianoRollBar[]; bpm: number; timeSignature: { beats: number; beatValue: number } }> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  return midiToPianoRollBars(midi);
}

// ── Multi-track Song export ──────────────────────────

/** Minimal note descriptor for multi-track export (no channel — assigned at track level). */
export interface SongMidiNote {
  midi: number;           // 0-127
  startTick: number;      // absolute tick (480 TPQ)
  durationTicks: number;
  velocity: number;       // 0-127
}

/** Track descriptor for songToMidi. */
export interface SongTrack {
  name: string;
  instrument: string;
  notes: SongMidiNote[];
}

/** Assign MIDI channels: drums → 9, others → 0-8 then 10-15. */
function assignChannels(tracks: ReadonlyArray<{ instrument: string }>): number[] {
  let nextChannel = 0;
  return tracks.map(t => {
    if (t.instrument === 'drums') return 9;
    const ch = nextChannel;
    nextChannel++;
    if (nextChannel === 9) nextChannel = 10; // skip drum channel
    return ch;
  });
}

/**
 * Export a multi-track Song to a MIDI file.
 * Each track becomes a separate MIDI track with its own name and channel.
 * Drums are assigned to channel 10 (0-indexed: 9).
 */
export function songToMidi(
  tracks: SongTrack[],
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
): Midi {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [timeSignature.beats, timeSignature.beatValue],
  });

  const channels = assignChannels(tracks);

  tracks.forEach((t, i) => {
    const track = midi.addTrack();
    track.name = t.name;
    track.channel = channels[i];

    for (const note of t.notes) {
      track.addNote({
        midi: note.midi,
        ticks: note.startTick,
        durationTicks: note.durationTicks,
        velocity: note.velocity / 127,
      });
    }
  });

  return midi;
}

/**
 * Convert multi-track Song to base64 MIDI string.
 */
export function songToBase64(
  tracks: SongTrack[],
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
): string {
  return midiToBase64(songToMidi(tracks, bpm, timeSignature));
}

/**
 * Download multi-track MIDI file.
 */
export function downloadSongMidi(
  tracks: SongTrack[],
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
  filename: string,
): void {
  downloadMidiFile(songToMidi(tracks, bpm, timeSignature), filename);
}
