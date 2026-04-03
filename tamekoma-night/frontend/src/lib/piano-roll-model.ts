// piano-roll-model.ts
// Data model and conversion functions for the piano roll editor

import type { ParsedBar, BarEntry, ParsedChord } from './chord-parser';
import { parseProgression, resolveRepeats, serialize, parseChord } from './chord-parser';
import { chordToNotes, rootToMidi, midiToNoteName, QUALITY_INTERVALS } from './chord-player';
import { recognizeChord } from './chord-recognizer';

// ── Types ──────────────────────────────────────────────

export interface PianoRollNote {
  id: string;
  midi: number;           // 0-127
  startTick: number;      // 480 ticks/quarter note
  durationTicks: number;
  velocity: number;       // 0-127
  barIndex: number;
  entryIndex: number;     // bar内のentry位置
  isChordTone: boolean;   // 元のコード構成音か
}

export interface PianoRollBarEntry {
  entryIndex: number;
  startTick: number;
  durationTicks: number;
  originalChordName: string | null;
  recognizedChordName: string | null;
  notes: PianoRollNote[];
  isCustomVoicing: boolean;  // true when notes don't match any recognized chord
}

export interface PianoRollBar {
  barIndex: number;
  entries: PianoRollBarEntry[];
}

export interface PianoRollState {
  bars: PianoRollBar[];
  ticksPerQuarterNote: number;  // 480
  timeSignature: { beats: number; beatValue: number };
  bpm: number;
  selectedNoteIds: Set<string>;
  tool: 'select' | 'draw' | 'erase';
  snapDivision: number;  // 1=bar, 2=half, 4=quarter, 8=8th, 16=16th
  undoStack: PianoRollBar[][];
  redoStack: PianoRollBar[][];
}

// ── Utilities ──────────────────────────────────────────

const TICKS_PER_QUARTER = 480;

let _noteIdCounter = 0;

function generateNoteId(): string {
  return `note_${++_noteIdCounter}_${Date.now()}`;
}

/**
 * Convert a note name like "C4" or "A#3" to a MIDI number.
 * Uses rootToMidi from chord-player.ts internally.
 */
export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note name: ${noteName}`);
  const root = match[1];
  const octave = parseInt(match[2], 10);
  return rootToMidi(root, octave);
}

// ── Forward conversion: pure helpers ──────────────────

/** Create a chord entry from a parsed chord. Pure function. */
function chordEntryFromParsed(
  chord: import('./chord-parser').ParsedChord,
  barIdx: number,
  entryIdx: number,
  entryStartTick: number,
  ticksPerEntry: number,
): PianoRollBarEntry {
  const noteNames = chordToNotes(chord);
  const notes: PianoRollNote[] = noteNames.map(name => ({
    id: generateNoteId(),
    midi: noteNameToMidi(name),
    startTick: entryStartTick,
    durationTicks: ticksPerEntry,
    velocity: 100,
    barIndex: barIdx,
    entryIndex: entryIdx,
    isChordTone: true,
  }));

  return {
    entryIndex: entryIdx,
    startTick: entryStartTick,
    durationTicks: ticksPerEntry,
    originalChordName: chord.raw,
    recognizedChordName: chord.raw,
    notes,
    isCustomVoicing: false,
  };
}

/** Create an empty (rest/repeat/sustain-placeholder) entry. Pure function. */
function emptyBarEntry(entryIdx: number, startTick: number, durationTicks: number): PianoRollBarEntry {
  return {
    entryIndex: entryIdx,
    startTick,
    durationTicks,
    originalChordName: null,
    recognizedChordName: null,
    notes: [],
    isCustomVoicing: false,
  };
}

/**
 * Extend previous entry's duration for sustain. Returns a new copy of the entry
 * with extended note durations (immutable update).
 */
function extendEntryForSustain(entry: PianoRollBarEntry, ticksPerEntry: number): PianoRollBarEntry {
  return {
    ...entry,
    durationTicks: entry.durationTicks + ticksPerEntry,
    notes: entry.notes.map(n => ({ ...n, durationTicks: n.durationTicks + ticksPerEntry })),
  };
}

/**
 * Find the last entry with notes from the accumulated entries plus previously built bars.
 * Pure function (reads from arrays, does not mutate).
 */
function findPreviousEntryWithNotes(
  currentEntries: ReadonlyArray<PianoRollBarEntry>,
  previousBars: ReadonlyArray<PianoRollBar>,
): PianoRollBarEntry | null {
  // Check current bar entries in reverse
  for (let i = currentEntries.length - 1; i >= 0; i--) {
    if (currentEntries[i].notes.length > 0) return currentEntries[i];
  }
  // Check previous bars in reverse
  for (let i = previousBars.length - 1; i >= 0; i--) {
    const entries = previousBars[i].entries;
    for (let j = entries.length - 1; j >= 0; j--) {
      if (entries[j].notes.length > 0) return entries[j];
    }
  }
  return null;
}

/** Convert a single BarEntry to a PianoRollBarEntry. Pure function. */
function convertBarEntry(
  entry: BarEntry,
  barIdx: number,
  entryIdx: number,
  entryStartTick: number,
  ticksPerEntry: number,
): PianoRollBarEntry {
  switch (entry.type) {
    case 'chord':
      return chordEntryFromParsed(entry.chord, barIdx, entryIdx, entryStartTick, ticksPerEntry);
    case 'rest':
    case 'repeat':
    case 'sustain':
      return emptyBarEntry(entryIdx, entryStartTick, ticksPerEntry);
  }
}

/**
 * Convert rechord text to piano roll bars.
 *
 * Pipeline: parse → resolve repeats → convert each bar/entry
 */
export function scoreToPianoRoll(
  scoreText: string,
  timeSignature: { beats: number; beatValue: number } = { beats: 4, beatValue: 4 },
  bpm: number = 120,
): PianoRollBar[] {
  const resolved = resolveRepeats(parseProgression(scoreText).bars);
  const ticksPerBar = TICKS_PER_QUARTER * timeSignature.beats;

  const result: PianoRollBar[] = [];

  for (let barIdx = 0; barIdx < resolved.length; barIdx++) {
    const parsedBar = resolved[barIdx];
    const entryCount = parsedBar.entries.length || 1;
    const ticksPerEntry = Math.floor(ticksPerBar / entryCount);
    const barStartTick = barIdx * ticksPerBar;

    let entries: PianoRollBarEntry[] = [];

    for (let entryIdx = 0; entryIdx < parsedBar.entries.length; entryIdx++) {
      const entry = parsedBar.entries[entryIdx];
      const entryStartTick = barStartTick + entryIdx * ticksPerEntry;
      const converted = convertBarEntry(entry, barIdx, entryIdx, entryStartTick, ticksPerEntry);

      if (entry.type === 'sustain') {
        const prev = findPreviousEntryWithNotes(entries, result);
        if (prev && prev.notes.length > 0) {
          // Replace prev in entries or previous bars with extended version
          const extendedPrev = extendEntryForSustain(prev, ticksPerEntry);
          entries = entries.map(e => e === prev ? extendedPrev : e);
          // If prev was in a previous bar, update it there
          for (let bi = result.length - 1; bi >= 0; bi--) {
            const idx = result[bi].entries.indexOf(prev);
            if (idx >= 0) {
              result[bi] = {
                ...result[bi],
                entries: result[bi].entries.map(e => e === prev ? extendedPrev : e),
              };
              break;
            }
          }
        }
      }

      entries.push(converted);
    }

    result.push({ barIndex: barIdx, entries });
  }

  return result;
}

// ── Reverse conversion: pure helpers ──────────────────

/** Recognize a single entry's chord from its notes. Returns a new entry (no mutation). */
function recognizeEntryChord(entry: PianoRollBarEntry): PianoRollBarEntry {
  if (entry.notes.length === 0) {
    return { ...entry, recognizedChordName: null, isCustomVoicing: false };
  }
  const midiNotes = entry.notes.map(n => n.midi);
  const recognized = recognizeChord(midiNotes, entry.originalChordName ?? undefined);
  return recognized
    ? { ...entry, recognizedChordName: recognized.name, isCustomVoicing: false }
    : { ...entry, recognizedChordName: null, isCustomVoicing: true };
}

/** Extract chord names from bars (pure). Returns [updatedBars, chordNames]. */
function recognizeAllEntries(
  bars: ReadonlyArray<PianoRollBar>,
): { updatedBars: PianoRollBar[]; chordNames: (string | null)[] } {
  const chordNames: (string | null)[] = [];
  const updatedBars = bars.map(bar => ({
    ...bar,
    entries: bar.entries.map(entry => {
      const updated = recognizeEntryChord(entry);
      chordNames.push(updated.notes.length > 0
        ? (updated.recognizedChordName ?? updated.originalChordName)
        : null,
      );
      return updated;
    }),
  }));
  return { updatedBars, chordNames };
}

/** Build parsed bars from chord names for serialization (pure). */
function chordNamesToParsedBars(
  bars: ReadonlyArray<PianoRollBar>,
  chordNames: ReadonlyArray<string | null>,
): ParsedBar[] {
  let idx = 0;
  return bars.map((bar, i) => ({
    barNumber: i + 1,
    entries: bar.entries.map((_entry): BarEntry => {
      const name = chordNames[idx++];
      return name ? { type: 'chord', chord: parseChord(name) } : { type: 'rest' };
    }),
  }));
}

// ── Reverse conversion ─────────────────────────────────

/**
 * Convert piano roll bars back to rechord notation.
 * Preserves the original score's line layout (newlines, comments).
 * Only replaces chord names where recognition differs from original.
 *
 * Note: Also updates recognizedChordName/isCustomVoicing on the input bars
 * (side effect for caller synchronization).
 */
export function pianoRollToScore(
  bars: PianoRollBar[],
  originalScore?: string,
): string {
  const { updatedBars, chordNames } = recognizeAllEntries(bars);

  // Sync recognition results back to input bars (side effect at the boundary)
  for (let i = 0; i < bars.length; i++) {
    for (let j = 0; j < bars[i].entries.length; j++) {
      bars[i].entries[j].recognizedChordName = updatedBars[i].entries[j].recognizedChordName;
      bars[i].entries[j].isCustomVoicing = updatedBars[i].entries[j].isCustomVoicing;
    }
  }

  if (originalScore) {
    return replaceChordNamesInScore(originalScore, chordNames);
  }

  return serialize(chordNamesToParsedBars(bars, chordNames));
}

// ── Score text replacement helpers ────────────────────

const SPECIAL_TOKENS = new Set(['%', '_', '=', '-']);

/** Check whether a line is a comment or empty (should be preserved as-is). */
function isNonContentLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed || trimmed.startsWith('#') || trimmed.startsWith('//');
}

/** Replace chord tokens in a single segment, returning [newSegment, consumedCount]. Pure. */
function replaceTokensInSegment(
  segment: string,
  names: ReadonlyArray<string | null>,
  startIdx: number,
): { text: string; consumed: number } {
  if (!segment.trim()) return { text: segment, consumed: 0 };

  let consumed = 0;
  const tokens = segment.split(/(\s+)/);
  const replaced = tokens.map(token => {
    const t = token.trim();
    if (!t || SPECIAL_TOKENS.has(t)) return token;
    const idx = startIdx + consumed;
    consumed++;
    if (idx < names.length) {
      const newName = names[idx];
      if (newName && newName !== t) return token.replace(t, newName);
    }
    return token;
  });

  return { text: replaced.join(''), consumed };
}

/** Replace chord tokens in a single content line, returning [newLine, consumedCount]. Pure. */
function replaceTokensInLine(
  line: string,
  names: ReadonlyArray<string | null>,
  startIdx: number,
): { text: string; consumed: number } {
  const segments = line.split('|');
  let consumed = 0;
  const result = segments.map(segment => {
    const { text, consumed: c } = replaceTokensInSegment(segment, names, startIdx + consumed);
    consumed += c;
    return text;
  });
  return { text: result.join('|'), consumed };
}

/**
 * Replace chord names in the original score text while preserving layout.
 * Walks through the text token by token, replacing chord tokens with new names.
 * Pure function.
 */
function replaceChordNamesInScore(
  original: string,
  newNames: ReadonlyArray<string | null>,
): string {
  const lines = original.split('\n');
  let chordIdx = 0;

  return lines.map(line => {
    if (isNonContentLine(line)) return line;
    const { text, consumed } = replaceTokensInLine(line, newNames, chordIdx);
    chordIdx += consumed;
    return text;
  }).join('\n');
}

// ── State factory ──────────────────────────────────────

/**
 * Create an initial PianoRollState from score text.
 */
export function createPianoRollState(
  scoreText: string,
  timeSignature: { beats: number; beatValue: number } = { beats: 4, beatValue: 4 },
  bpm: number = 120,
): PianoRollState {
  return {
    bars: scoreToPianoRoll(scoreText, timeSignature, bpm),
    ticksPerQuarterNote: TICKS_PER_QUARTER,
    timeSignature,
    bpm,
    selectedNoteIds: new Set(),
    tool: 'select',
    snapDivision: 4,
    undoStack: [],
    redoStack: [],
  };
}

// ── Auto Voicing ──────────────────────────────────────

/**
 * Voice leading: rearrange target notes to minimize movement from previous voicing.
 * Keeps upper voices in the C4-C5 range (MIDI 57-76).
 */
function voiceLeadAutoV(target: number[], previous: number[]): number[] {
  const prevCenter = previous.reduce((a, b) => a + b, 0) / previous.length;
  return target.map(note => {
    const pc = note % 12;
    let best = pc + Math.round((prevCenter - pc) / 12) * 12;
    if (best < 57) best += 12;
    if (best > 76) best -= 12;
    return best;
  });
}

// ── Auto voicing: pure helpers ────────────────────────

/** Try to parse a chord name and extract root pitch class + intervals. Returns null on failure. */
function parseChordVoicingInfo(
  chordName: string | null,
): { rootPc: number; intervals: number[]; parsed: ParsedChord } | null {
  if (!chordName) return null;
  try {
    const parsed = parseChord(chordName);
    const intervals = QUALITY_INTERVALS[parsed.quality];
    if (!intervals) return null;
    return { rootPc: rootToMidi(parsed.root, 0) % 12, intervals, parsed };
  } catch { return null; }
}

/** Compute upper voice MIDI notes from root pitch class and intervals. Pure. */
function computeUpperMidi(rootPc: number, intervals: number[]): number[] {
  const upper = intervals.length > 3 ? intervals.slice(1) : intervals;
  return upper.map(iv => (rootPc + iv) % 12 + 60);
}

/** Compute target MIDI notes (bass + upper voices) for a chord. Pure. */
function computeVoicingTargets(
  info: { rootPc: number; intervals: number[]; parsed: ParsedChord },
  lastUpperMidi: number[],
): { targetMidis: number[]; newUpperMidi: number[] } {
  const bassRoot = info.parsed.bass ?? info.parsed.root;
  const bassMidi = rootToMidi(bassRoot, 2);
  let upperMidi = computeUpperMidi(info.rootPc, info.intervals);

  if (lastUpperMidi.length > 0) {
    upperMidi = voiceLeadAutoV(upperMidi, lastUpperMidi);
  }

  return { targetMidis: [bassMidi, ...upperMidi], newUpperMidi: upperMidi };
}

/** Map target MIDI values onto existing entry notes, adding/trimming as needed. Pure. */
function mapNotesToTargets(
  entry: PianoRollBarEntry,
  targetMidis: number[],
  barIndex: number,
): PianoRollNote[] {
  // Remap existing notes
  const remapped: PianoRollNote[] = entry.notes.map((note, i) => ({
    ...note,
    midi: i < targetMidis.length ? targetMidis[i] : targetMidis[targetMidis.length - 1],
    isChordTone: true,
  }));

  // Add new notes if chord has more than entry
  for (let i = entry.notes.length; i < targetMidis.length; i++) {
    remapped.push({
      id: generateNoteId(),
      midi: targetMidis[i],
      startTick: entry.startTick,
      durationTicks: entry.durationTicks,
      velocity: entry.notes[0]?.velocity ?? 100,
      barIndex,
      entryIndex: entry.entryIndex,
      isChordTone: true,
    });
  }

  // Trim extras
  return remapped.slice(0, targetMidis.length);
}

/** Shallow-copy an entry with deep-copied notes (identity preserving). */
function copyEntry(entry: PianoRollBarEntry): PianoRollBarEntry {
  return { ...entry, notes: entry.notes.map(n => ({ ...n })) };
}

/**
 * Apply harmonic voicing to all entries in the piano roll.
 * Bass in octave 2, upper voices centered around C4 with voice leading.
 * Returns a new bars array (does not mutate the input).
 */
export function applyAutoVoicing(bars: PianoRollBar[], selectedNoteIds?: Set<string>): PianoRollBar[] {
  let lastUpperMidi: number[] = [];
  const hasSelection = selectedNoteIds && selectedNoteIds.size > 0;

  return bars.map(bar => ({
    barIndex: bar.barIndex,
    entries: bar.entries.map(entry => {
      if (entry.notes.length === 0) return copyEntry(entry);

      const chordName = entry.recognizedChordName ?? entry.originalChordName;
      const voicingInfo = parseChordVoicingInfo(chordName);

      // Skip unselected entries (but still track voice leading)
      if (hasSelection && !entry.notes.some(n => selectedNoteIds.has(n.id))) {
        if (voicingInfo) {
          const upper = computeUpperMidi(voicingInfo.rootPc, voicingInfo.intervals);
          lastUpperMidi = lastUpperMidi.length > 0 ? voiceLeadAutoV(upper, lastUpperMidi) : upper;
        }
        return copyEntry(entry);
      }

      if (!voicingInfo) return copyEntry(entry);

      const { targetMidis, newUpperMidi } = computeVoicingTargets(voicingInfo, lastUpperMidi);
      lastUpperMidi = newUpperMidi;

      return {
        ...entry,
        notes: mapNotesToTargets(entry, targetMidis, bar.barIndex),
        isCustomVoicing: false,
      };
    }),
  }));
}
