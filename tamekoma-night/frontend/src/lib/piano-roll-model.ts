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

// ── Forward conversion ─────────────────────────────────

/**
 * Convert rechord text to piano roll bars.
 *
 * 1. Parse the score text into ParsedBar[]
 * 2. Resolve repeat markers
 * 3. Convert each bar/entry into PianoRollBar/PianoRollBarEntry with MIDI notes
 */
export function scoreToPianoRoll(
  scoreText: string,
  timeSignature: { beats: number; beatValue: number } = { beats: 4, beatValue: 4 },
  bpm: number = 120,
): PianoRollBar[] {
  const { bars: parsedBars } = parseProgression(scoreText);
  const resolved = resolveRepeats(parsedBars);

  const ticksPerBar = TICKS_PER_QUARTER * timeSignature.beats;

  const result: PianoRollBar[] = [];

  for (let barIdx = 0; barIdx < resolved.length; barIdx++) {
    const parsedBar = resolved[barIdx];
    const entryCount = parsedBar.entries.length || 1;
    const ticksPerEntry = Math.floor(ticksPerBar / entryCount);
    const barStartTick = barIdx * ticksPerBar;

    const entries: PianoRollBarEntry[] = [];

    for (let entryIdx = 0; entryIdx < parsedBar.entries.length; entryIdx++) {
      const entry = parsedBar.entries[entryIdx];
      const entryStartTick = barStartTick + entryIdx * ticksPerEntry;

      if (entry.type === 'chord') {
        const noteNames = chordToNotes(entry.chord);
        const notes: PianoRollNote[] = noteNames.map((name) => ({
          id: generateNoteId(),
          midi: noteNameToMidi(name),
          startTick: entryStartTick,
          durationTicks: ticksPerEntry,
          velocity: 100,
          barIndex: barIdx,
          entryIndex: entryIdx,
          isChordTone: true,
        }));

        entries.push({
          entryIndex: entryIdx,
          startTick: entryStartTick,
          durationTicks: ticksPerEntry,
          originalChordName: entry.chord.raw,
          recognizedChordName: entry.chord.raw,
          notes,
          isCustomVoicing: false,
        });
      } else if (entry.type === 'rest') {
        entries.push({
          entryIndex: entryIdx,
          startTick: entryStartTick,
          durationTicks: ticksPerEntry,
          originalChordName: null,
          recognizedChordName: null,
          notes: [],
          isCustomVoicing: false,
        });
      } else if (entry.type === 'sustain') {
        // Extend the previous entry's notes
        const prevEntry = entries.length > 0
          ? entries[entries.length - 1]
          : (result.length > 0
            ? result[result.length - 1].entries[result[result.length - 1].entries.length - 1]
            : null);

        if (prevEntry && prevEntry.notes.length > 0) {
          // Extend duration of previous entry's notes
          for (const note of prevEntry.notes) {
            note.durationTicks += ticksPerEntry;
          }
          prevEntry.durationTicks += ticksPerEntry;
        }

        // Still create an entry for the sustain slot (with no new notes)
        entries.push({
          entryIndex: entryIdx,
          startTick: entryStartTick,
          durationTicks: ticksPerEntry,
          originalChordName: null,
          recognizedChordName: null,
          notes: [],
          isCustomVoicing: false,
        });
      } else if (entry.type === 'repeat') {
        // Should already be resolved by resolveRepeats, but handle gracefully
        entries.push({
          entryIndex: entryIdx,
          startTick: entryStartTick,
          durationTicks: ticksPerEntry,
          originalChordName: null,
          recognizedChordName: null,
          notes: [],
          isCustomVoicing: false,
        });
      }
    }

    result.push({ barIndex: barIdx, entries });
  }

  return result;
}

// ── Reverse conversion ─────────────────────────────────

/**
 * Convert piano roll bars back to rechord notation.
 * Preserves the original score's line layout (newlines, comments).
 * Only replaces chord names where recognition differs from original.
 */
export function pianoRollToScore(
  bars: PianoRollBar[],
  originalScore?: string,
): string {
  // Build the new chord name list from piano roll entries
  const newChordNames: (string | null)[] = [];
  for (const bar of bars) {
    for (const entry of bar.entries) {
      if (entry.notes.length > 0) {
        const midiNotes = entry.notes.map((n) => n.midi);
        const recognized = recognizeChord(midiNotes, entry.originalChordName ?? undefined);
        if (recognized) {
          entry.recognizedChordName = recognized.name;
          entry.isCustomVoicing = false;
          newChordNames.push(recognized.name);
        } else {
          entry.isCustomVoicing = true;
          newChordNames.push(entry.originalChordName);
        }
      } else {
        newChordNames.push(null); // rest
      }
    }
  }

  // If we have original score text, preserve its layout
  if (originalScore) {
    return replaceChordNamesInScore(originalScore, newChordNames);
  }

  // Fallback: use serialize (loses layout)
  const parsedBars: ParsedBar[] = bars.map((bar, i) => ({
    barNumber: i + 1,
    entries: bar.entries.map((entry, j): BarEntry => {
      const idx = bars.slice(0, i).reduce((sum, b) => sum + b.entries.length, 0) + j;
      const name = newChordNames[idx];
      if (name) {
        return { type: 'chord', chord: parseChord(name) };
      }
      return { type: 'rest' };
    }),
  }));
  return serialize(parsedBars);
}

/**
 * Replace chord names in the original score text while preserving layout.
 * Walks through the text token by token, replacing chord tokens with new names.
 */
function replaceChordNamesInScore(original: string, newNames: (string | null)[]): string {
  const lines = original.split('\n');
  let chordIdx = 0;

  return lines.map(line => {
    const trimmed = line.trim();
    // Preserve comment and empty lines
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || !trimmed) {
      return line;
    }

    // Process line: split by | and replace chord tokens
    const segments = line.split('|');
    const result: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const trimSeg = segment.trim();

      if (!trimSeg) {
        result.push(segment);
        continue;
      }

      // Replace tokens in this segment
      const tokens = segment.split(/(\s+)/); // keep whitespace
      const newTokens = tokens.map(token => {
        const t = token.trim();
        if (!t || t === '%' || t === '_' || t === '=' || t === '-') return token;
        // This is a chord token
        if (chordIdx < newNames.length) {
          const newName = newNames[chordIdx];
          chordIdx++;
          if (newName && newName !== t) {
            return token.replace(t, newName);
          }
        }
        return token;
      });
      result.push(newTokens.join(''));
    }

    return result.join('|');
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

/**
 * Apply harmonic voicing to all entries in the piano roll.
 * Bass in octave 2, upper voices centered around C4 with voice leading.
 * Returns a new bars array (does not mutate the input).
 */
export function applyAutoVoicing(bars: PianoRollBar[], selectedNoteIds?: Set<string>): PianoRollBar[] {
  let lastUpperMidi: number[] = [];

  // If selection is provided, find which entries contain selected notes
  const hasSelection = selectedNoteIds && selectedNoteIds.size > 0;

  return bars.map(bar => ({
    barIndex: bar.barIndex,
    entries: bar.entries.map(entry => {
      if (entry.notes.length === 0) {
        return { ...entry, notes: [...entry.notes] };
      }

      // Skip entries that don't contain any selected notes (when selection exists)
      if (hasSelection) {
        const entryHasSelected = entry.notes.some(n => selectedNoteIds.has(n.id));
        if (!entryHasSelected) {
          // Still track voicing for voice leading continuity
          const rootPc = (() => {
            const cn = entry.recognizedChordName ?? entry.originalChordName;
            if (!cn) return null;
            try {
              const p = parseChord(cn);
              return rootToMidi(p.root, 0) % 12;
            } catch { return null; }
          })();
          if (rootPc !== null) {
            const cn = entry.recognizedChordName ?? entry.originalChordName;
            if (cn) {
              try {
                const p = parseChord(cn);
                const ivs = QUALITY_INTERVALS[p.quality];
                if (ivs) {
                  const upper = (ivs.length > 3 ? ivs.slice(1) : ivs).map(iv => (rootPc + iv) % 12 + 60);
                  if (lastUpperMidi.length > 0) lastUpperMidi = voiceLeadAutoV(upper, lastUpperMidi);
                  else lastUpperMidi = upper;
                }
              } catch {}
            }
          }
          return { ...entry, notes: entry.notes.map(n => ({ ...n })) };
        }
      }

      const chordName = entry.recognizedChordName ?? entry.originalChordName;
      if (!chordName) {
        return { ...entry, notes: entry.notes.map(n => ({ ...n })) };
      }

      // Parse chord to get root, quality, bass
      const parsed = parseChord(chordName);
      const intervals = QUALITY_INTERVALS[parsed.quality];
      if (!intervals) {
        return { ...entry, notes: entry.notes.map(n => ({ ...n })) };
      }

      // Bass note: slash bass or root at octave 2
      const bassRoot = parsed.bass ?? parsed.root;
      const bassMidi = rootToMidi(bassRoot, 2);

      // Upper voices: skip root interval if >3 notes, center around C4
      const rootPc = rootToMidi(parsed.root, 0) % 12;
      const upperIntervals = intervals.length > 3 ? intervals.slice(1) : intervals;
      let upperMidi = upperIntervals.map(iv => {
        const pc = (rootPc + iv) % 12;
        return pc + 60;
      });

      // Voice leading from previous entry
      if (lastUpperMidi.length > 0) {
        upperMidi = voiceLeadAutoV(upperMidi, lastUpperMidi);
      }
      lastUpperMidi = upperMidi;

      const targetMidis = [bassMidi, ...upperMidi];

      // Map new MIDI values onto existing notes, preserving id/velocity/timing
      const newNotes = entry.notes.map((note, i) => ({
        ...note,
        midi: i < targetMidis.length ? targetMidis[i] : targetMidis[targetMidis.length - 1],
        isChordTone: true,
      }));

      // If chord has more notes than entry, add new ones
      for (let i = entry.notes.length; i < targetMidis.length; i++) {
        newNotes.push({
          id: generateNoteId(),
          midi: targetMidis[i],
          startTick: entry.startTick,
          durationTicks: entry.durationTicks,
          velocity: entry.notes[0]?.velocity ?? 100,
          barIndex: entry.notes[0]?.barIndex ?? bar.barIndex,
          entryIndex: entry.entryIndex,
          isChordTone: true,
        });
      }

      // If entry has more notes than chord, trim extras
      const trimmedNotes = newNotes.slice(0, targetMidis.length);

      return {
        ...entry,
        notes: trimmedNotes,
        isCustomVoicing: false,
      };
    }),
  }));
}
