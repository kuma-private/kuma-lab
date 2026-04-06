// voicing-engine.ts
// Independent voicing engine: chord name + VoicingConfig → MIDI note arrays.
// Extracted and extended from piano-roll-model.ts applyAutoVoicing logic.

import { parseChord } from './chord-parser';
import type { ParsedChord } from './chord-parser';
import { rootToMidi, QUALITY_INTERVALS } from './chord-player';

// ── Types ──────────────────────────────────────────────

/** MIDI note range constraint */
export interface NoteRange {
  low: number;   // lowest MIDI note (inclusive)
  high: number;  // highest MIDI note (inclusive)
}

export interface VoicingConfig {
  type: 'close' | 'open' | 'drop2' | 'spread' | 'shell';
  range?: NoteRange;   // 音域制約
  lead?: 'smooth';     // トップノートの最小移動
}

export interface VoicedChord {
  chordName: string;        // 元のコード名 "Am7"
  midiNotes: number[];      // 生成されたMIDIノート番号 [45, 60, 64, 67]
  bassMidi: number;         // ベースノート
  upperMidi: number[];      // 上声部ノート
}

// ── Internal helpers ──────────────────────────────────

/** Parse a chord name into root pitch class + intervals. Returns null on failure. */
function parseChordInfo(
  chordName: string,
): { rootPc: number; intervals: number[]; parsed: ParsedChord } | null {
  try {
    const parsed = parseChord(chordName);
    const intervals = QUALITY_INTERVALS[parsed.quality];
    if (!intervals) return null;
    return { rootPc: rootToMidi(parsed.root, 0) % 12, intervals, parsed };
  } catch {
    return null;
  }
}

/**
 * Voice leading: rearrange target notes to minimize movement from previous voicing.
 * Keeps upper voices in the C4-C5 range (MIDI 57-76).
 */
function voiceLeadSmooth(target: number[], previous: number[]): number[] {
  const prevCenter = previous.reduce((a, b) => a + b, 0) / previous.length;
  return target.map(note => {
    const pc = note % 12;
    let best = pc + Math.round((prevCenter - pc) / 12) * 12;
    if (best < 57) best += 12;
    if (best > 76) best -= 12;
    return best;
  });
}

/** Clamp a MIDI note into the given range by octave transposition. */
function clampToRange(midi: number, range: NoteRange): number {
  while (midi < range.low) midi += 12;
  while (midi > range.high) midi -= 12;
  // If still out of range (range < 12 semitones), pick closest bound
  if (midi < range.low || midi > range.high) {
    const distLow = Math.abs(midi - range.low);
    const distHigh = Math.abs(midi - range.high);
    return distLow <= distHigh ? range.low : range.high;
  }
  return midi;
}

/** Apply range constraint to all notes. */
function applyRange(notes: number[], range: NoteRange | undefined): number[] {
  if (!range) return notes;
  return notes.map(n => clampToRange(n, range));
}

// ── Voicing strategies ────────────────────────────────

/**
 * Close voicing: all upper voices clustered around octave 4.
 * Bass: root (or slash bass) at octave 2.
 */
function voiceClose(
  rootPc: number,
  intervals: number[],
  parsed: ParsedChord,
): { bassMidi: number; upperMidi: number[] } {
  const bassRoot = parsed.bass ?? parsed.root;
  const bassMidi = rootToMidi(bassRoot, 2);
  // Upper voices: skip root if 4+ notes (root is in bass), center at C4
  const upper = intervals.length > 3 ? intervals.slice(1) : intervals;
  const upperMidi = upper.map(iv => (rootPc + iv) % 12 + 60);
  return { bassMidi, upperMidi };
}

/**
 * Open voicing: 3rd and 7th in octave 3, 5th and tensions in octave 4.
 * Bass: root at octave 2.
 */
function voiceOpen(
  rootPc: number,
  intervals: number[],
  parsed: ParsedChord,
): { bassMidi: number; upperMidi: number[] } {
  const bassRoot = parsed.bass ?? parsed.root;
  const bassMidi = rootToMidi(bassRoot, 2);

  // Categorize intervals: index 1 = 3rd, last seventh-range = 7th, rest = upper
  const upper = intervals.length > 3 ? intervals.slice(1) : intervals;
  const upperMidi = upper.map((iv, i) => {
    const pc = (rootPc + iv) % 12;
    // 3rd (first interval after root) and 7th (last interval in 10-11 range) → octave 3
    // 5th and tensions → octave 4
    if (i === 0) return pc + 48;                                 // 3rd → octave 3
    if (i === upper.length - 1 && iv >= 10 && iv <= 11) return pc + 48; // 7th → octave 3
    return pc + 60;                                               // 5th, tensions → octave 4
  });

  return { bassMidi, upperMidi };
}

/**
 * Drop-2 voicing: start with close voicing, then drop the 2nd-from-top note by 1 octave.
 */
function voiceDrop2(
  rootPc: number,
  intervals: number[],
  parsed: ParsedChord,
): { bassMidi: number; upperMidi: number[] } {
  const { bassMidi, upperMidi } = voiceClose(rootPc, intervals, parsed);

  if (upperMidi.length >= 2) {
    // Sort ascending to identify 2nd from top
    const sorted = [...upperMidi].sort((a, b) => a - b);
    const secondFromTop = sorted[sorted.length - 2];
    const idx = upperMidi.indexOf(secondFromTop);
    if (idx >= 0) {
      upperMidi[idx] -= 12;
    }
  }

  return { bassMidi, upperMidi };
}

/**
 * Spread voicing: distribute upper voices evenly across octaves 3-5.
 * Bass: root at octave 2.
 */
function voiceSpread(
  rootPc: number,
  intervals: number[],
  parsed: ParsedChord,
): { bassMidi: number; upperMidi: number[] } {
  const bassRoot = parsed.bass ?? parsed.root;
  const bassMidi = rootToMidi(bassRoot, 2);

  const upper = intervals.length > 3 ? intervals.slice(1) : intervals;
  const count = upper.length;

  // Spread across octave 3 (48) to octave 5 (72)
  const lowBase = 48;  // C3
  const highBase = 72; // C5
  const span = highBase - lowBase;

  const upperMidi = upper.map((iv, i) => {
    const pc = (rootPc + iv) % 12;
    // Distribute evenly: first voice near bottom, last near top
    const targetCenter = count > 1
      ? lowBase + (span * i) / (count - 1)
      : (lowBase + highBase) / 2;
    // Snap pitch class to nearest octave of target
    return pc + Math.round((targetCenter - pc) / 12) * 12;
  });

  return { bassMidi, upperMidi };
}

/**
 * Shell voicing: root + 3rd + 7th only (omit 5th and tensions).
 * Bass: root at octave 2. Upper: 3rd and 7th at octave 3-4.
 */
function voiceShell(
  rootPc: number,
  intervals: number[],
  parsed: ParsedChord,
): { bassMidi: number; upperMidi: number[] } {
  const bassRoot = parsed.bass ?? parsed.root;
  const bassMidi = rootToMidi(bassRoot, 2);

  // Extract 3rd and 7th from intervals
  // intervals[0] = root (0), [1] = 3rd, [2] = 5th, [3] = 7th (if exists)
  const shellIntervals: number[] = [];
  if (intervals.length >= 2) {
    shellIntervals.push(intervals[1]); // 3rd
  }
  if (intervals.length >= 4) {
    shellIntervals.push(intervals[3]); // 7th
  } else if (intervals.length === 3) {
    // Triad: use 3rd and 5th as the shell
    shellIntervals.push(intervals[2]); // 5th
  }

  // Place 3rd in octave 3, 7th in octave 4
  const upperMidi = shellIntervals.map((iv, i) => {
    const pc = (rootPc + iv) % 12;
    return i === 0 ? pc + 48 : pc + 60; // 3rd → oct3, 7th → oct4
  });

  return { bassMidi, upperMidi };
}

// ── Voicing dispatch ──────────────────────────────────

type VoicingFn = (
  rootPc: number,
  intervals: number[],
  parsed: ParsedChord,
) => { bassMidi: number; upperMidi: number[] };

const VOICING_FNS: Record<VoicingConfig['type'], VoicingFn> = {
  close: voiceClose,
  open: voiceOpen,
  drop2: voiceDrop2,
  spread: voiceSpread,
  shell: voiceShell,
};

// ── Main export ───────────────────────────────────────

/**
 * Apply voicing to a sequence of chord names.
 * Pure function — voice leading state is managed internally across the array.
 *
 * @param chordNames - Array of chord name strings, e.g. ["Am7", "Dm7", "G7", "Cmaj7"]
 * @param config - Voicing configuration (type, optional range, optional lead mode)
 * @returns Array of VoicedChord with MIDI note data
 */
export function voiceChords(
  chordNames: string[],
  config: VoicingConfig,
): VoicedChord[] {
  const voicingFn = VOICING_FNS[config.type];
  let lastUpperMidi: number[] = [];

  return chordNames.map(chordName => {
    const info = parseChordInfo(chordName);

    // Unknown chord → return empty
    if (!info) {
      return {
        chordName,
        midiNotes: [],
        bassMidi: 0,
        upperMidi: [],
      };
    }

    // Compute base voicing
    let { bassMidi, upperMidi } = voicingFn(info.rootPc, info.intervals, info.parsed);

    // Apply voice leading if configured
    if (config.lead === 'smooth' && lastUpperMidi.length > 0) {
      upperMidi = voiceLeadSmooth(upperMidi, lastUpperMidi);
    }

    // Apply range constraint
    if (config.range) {
      bassMidi = clampToRange(bassMidi, config.range);
      upperMidi = applyRange(upperMidi, config.range);
    }

    lastUpperMidi = upperMidi;

    return {
      chordName,
      midiNotes: [bassMidi, ...upperMidi],
      bassMidi,
      upperMidi,
    };
  });
}
