// chord-parser.ts
// rechord-style chord progression parser

// ── Types ──────────────────────────────────────────────

export type ChordRoot =
  | 'C' | 'C#' | 'Db'
  | 'D' | 'D#' | 'Eb'
  | 'E'
  | 'F' | 'F#' | 'Gb'
  | 'G' | 'G#' | 'Ab'
  | 'A' | 'A#' | 'Bb'
  | 'B';

export interface ParsedChord {
  /** Raw chord string, e.g. "Am7", "F#dim", "C/E" */
  raw: string;
  /** Root note for color mapping, e.g. "A", "F#", "C" */
  root: ChordRoot;
  /** Quality portion, e.g. "m7", "dim", "maj7" */
  quality: string;
  /** Bass note for slash chords, e.g. "E" in "C/E" */
  bass: ChordRoot | null;
}

export type BarEntry =
  | { type: 'chord'; chord: ParsedChord }
  | { type: 'repeat' }   // %
  | { type: 'rest' }     // _
  | { type: 'sustain' }; // =

export interface ParsedBar {
  /** 1-based bar number */
  barNumber: number;
  entries: BarEntry[];
}

export interface ParseResult {
  bars: ParsedBar[];
  comments: string[];
}

// ── Root extraction ────────────────────────────────────

const ROOT_PATTERN = /^([A-G])([#b]?)/;

/**
 * Extract the root note from a chord string.
 * "Am7" → "A", "F#m" → "F#", "Bbmaj7" → "Bb", "Db9" → "Db"
 */
export function extractRoot(chord: string): ChordRoot {
  const m = chord.match(ROOT_PATTERN);
  if (!m) throw new Error(`Invalid chord: ${chord}`);
  return (m[1] + m[2]) as ChordRoot;
}

// ── Quality extraction ─────────────────────────────────

const QUALITY_PATTERN = /^[A-G][#b]?(.*?)(?:\/[A-G][#b]?)?$/;

/**
 * Extract the quality portion of a chord string.
 * "Am7" → "m7", "Cmaj7" → "maj7", "G" → "", "Fadd9" → "add9"
 */
export function extractQuality(chord: string): string {
  const m = chord.match(QUALITY_PATTERN);
  return m ? m[1] : '';
}

// ── Slash chord bass extraction ────────────────────────

const BASS_PATTERN = /\/([A-G][#b]?)$/;

/**
 * Extract bass note from a slash chord.
 * "C/E" → "E", "Am7/G" → "G", "Dm" → null
 */
export function extractBass(chord: string): ChordRoot | null {
  const m = chord.match(BASS_PATTERN);
  return m ? (m[1] as ChordRoot) : null;
}

// ── Single chord parsing ───────────────────────────────

export function parseChord(raw: string): ParsedChord {
  const root = extractRoot(raw);
  const quality = extractQuality(raw);
  const bass = extractBass(raw);
  return { raw, root, quality, bass };
}

// ── Token parsing ──────────────────────────────────────

function parseToken(token: string): BarEntry {
  if (token === '%') return { type: 'repeat' };
  if (token === '_') return { type: 'rest' };
  if (token === '=') return { type: 'sustain' };
  return { type: 'chord', chord: parseChord(token) };
}

// ── Full progression parsing ───────────────────────────

/**
 * Parse a rechord-style chord progression string.
 *
 * Format:
 *   | Am7 Dm7 | G7 | Cmaj7 |
 *   | % |                      ← repeat previous bar
 *   | _ Am7 | G7 = |           ← rest then chord; sustain G7
 *   # this is a comment
 *   | C/E | F#dim |            ← slash chord, sharp root
 *
 * Lines starting with # are treated as comments.
 * Bars are delimited by |. Whitespace within bars separates entries.
 */
export function parseProgression(input: string): ParseResult {
  const comments: string[] = [];
  const bars: ParsedBar[] = [];

  // Collect all lines, filter comments
  const lines = input.split('\n');
  const contentParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      comments.push(trimmed.slice(1).trim());
    } else if (trimmed) {
      contentParts.push(trimmed);
    }
  }

  // Join all content lines and split by |
  const joined = contentParts.join(' ');
  const segments = joined.split('|');

  let barNumber = 1;
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const entries: BarEntry[] = tokens.map(parseToken);

    bars.push({ barNumber, entries });
    barNumber++;
  }

  return { bars, comments };
}

// ── Repeat resolution ──────────────────────────────────

/**
 * Resolve % repeat markers in parsed bars.
 * A bar with a single % entry copies entries from the previous bar.
 * Returns a new array; does not mutate the input.
 */
export function resolveRepeats(bars: ParsedBar[]): ParsedBar[] {
  const resolved: ParsedBar[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const isRepeat =
      bar.entries.length === 1 && bar.entries[0].type === 'repeat';

    if (isRepeat && resolved.length > 0) {
      const prev = resolved[resolved.length - 1];
      resolved.push({
        barNumber: bar.barNumber,
        entries: [...prev.entries],
      });
    } else {
      resolved.push({ ...bar, entries: [...bar.entries] });
    }
  }

  return resolved;
}

// ── Transpose ─────────────────────────────────────────

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

const transposeRoot = (root: string, semitones: number): string => {
  const normalized = ENHARMONIC_TO_SHARP[root] ?? root;
  const idx = PITCH_NAMES.indexOf(normalized);
  if (idx === -1) return root;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return PITCH_NAMES[newIdx];
};

const CHORD_TOKEN_PATTERN = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/;

const transposeToken = (token: string, semitones: number): string => {
  const m = token.match(CHORD_TOKEN_PATTERN);
  if (!m) return token;
  const [, root, quality, bass] = m;
  const newRoot = transposeRoot(root, semitones);
  const newBass = bass ? transposeRoot(bass, semitones) : '';
  return newRoot + quality + (newBass ? '/' + newBass : '');
};

/**
 * Transpose all chords in a rechord-style input string by N semitones.
 * Comments, bar lines, and special tokens (%, _, =) are preserved.
 */
export const transpose = (input: string, semitones: number): string => {
  if (semitones === 0) return input;
  return input.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) return line;
    return line.split(/(\|)/).map(segment => {
      if (segment === '|') return segment;
      return segment.split(/(\s+)/).map(token => {
        if (!token.trim() || token === '%' || token === '_' || token === '=') return token;
        return transposeToken(token, semitones);
      }).join('');
    }).join('');
  }).join('\n');
};

// ── Serialization ──────────────────────────────────────

function entryToString(entry: BarEntry): string {
  switch (entry.type) {
    case 'chord': return entry.chord.raw;
    case 'repeat': return '%';
    case 'rest': return '_';
    case 'sustain': return '=';
  }
}

/**
 * Serialize parsed bars back to rechord notation.
 */
export function serialize(bars: ParsedBar[], comments: string[] = []): string {
  const parts: string[] = [];

  for (const comment of comments) {
    parts.push(`# ${comment}`);
  }

  const barStrs = bars.map(
    (bar) => bar.entries.map(entryToString).join(' ')
  );
  if (barStrs.length > 0) {
    parts.push('| ' + barStrs.join(' | ') + ' |');
  }

  return parts.join('\n');
}
