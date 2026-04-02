// chord-recognizer.ts
// Reverse conversion: MIDI note set → chord name

import { QUALITY_INTERVALS, midiToNoteName } from './chord-player';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Enharmonic normalization (flats → sharps)
const ENHARMONIC: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
  'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

function normalizeRoot(root: string): string {
  return ENHARMONIC[root] ?? root;
}

// ── Reverse lookup table ───────────────────────────────

interface QualityMatch {
  quality: string;
  intervals: number[];
}

// Build reverse map: sorted interval string → quality names (shortest first)
const INTERVAL_TO_QUALITIES: Map<string, QualityMatch[]> = new Map();

for (const [quality, intervals] of Object.entries(QUALITY_INTERVALS)) {
  // Normalize intervals to within one octave for pitch class comparison
  const normalized = intervals.map((i) => i % 12);
  const unique = [...new Set(normalized)].sort((a, b) => a - b);
  const key = unique.join(',');

  if (!INTERVAL_TO_QUALITIES.has(key)) {
    INTERVAL_TO_QUALITIES.set(key, []);
  }
  INTERVAL_TO_QUALITIES.get(key)!.push({ quality, intervals });
}

// Sort each group: shorter quality name first (simpler = preferred)
for (const matches of INTERVAL_TO_QUALITIES.values()) {
  matches.sort((a, b) => a.quality.length - b.quality.length);
}

// ── Main recognition function ──────────────────────────

export interface RecognizedChord {
  root: string;
  quality: string;
  bass: string | null;
  name: string;
}

/**
 * Recognize a chord from a set of MIDI note numbers.
 *
 * @param midiNotes - Array of MIDI note numbers (0-127)
 * @param originalChordName - Optional hint for root preference (context preservation)
 * @returns Recognized chord info, or null if no match
 */
export function recognizeChord(
  midiNotes: number[],
  originalChordName?: string,
): RecognizedChord | null {
  if (midiNotes.length === 0) return null;

  // Extract pitch classes (mod 12, deduplicated)
  const pitchClasses = [...new Set(midiNotes.map((n) => n % 12))].sort((a, b) => a - b);
  if (pitchClasses.length === 0) return null;

  // Find lowest note for bass detection
  const lowestMidi = Math.min(...midiNotes);
  const lowestPitchClass = lowestMidi % 12;

  // Extract original root hint if provided
  let originalRoot: string | null = null;
  if (originalChordName) {
    const m = originalChordName.match(/^([A-G][#b]?)/);
    if (m) originalRoot = normalizeRoot(m[1]);
  }

  // Try each pitch class as potential root
  interface Candidate {
    root: string;
    quality: string;
    bass: string | null;
    score: number; // lower = better
  }

  const candidates: Candidate[] = [];

  for (const rootPC of pitchClasses) {
    // Compute intervals relative to this root
    const intervals = pitchClasses
      .map((pc) => (pc - rootPC + 12) % 12)
      .sort((a, b) => a - b);
    const key = intervals.join(',');

    const matches = INTERVAL_TO_QUALITIES.get(key);
    if (!matches || matches.length === 0) continue;

    const rootName = NOTE_NAMES[rootPC];
    const bestQuality = matches[0]; // shortest name = simplest

    // Determine bass note
    const bass = lowestPitchClass !== rootPC ? NOTE_NAMES[lowestPitchClass] : null;

    // Scoring: prefer original root match, then simpler quality, then root=lowest
    let score = 0;
    // Penalty for quality complexity
    score += bestQuality.quality.length;
    // Bonus for matching original root
    if (originalRoot && normalizeRoot(rootName) === originalRoot) {
      score -= 100;
    }
    // Slight bonus for root being the lowest note (no slash chord needed)
    if (bass === null) {
      score -= 10;
    }

    candidates.push({
      root: rootName,
      quality: bestQuality.quality,
      bass,
      score,
    });
  }

  if (candidates.length === 0) return null;

  // Pick best candidate (lowest score)
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];

  const name = best.root + best.quality + (best.bass ? `/${best.bass}` : '');

  return {
    root: best.root,
    quality: best.quality,
    bass: best.bass,
    name,
  };
}
