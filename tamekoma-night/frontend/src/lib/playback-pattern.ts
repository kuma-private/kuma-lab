// playback-pattern.ts
// Accompaniment pattern engine for chord playback

// Local type to avoid importing chord-player (which depends on Tone.js)
interface ScheduledNote {
  time: number;
  notes: string[];
  duration: number;
}

// ── Types ──────────────────────────────────────────────

/** Which chord tones to play for a given hit */
export type NoteSelector =
  | 'all'       // all chord tones simultaneously
  | 'bass'      // lowest note only
  | 'upper'     // all notes except bass
  | number      // specific note index from bottom (0=bass)
  | number[];   // specific indices

/** A single rhythmic event within one beat */
export interface PatternHit {
  tickOffset: number;       // 0-479 within one beat (480 ticks/quarter)
  noteSelector: NoteSelector;
  velocityScale: number;    // 0.0-1.0 multiplier
  durationTicks: number;
}

/** A playback pattern definition */
export interface PlaybackPattern {
  id: string;
  nameJa: string;
  nameEn: string;
  hitsPerBeat: PatternHit[];
  beatVariations?: Record<number, PatternHit[]>;
}

// ── Note selection helpers ─────────────────────────────

function resolveNotes(notes: string[], selector: NoteSelector): string[] {
  if (notes.length === 0) return [];
  if (selector === 'all') return notes;
  if (selector === 'bass') return [notes[0]];
  if (selector === 'upper') return notes.length > 1 ? notes.slice(1) : notes;
  if (typeof selector === 'number') {
    return [notes[selector % notes.length]];
  }
  // number[]
  return selector.map(i => notes[i % notes.length]);
}

// ── Preset Patterns ────────────────────────────────────

const TICKS_PER_BEAT = 480;

export const PRESET_PATTERNS: Record<string, PlaybackPattern> = {
  block: {
    id: 'block',
    nameJa: 'ブロック',
    nameEn: 'Block',
    hitsPerBeat: [
      { tickOffset: 0, noteSelector: 'all', velocityScale: 1.0, durationTicks: Math.floor(TICKS_PER_BEAT * 0.9) },
    ],
  },

  arpUp: {
    id: 'arpUp',
    nameJa: 'アルペジオ ↑',
    nameEn: 'Arpeggio Up',
    hitsPerBeat: [
      { tickOffset: 0,   noteSelector: 0, velocityScale: 1.0,  durationTicks: 100 },
      { tickOffset: 120, noteSelector: 1, velocityScale: 0.85, durationTicks: 100 },
      { tickOffset: 240, noteSelector: 2, velocityScale: 0.85, durationTicks: 100 },
      { tickOffset: 360, noteSelector: 3, velocityScale: 0.80, durationTicks: 100 },
    ],
  },

  arpDown: {
    id: 'arpDown',
    nameJa: 'アルペジオ ↓',
    nameEn: 'Arpeggio Down',
    hitsPerBeat: [
      { tickOffset: 0,   noteSelector: 3, velocityScale: 1.0,  durationTicks: 100 },
      { tickOffset: 120, noteSelector: 2, velocityScale: 0.85, durationTicks: 100 },
      { tickOffset: 240, noteSelector: 1, velocityScale: 0.85, durationTicks: 100 },
      { tickOffset: 360, noteSelector: 0, velocityScale: 0.80, durationTicks: 100 },
    ],
  },

  fingerpick: {
    id: 'fingerpick',
    nameJa: 'フィンガーピック',
    nameEn: 'Fingerpick',
    hitsPerBeat: [
      { tickOffset: 0,   noteSelector: 'bass',  velocityScale: 1.0,  durationTicks: 200 },
      { tickOffset: 240, noteSelector: 2,        velocityScale: 0.75, durationTicks: 200 },
    ],
    beatVariations: {
      1: [
        { tickOffset: 0,   noteSelector: 'bass',  velocityScale: 0.9,  durationTicks: 200 },
        { tickOffset: 240, noteSelector: 1,        velocityScale: 0.75, durationTicks: 200 },
      ],
      3: [
        { tickOffset: 0,   noteSelector: 'bass',  velocityScale: 0.9,  durationTicks: 200 },
        { tickOffset: 240, noteSelector: 1,        velocityScale: 0.75, durationTicks: 200 },
      ],
    },
  },

  bossaNova: {
    id: 'bossaNova',
    nameJa: 'ボサノバ',
    nameEn: 'Bossa Nova',
    hitsPerBeat: [
      { tickOffset: 0,   noteSelector: 'bass',  velocityScale: 1.0,  durationTicks: 200 },
      { tickOffset: 240, noteSelector: 'upper',  velocityScale: 0.7,  durationTicks: 200 },
    ],
    beatVariations: {
      1: [
        { tickOffset: 0,   noteSelector: 'upper', velocityScale: 0.7,  durationTicks: 200 },
        { tickOffset: 240, noteSelector: 'bass',  velocityScale: 0.9,  durationTicks: 200 },
      ],
      3: [
        { tickOffset: 0,   noteSelector: 'upper', velocityScale: 0.7,  durationTicks: 200 },
        { tickOffset: 240, noteSelector: 'bass',  velocityScale: 0.9,  durationTicks: 200 },
      ],
    },
  },
};

export const PATTERN_OPTIONS = Object.values(PRESET_PATTERNS);

// ── Pattern Engine ─────────────────────────────────────

/**
 * Apply a pattern to a chord, producing multiple ScheduledNote events.
 * Used by chord-player at playback time (non-destructive).
 *
 * @param chordNotes - Voiced note names from chordToNotes(), sorted low→high
 * @param entryStartTime - Absolute start time in seconds
 * @param entryBeats - How many beats this entry spans
 * @param beatDurationSec - Duration of one beat in seconds
 * @param pattern - The pattern to apply
 */
export function applyPatternToSchedule(
  chordNotes: string[],
  entryStartTime: number,
  entryBeats: number,
  beatDurationSec: number,
  pattern: PlaybackPattern,
): ScheduledNote[] {
  if (chordNotes.length === 0) return [];

  const schedule: ScheduledNote[] = [];
  const ticksPerSec = TICKS_PER_BEAT / beatDurationSec;

  for (let beat = 0; beat < entryBeats; beat++) {
    const beatStartTime = entryStartTime + beat * beatDurationSec;

    // Use beat variation if available, otherwise default
    const hits = pattern.beatVariations?.[beat] ?? pattern.hitsPerBeat;

    for (const hit of hits) {
      const notes = resolveNotes(chordNotes, hit.noteSelector);
      if (notes.length === 0) continue;

      const offsetSec = hit.tickOffset / ticksPerSec;
      const durationSec = hit.durationTicks / ticksPerSec;

      schedule.push({
        time: beatStartTime + offsetSec,
        notes,
        duration: durationSec,
      });
    }
  }

  return schedule;
}
