// chord-suggest.ts
// Key-aware chord suggestion and pattern generation

// ── Types ──────────────────────────────────────────────

export interface ChordPattern {
  name: string;
  nameJa: string;
  degrees: string[];
}

// ── Constants ──────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
  'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

// Keys that conventionally use flats
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'];

// Major scale intervals (semitones from root)
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
// Natural minor scale intervals
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Diatonic chord qualities for major key (I through VII)
const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];
// Diatonic chord qualities for natural minor key
const MINOR_QUALITIES = ['m', 'dim', '', 'm', 'm', '', ''];

// Degree name to scale degree index (0-based)
const DEGREE_MAP: Record<string, number> = {
  'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6,
  'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6,
};

export const PATTERNS: ChordPattern[] = [
  { name: "Canon", nameJa: "カノン進行", degrees: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"] },
  { name: "Komuro", nameJa: "小室進行", degrees: ["vi", "IV", "V", "I"] },
  { name: "Just the Two", nameJa: "おしゃれ進行", degrees: ["IVmaj7", "III7", "vi", "V"] },
  { name: "Royal Road", nameJa: "王道進行", degrees: ["IV", "V", "iii", "vi"] },
  { name: "Blues", nameJa: "ブルース", degrees: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"] },
  { name: "ii-V-I", nameJa: "ツーファイブワン", degrees: ["ii7", "V7", "Imaj7"] },
];

// ── Helpers ────────────────────────────────────────────

const noteToIndex = (note: string): number => {
  const normalized = ENHARMONIC_TO_SHARP[note] ?? note;
  const idx = NOTE_NAMES.indexOf(normalized);
  if (idx === -1) throw new Error(`Unknown note: ${note}`);
  return idx;
};

const indexToNote = (idx: number, useFlats: boolean): string => {
  const note = NOTE_NAMES[((idx % 12) + 12) % 12];
  if (useFlats && SHARP_TO_FLAT[note]) {
    return SHARP_TO_FLAT[note];
  }
  return note;
};

const parseKeyString = (key: string): { root: string; isMinor: boolean } => {
  const trimmed = key.trim();
  const isMinor = /minor/i.test(trimmed) || /m$/i.test(trimmed.replace(/\s*(major|minor)$/i, ''));
  // Extract root: take everything before " Major", " Minor", " major", " minor"
  const rootStr = trimmed.replace(/\s*(major|minor)$/i, '').trim();
  return { root: rootStr, isMinor: isMinor || /minor/i.test(trimmed) };
};

// ── Public API ─────────────────────────────────────────

/**
 * Get diatonic chords for a given key string.
 * "C Major" -> ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]
 * "A Minor" -> ["Am", "Bdim", "C", "Dm", "Em", "F", "G"]
 */
export const getDiatonicChords = (key: string): string[] => {
  const { root, isMinor } = parseKeyString(key);
  const rootIdx = noteToIndex(root);
  const useFlats = FLAT_KEYS.some(k => k.toLowerCase() === key.trim().toLowerCase()
    || k.toLowerCase() === root.toLowerCase());
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;
  const qualities = isMinor ? MINOR_QUALITIES : MAJOR_QUALITIES;

  return intervals.map((interval, i) => {
    const noteName = indexToNote(rootIdx + interval, useFlats);
    return noteName + qualities[i];
  });
};

/**
 * Convert a degree string to a real chord name in the given key.
 * Handles qualities appended to degree names: "IVmaj7" -> root of IV + "maj7"
 */
export const degreeToChord = (degree: string, key: string): string => {
  const { root, isMinor } = parseKeyString(key);
  const rootIdx = noteToIndex(root);
  const useFlats = FLAT_KEYS.some(k => k.toLowerCase() === key.trim().toLowerCase()
    || k.toLowerCase() === root.toLowerCase());
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;

  // Parse the degree: extract roman numeral prefix and any suffix quality
  const match = degree.match(/^(#?b?)(I{1,3}|IV|V?I{0,3}|i{1,3}|iv|v?i{0,3})(.*)/);
  if (!match) return degree; // fallback

  const [, accidental, roman, suffix] = match;
  const upperRoman = roman.toUpperCase();
  const degreeIdx = DEGREE_MAP[upperRoman];
  if (degreeIdx === undefined) return degree;

  let semitones = intervals[degreeIdx];
  if (accidental === '#') semitones += 1;
  if (accidental === 'b') semitones -= 1;

  const noteName = indexToNote(rootIdx + semitones, useFlats);

  // If suffix is explicitly provided, use it
  if (suffix) return noteName + suffix;

  // Otherwise, use the diatonic quality
  // Determine quality from case: lowercase = minor context
  const isLowerCase = roman !== upperRoman;
  const diatonicQualities = isMinor ? MINOR_QUALITIES : MAJOR_QUALITIES;
  const defaultQuality = diatonicQualities[degreeIdx];

  // If the roman numeral case matches the diatonic quality, use diatonic
  if (isLowerCase && (defaultQuality === 'm' || defaultQuality === 'dim')) {
    return noteName + defaultQuality;
  }
  if (!isLowerCase && defaultQuality === '') {
    return noteName;
  }
  // Override based on case
  if (isLowerCase) return noteName + 'm';
  return noteName;
};

/**
 * Convert a pattern to real chords in rechord notation for a given key.
 * Returns "| C | G | Am | Em | F | C | F | G |"
 */
export const getPatternChords = (pattern: ChordPattern, key: string): string => {
  const chords = pattern.degrees.map(d => degreeToChord(d, key));
  return '| ' + chords.join(' | ') + ' |';
};
