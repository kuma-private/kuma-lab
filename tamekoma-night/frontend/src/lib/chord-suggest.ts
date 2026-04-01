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
const noteToDegree = (noteIdx: number, keyRootIdx: number, intervals: number[]): { accidental: string; degreeIdx: number } | null => {
  const semitone = ((noteIdx - keyRootIdx) % 12 + 12) % 12;
  const degreeIdx = intervals.indexOf(semitone);
  if (degreeIdx !== -1) return { accidental: '', degreeIdx };

  const sharpIdx = intervals.indexOf(((semitone - 1) % 12 + 12) % 12);
  if (sharpIdx !== -1) return { accidental: '#', degreeIdx: sharpIdx };

  const flatIdx = intervals.indexOf(((semitone + 1) % 12 + 12) % 12);
  if (flatIdx !== -1) return { accidental: 'b', degreeIdx: flatIdx };

  return null;
};

export const chordToDegree = (chord: string, key: string): string => {
  const { root, isMinor } = parseKeyString(key);
  const rootIdx = noteToIndex(root);
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;

  // Handle slash chords: split into chord part and bass part
  const slashMatch = chord.match(/^(.+)\/([A-G][#b]?)$/);
  const mainChord = slashMatch ? slashMatch[1] : chord;
  const bassNote = slashMatch ? slashMatch[2] : null;

  // Parse the main chord: root + quality
  const chordMatch = mainChord.match(/^([A-G][#b]?)(.*)/);
  if (!chordMatch) return chord;

  const [, chordRoot, qualitySuffix] = chordMatch;

  let chordRootIdx: number;
  try {
    chordRootIdx = noteToIndex(chordRoot);
  } catch {
    return chord;
  }

  const degree = noteToDegree(chordRootIdx, rootIdx, intervals);
  if (!degree) return chord;

  // Determine if the chord is minor/dim based on quality suffix
  const isMinorChord = /^m($|[^a])/.test(qualitySuffix) || qualitySuffix.startsWith('min');
  const isDimChord = qualitySuffix.startsWith('dim');

  const roman = (isMinorChord || isDimChord)
    ? ROMAN_LOWER[degree.degreeIdx]
    : ROMAN_UPPER[degree.degreeIdx];

  let displaySuffix = qualitySuffix;
  if (isMinorChord) {
    displaySuffix = qualitySuffix.replace(/^min|^m/, '');
  }
  // Normalize display: -5 → ♭5, -9 → ♭9 for readability
  displaySuffix = displaySuffix.replace(/-(\d)/g, '♭$1');
  // M7/Maj7 → △7
  displaySuffix = displaySuffix.replace(/^maj7|^Maj7|^M7/, '△7');
  displaySuffix = displaySuffix.replace(/^maj9|^Maj9|^M9/, '△9');

  let result = degree.accidental + roman + displaySuffix;

  // Convert bass note to degree for slash chords
  if (bassNote) {
    try {
      const bassIdx = noteToIndex(bassNote);
      const bassDegree = noteToDegree(bassIdx, rootIdx, intervals);
      if (bassDegree) {
        const bassRoman = ROMAN_UPPER[bassDegree.degreeIdx];
        result += '/' + bassDegree.accidental + bassRoman;
      } else {
        result += '/' + bassNote;
      }
    } catch {
      result += '/' + bassNote;
    }
  }

  return result;
};

/**
 * Convert a pattern to real chords in rechord notation for a given key.
 * Returns "| C | G | Am | Em | F | C | F | G |"
 */
export const getPatternChords = (pattern: ChordPattern, key: string): string => {
  const chords = pattern.degrees.map(d => degreeToChord(d, key));
  return '| ' + chords.join(' | ') + ' |';
};
