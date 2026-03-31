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
  const isMinor = /\bminor\b/i.test(trimmed);
  // Extract root: take everything before " Major", " Minor", or other mode names
  const rootStr = trimmed.replace(/\s*(major|minor|dorian|mixolydian|lydian|phrygian|locrian|aeolian|ionian)$/i, '').trim();
  return { root: rootStr, isMinor };
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
  // Order matters: longer numerals (VII, IV, III) must come before shorter ones (V, I)
  const match = degree.match(/^([#b]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)/);
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

// Roman numeral strings indexed by degree (0-based)
const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

/**
 * Convert a real chord name to a degree string in the given key.
 * In C Major: Am7 → vi7, Dm7 → ii7, G7 → V7, Cmaj7 → Imaj7
 * Major chords → uppercase, minor/dim → lowercase.
 */
export const chordToDegree = (chord: string, key: string): string => {
  const { root, isMinor } = parseKeyString(key);
  const rootIdx = noteToIndex(root);
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;

  // Parse the chord: extract root note, then quality
  // Root can be a letter + optional # or b
  const chordMatch = chord.match(/^([A-G][#b]?)(.*)/);
  if (!chordMatch) return chord;

  const [, chordRoot, qualitySuffix] = chordMatch;

  let chordRootIdx: number;
  try {
    chordRootIdx = noteToIndex(chordRoot);
  } catch {
    return chord;
  }

  // Find which scale degree this root corresponds to
  const semitoneFromKey = ((chordRootIdx - rootIdx) % 12 + 12) % 12;

  let degreeIdx = intervals.indexOf(semitoneFromKey);
  let accidental = '';

  if (degreeIdx === -1) {
    // Non-diatonic: try sharp or flat of a diatonic degree
    const sharpIdx = intervals.indexOf(((semitoneFromKey - 1) % 12 + 12) % 12);
    const flatIdx = intervals.indexOf(((semitoneFromKey + 1) % 12 + 12) % 12);
    if (sharpIdx !== -1) {
      degreeIdx = sharpIdx;
      accidental = '#';
    } else if (flatIdx !== -1) {
      degreeIdx = flatIdx;
      accidental = 'b';
    } else {
      return chord; // can't map
    }
  }

  // Determine if the chord is minor/dim based on quality suffix
  // Quality starts with 'm' (but not 'maj') → minor; 'dim' → diminished
  const isMinorChord = /^m($|[^a])/.test(qualitySuffix) || qualitySuffix.startsWith('min');
  const isDimChord = qualitySuffix.startsWith('dim');

  // Use lowercase for minor/dim, uppercase for major
  const roman = (isMinorChord || isDimChord)
    ? ROMAN_LOWER[degreeIdx]
    : ROMAN_UPPER[degreeIdx];

  // Strip the leading 'm' or 'dim' from quality suffix to avoid duplication,
  // since case already conveys major/minor
  let displaySuffix = qualitySuffix;
  if (isMinorChord) {
    // Remove leading 'm' but keep the rest (e.g., 'm7' → '7', 'min7' → '7')
    displaySuffix = qualitySuffix.replace(/^min|^m/, '');
  } else if (isDimChord) {
    // Keep 'dim' in suffix since lowercase alone doesn't convey diminished
    // (convention: vii° or viidim)
  }

  return accidental + roman + displaySuffix;
};

/**
 * Convert a pattern to real chords in rechord notation for a given key.
 * Returns "| C | G | Am | Em | F | C | F | G |"
 */
export const getPatternChords = (pattern: ChordPattern, key: string): string => {
  const chords = pattern.degrees.map(d => degreeToChord(d, key));
  return '| ' + chords.join(' | ') + ' |';
};
