// chord-degree.ts
// Convert chord names to degree notation (e.g., Am7 → vi7 in C Major)
// Extracted from chord-suggest.ts for ChordTimeline degree display

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
  'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

const noteToIndex = (note: string): number => {
  const normalized = ENHARMONIC_TO_SHARP[note] ?? note;
  const idx = NOTE_NAMES.indexOf(normalized);
  if (idx === -1) throw new Error(`Unknown note: ${note}`);
  return idx;
};

const parseKeyString = (key: string): { root: string; isMinor: boolean } => {
  const trimmed = key.trim();
  const isMinor = /\bminor\b/i.test(trimmed);
  const rootStr = trimmed.replace(/\s*(major|minor|dorian|mixolydian|lydian|phrygian|locrian|aeolian|ionian)$/i, '').trim();
  return { root: rootStr, isMinor };
};

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

/**
 * Convert a chord name to degree notation in the given key.
 * In C Major: Am7 → vi7, Dm7 → ii7, G7 → V7, Cmaj7 → I△7
 */
export const chordToDegree = (chord: string, key: string): string => {
  const { root, isMinor } = parseKeyString(key);
  const rootIdx = noteToIndex(root);
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;

  const slashMatch = chord.match(/^(.+)\/([A-G][#b]?)$/);
  const mainChord = slashMatch ? slashMatch[1] : chord;
  const bassNote = slashMatch ? slashMatch[2] : null;

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

  const isMinorChord = /^m($|[^a])/.test(qualitySuffix) || qualitySuffix.startsWith('min');
  const isDimChord = qualitySuffix.startsWith('dim');

  const roman = (isMinorChord || isDimChord)
    ? ROMAN_LOWER[degree.degreeIdx]
    : ROMAN_UPPER[degree.degreeIdx];

  let displaySuffix = qualitySuffix;
  if (isMinorChord) {
    displaySuffix = qualitySuffix.replace(/^min|^m/, '');
  }
  displaySuffix = displaySuffix.replace(/-(\d)/g, '♭$1');
  displaySuffix = displaySuffix.replace(/^maj7|^Maj7|^M7/, '△7');
  displaySuffix = displaySuffix.replace(/^maj9|^Maj9|^M9/, '△9');

  let result = degree.accidental + roman + displaySuffix;

  if (bassNote) {
    try {
      const bassIdx = noteToIndex(bassNote);
      const bassDegree = noteToDegree(bassIdx, rootIdx, intervals);
      if (bassDegree) {
        result += '/' + bassDegree.accidental + ROMAN_UPPER[bassDegree.degreeIdx];
      } else {
        result += '/' + bassNote;
      }
    } catch {
      result += '/' + bassNote;
    }
  }

  return result;
};
