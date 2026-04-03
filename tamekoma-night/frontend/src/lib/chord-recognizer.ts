// chord-recognizer.ts
// Reverse conversion: MIDI note set → chord name
//
// Pipeline: extractPitchClasses → generateCandidates → scoreCandidate → selectBest

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

// ── Reverse lookup table (lazy-initialized) ───────────

interface QualityMatch {
  quality: string;
  intervals: number[];
}

let _intervalToQualities: Map<string, QualityMatch[]> | null = null;

/** Build (or return cached) reverse lookup table: interval key → quality matches. */
function getIntervalToQualities(): Map<string, QualityMatch[]> {
  if (_intervalToQualities) return _intervalToQualities;

  const map = new Map<string, QualityMatch[]>();

  for (const [quality, intervals] of Object.entries(QUALITY_INTERVALS)) {
    const normalized = intervals.map(i => i % 12);
    const unique = [...new Set(normalized)].sort((a, b) => a - b);
    const key = unique.join(',');

    const existing = map.get(key);
    if (existing) {
      existing.push({ quality, intervals });
    } else {
      map.set(key, [{ quality, intervals }]);
    }
  }

  // Sort each group: shorter quality name first (simpler = preferred)
  for (const matches of map.values()) {
    matches.sort((a, b) => a.quality.length - b.quality.length);
  }

  _intervalToQualities = map;
  return map;
}

// ── Pure pipeline stages ──────────────────────────────

export interface RecognizedChord {
  root: string;
  quality: string;
  bass: string | null;
  name: string;
}

interface Candidate {
  root: string;
  quality: string;
  bass: string | null;
  score: number;
}

/** Extract deduplicated, sorted pitch classes from MIDI notes. Pure. */
function extractPitchClasses(midiNotes: ReadonlyArray<number>): number[] {
  return [...new Set(midiNotes.map(n => n % 12))].sort((a, b) => a - b);
}

/** Extract original root hint from a chord name string. Pure. */
function extractOriginalRoot(chordName: string | undefined): string | null {
  if (!chordName) return null;
  const m = chordName.match(/^([A-G][#b]?)/);
  return m ? normalizeRoot(m[1]) : null;
}

/** Generate a candidate for a given root pitch class. Pure. */
function candidateForRoot(
  rootPC: number,
  pitchClasses: ReadonlyArray<number>,
  lowestPitchClass: number,
  originalRoot: string | null,
): Candidate | null {
  const intervals = pitchClasses
    .map(pc => (pc - rootPC + 12) % 12)
    .sort((a, b) => a - b);
  const key = intervals.join(',');

  const matches = getIntervalToQualities().get(key);
  if (!matches || matches.length === 0) return null;

  const rootName = NOTE_NAMES[rootPC];
  const bestQuality = matches[0];
  const bass = lowestPitchClass !== rootPC ? NOTE_NAMES[lowestPitchClass] : null;

  return {
    root: rootName,
    quality: bestQuality.quality,
    bass,
    score: scoreCandidate(rootName, bestQuality.quality.length, bass, originalRoot),
  };
}

/** Score a chord candidate. Lower = better. Pure. */
function scoreCandidate(
  rootName: string,
  qualityLength: number,
  bass: string | null,
  originalRoot: string | null,
): number {
  let score = qualityLength;
  if (originalRoot && normalizeRoot(rootName) === originalRoot) score -= 100;
  if (bass === null) score -= 10;
  return score;
}

/** Generate all candidates for a set of pitch classes. Pure. */
function generateCandidates(
  pitchClasses: ReadonlyArray<number>,
  lowestPitchClass: number,
  originalRoot: string | null,
): Candidate[] {
  return pitchClasses
    .map(rootPC => candidateForRoot(rootPC, pitchClasses, lowestPitchClass, originalRoot))
    .filter((c): c is Candidate => c !== null);
}

/** Select the best candidate (lowest score). Pure. */
function selectBest(candidates: ReadonlyArray<Candidate>): RecognizedChord | null {
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => a.score <= b.score ? a : b);
  return {
    root: best.root,
    quality: best.quality,
    bass: best.bass,
    name: best.root + best.quality + (best.bass ? `/${best.bass}` : ''),
  };
}

// ── Main recognition function ──────────────────────────

/**
 * Recognize a chord from a set of MIDI note numbers.
 *
 * Pipeline: extractPitchClasses → generateCandidates → selectBest
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

  const pitchClasses = extractPitchClasses(midiNotes);
  if (pitchClasses.length === 0) return null;

  const lowestPitchClass = Math.min(...midiNotes) % 12;
  const originalRoot = extractOriginalRoot(originalChordName);
  const candidates = generateCandidates(pitchClasses, lowestPitchClass, originalRoot);

  return selectBest(candidates);
}
