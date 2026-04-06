// drum-patterns.ts
// Drum rhythm pattern generator for GM channel 10 (0-indexed: channel 9)
// Pure functions only — no side effects, no audio playback.

// ── Types ──────────────────────────────────────────────

export interface MidiNote {
  midi: number;          // MIDI note number (0-127)
  startTick: number;     // absolute tick position
  durationTicks: number;
  velocity: number;      // 0-127
  channel: number;       // 0-indexed MIDI channel
}

export interface RhythmConfig {
  pattern: DrumPatternName;
  velocity?: number;     // base velocity 0-127, default 100
  humanize?: number;     // 0.0-1.0 timing+velocity variance, default 0
  swing?: number;        // 0.0-1.0 swing amount, default 0
}

export type DrumPatternName = '8beat' | '16beat' | 'bossa-nova' | 'jazz-ride';

// ── GM Drum Map ────────────────────────────────────────

export const GM_DRUM = {
  kick: 36,        // Bass Drum 1
  snare: 38,       // Acoustic Snare
  hatClosed: 42,   // Closed Hi-Hat
  hatOpen: 46,     // Open Hi-Hat
  ride: 51,        // Ride Cymbal 1
  crash: 49,       // Crash Cymbal 1
  tom1: 50,        // High Tom
  tom2: 47,        // Low-Mid Tom
  tom3: 43,        // Low Tom
  rimshot: 37,     // Side Stick
} as const;

type DrumName = keyof typeof GM_DRUM;

// ── Drum Pattern Definitions ───────────────────────────

interface DrumHit {
  tickOffset: number;      // tick offset within one beat (0 .. ticksPerBeat-1)
  drum: DrumName;
  velocityScale: number;   // 0.0-1.0 relative to base velocity
}

interface DrumBeatPattern {
  /** Hits that apply to every beat by default */
  hitsPerBeat: DrumHit[];
  /** Override hits for specific beat numbers (0-indexed within bar) */
  beatOverrides?: Record<number, DrumHit[]>;
}

const TICKS_PER_QUARTER = 480;

// ── Pattern: 8beat ─────────────────────────────────────
// Hat:   x-x-x-x-  (8th notes on every beat: 2 per beat)
// Snare:     x       x    (beats 1, 3 = 0-indexed)
// Kick:  x       x        (beats 0, 2)

function make8beat(): DrumBeatPattern {
  const eighth = TICKS_PER_QUARTER / 2; // 240
  const hatDefault: DrumHit[] = [
    { tickOffset: 0, drum: 'hatClosed', velocityScale: 0.8 },
    { tickOffset: eighth, drum: 'hatClosed', velocityScale: 0.6 },
  ];
  return {
    hitsPerBeat: hatDefault,
    beatOverrides: {
      0: [
        ...hatDefault,
        { tickOffset: 0, drum: 'kick', velocityScale: 1.0 },
      ],
      1: [
        ...hatDefault,
        { tickOffset: 0, drum: 'snare', velocityScale: 0.9 },
      ],
      2: [
        ...hatDefault,
        { tickOffset: 0, drum: 'kick', velocityScale: 0.95 },
      ],
      3: [
        ...hatDefault,
        { tickOffset: 0, drum: 'snare', velocityScale: 0.9 },
      ],
    },
  };
}

// ── Pattern: 16beat ────────────────────────────────────
// Hat:   xxxxxxxxxxxxxxxx  (16th notes: 4 per beat)
// Snare:     x       x    (beats 1, 3)
// Kick:  x--x    x--x     (beat 0 on 1st+4th 16th, beat 2 on 1st+4th 16th)

function make16beat(): DrumBeatPattern {
  const sixteenth = TICKS_PER_QUARTER / 4; // 120
  const hatDefault: DrumHit[] = [
    { tickOffset: 0, drum: 'hatClosed', velocityScale: 0.8 },
    { tickOffset: sixteenth, drum: 'hatClosed', velocityScale: 0.5 },
    { tickOffset: sixteenth * 2, drum: 'hatClosed', velocityScale: 0.6 },
    { tickOffset: sixteenth * 3, drum: 'hatClosed', velocityScale: 0.5 },
  ];
  return {
    hitsPerBeat: hatDefault,
    beatOverrides: {
      0: [
        ...hatDefault,
        { tickOffset: 0, drum: 'kick', velocityScale: 1.0 },
        { tickOffset: sixteenth * 3, drum: 'kick', velocityScale: 0.7 },
      ],
      1: [
        ...hatDefault,
        { tickOffset: 0, drum: 'snare', velocityScale: 0.9 },
      ],
      2: [
        ...hatDefault,
        { tickOffset: 0, drum: 'kick', velocityScale: 0.95 },
        { tickOffset: sixteenth * 3, drum: 'kick', velocityScale: 0.7 },
      ],
      3: [
        ...hatDefault,
        { tickOffset: 0, drum: 'snare', velocityScale: 0.9 },
      ],
    },
  };
}

// ── Pattern: bossa-nova ────────────────────────────────
// Ride:    dotted-8th feel across bar (cross-rhythm)
// Kick:    bass pattern syncopated
// Rimshot: cross-stick on beat 1 (0-indexed)
// Expressed per beat with overrides for the 4-beat bar.

function makeBossaNova(): DrumBeatPattern {
  const eighth = TICKS_PER_QUARTER / 2; // 240
  const sixteenth = TICKS_PER_QUARTER / 4; // 120
  // Ride: dotted-8th = every 3 sixteenths (360 ticks).
  // Over 4 beats (1920 ticks): positions 0, 360, 720, 1080, 1440
  // Per-beat breakdown:
  //   beat 0: 0, 360
  //   beat 1: 240 (=720-480), but we store offset within beat
  //   beat 2: 0 (=960-960), 360
  //   beat 3: 240 (=1680-1440)
  // Simpler approach: just define per beat explicitly.
  return {
    hitsPerBeat: [],
    beatOverrides: {
      0: [
        { tickOffset: 0, drum: 'ride', velocityScale: 0.8 },
        { tickOffset: sixteenth * 3, drum: 'ride', velocityScale: 0.6 },
        { tickOffset: 0, drum: 'kick', velocityScale: 0.9 },
      ],
      1: [
        { tickOffset: eighth, drum: 'ride', velocityScale: 0.7 },
        { tickOffset: 0, drum: 'rimshot', velocityScale: 0.7 },
      ],
      2: [
        { tickOffset: 0, drum: 'ride', velocityScale: 0.8 },
        { tickOffset: sixteenth * 3, drum: 'ride', velocityScale: 0.6 },
        { tickOffset: eighth, drum: 'kick', velocityScale: 0.8 },
        { tickOffset: 0, drum: 'kick', velocityScale: 0.85 },
      ],
      3: [
        { tickOffset: eighth, drum: 'ride', velocityScale: 0.7 },
        { tickOffset: 0, drum: 'kick', velocityScale: 0.7 },
      ],
    },
  };
}

// ── Pattern: jazz-ride ─────────────────────────────────
// Ride: swing triplet pattern (1 & a of each beat = quarter + triplet skip)
// Kick: feathered on beats 0, 2 (soft)
// Hat:  on beats 1, 3 (foot hi-hat)

function makeJazzRide(): DrumBeatPattern {
  const triplet = Math.round(TICKS_PER_QUARTER / 3); // 160
  // Swing ride: hit on beat start + 3rd triplet partial (skip-beat)
  return {
    hitsPerBeat: [
      { tickOffset: 0, drum: 'ride', velocityScale: 0.85 },
      { tickOffset: triplet * 2, drum: 'ride', velocityScale: 0.6 },
    ],
    beatOverrides: {
      0: [
        { tickOffset: 0, drum: 'ride', velocityScale: 0.9 },
        { tickOffset: triplet * 2, drum: 'ride', velocityScale: 0.6 },
        { tickOffset: 0, drum: 'kick', velocityScale: 0.35 },
      ],
      1: [
        { tickOffset: 0, drum: 'ride', velocityScale: 0.8 },
        { tickOffset: triplet * 2, drum: 'ride', velocityScale: 0.6 },
        { tickOffset: 0, drum: 'hatClosed', velocityScale: 0.5 },
      ],
      2: [
        { tickOffset: 0, drum: 'ride', velocityScale: 0.85 },
        { tickOffset: triplet * 2, drum: 'ride', velocityScale: 0.6 },
        { tickOffset: 0, drum: 'kick', velocityScale: 0.35 },
      ],
      3: [
        { tickOffset: 0, drum: 'ride', velocityScale: 0.8 },
        { tickOffset: triplet * 2, drum: 'ride', velocityScale: 0.6 },
        { tickOffset: 0, drum: 'hatClosed', velocityScale: 0.5 },
      ],
    },
  };
}

// ── Pattern registry ───────────────────────────────────

const DRUM_PATTERNS: Record<DrumPatternName, () => DrumBeatPattern> = {
  '8beat': make8beat,
  '16beat': make16beat,
  'bossa-nova': makeBossaNova,
  'jazz-ride': makeJazzRide,
};

// ── Post-processing ────────────────────────────────────

/** Deterministic pseudo-random from seed (simple LCG). */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/** Apply humanize (timing + velocity jitter) and swing to notes. Pure. */
function postProcess(
  notes: MidiNote[],
  config: RhythmConfig,
  ticksPerBeat: number,
): MidiNote[] {
  const humanize = config.humanize ?? 0;
  const swing = config.swing ?? 0;

  if (humanize === 0 && swing === 0) return notes;

  const maxTimingJitter = Math.round(ticksPerBeat * 0.03 * humanize); // up to 3% of beat
  const maxVelocityJitter = Math.round(12 * humanize); // up to +/-12

  // Use startTick of first note as seed for determinism
  const firstTick = notes.length > 0 ? notes[0].startTick : 0;
  const rng = seededRandom(firstTick + (config.pattern.charCodeAt(0) << 16));

  return notes.map(note => {
    let { startTick, velocity } = note;

    // Swing: delay off-beat 8th notes (odd 8th positions)
    if (swing > 0) {
      const posInBeat = startTick % ticksPerBeat;
      const eighth = ticksPerBeat / 2;
      // If near the off-beat 8th position
      if (Math.abs(posInBeat - eighth) < 10) {
        startTick += Math.round(eighth * swing * 0.33);
      }
    }

    // Humanize timing
    if (humanize > 0 && maxTimingJitter > 0) {
      const jitter = Math.round((rng() - 0.5) * 2 * maxTimingJitter);
      startTick = Math.max(0, startTick + jitter);
    }

    // Humanize velocity
    if (humanize > 0 && maxVelocityJitter > 0) {
      const jitter = Math.round((rng() - 0.5) * 2 * maxVelocityJitter);
      velocity = Math.max(1, Math.min(127, velocity + jitter));
    }

    return { ...note, startTick, velocity };
  });
}

// ── Main generator ─────────────────────────────────────

/**
 * Generate a drum rhythm pattern as MIDI notes.
 *
 * Pure function: no side effects, deterministic for same inputs
 * (when humanize seed is based on startBar).
 *
 * @param config - Pattern name + optional velocity/humanize/swing
 * @param bpm - Tempo (informational, not used in tick calculation)
 * @param timeSignature - e.g. { beats: 4, beatValue: 4 }
 * @param startBar - 0-indexed first bar number
 * @param barCount - Number of bars to generate
 * @param channel - MIDI channel (0-indexed), typically 9 for GM drums
 * @returns Array of MidiNote with GM drum MIDI numbers
 */
export function generateDrumRhythm(
  config: RhythmConfig,
  _bpm: number,
  timeSignature: { beats: number; beatValue: number },
  startBar: number,
  barCount: number,
  channel: number = 9,
): MidiNote[] {
  const patternFactory = DRUM_PATTERNS[config.pattern];
  if (!patternFactory) {
    throw new Error(`Unknown drum pattern: ${config.pattern}`);
  }

  const pattern = patternFactory();
  const beatsPerBar = timeSignature.beats;
  const ticksPerBeat = TICKS_PER_QUARTER; // assumes beatValue=4
  const ticksPerBar = ticksPerBeat * beatsPerBar;
  const baseVelocity = config.velocity ?? 100;

  // Drum note duration is short (non-sustaining percussion)
  const drumDuration = Math.round(ticksPerBeat / 4); // 16th note length

  const notes: MidiNote[] = [];

  for (let bar = 0; bar < barCount; bar++) {
    const barAbsolute = startBar + bar;
    const barStartTick = barAbsolute * ticksPerBar;

    for (let beat = 0; beat < beatsPerBar; beat++) {
      const beatStartTick = barStartTick + beat * ticksPerBeat;

      // Use beat override if available, otherwise default hits
      const hits = pattern.beatOverrides?.[beat] ?? pattern.hitsPerBeat;

      for (const hit of hits) {
        const velocity = Math.max(1, Math.min(127,
          Math.round(baseVelocity * hit.velocityScale),
        ));

        notes.push({
          midi: GM_DRUM[hit.drum],
          startTick: beatStartTick + hit.tickOffset,
          durationTicks: drumDuration,
          velocity,
          channel,
        });
      }
    }
  }

  return postProcess(notes, config, ticksPerBeat);
}

/**
 * Get list of available drum pattern names.
 */
export function getDrumPatternNames(): DrumPatternName[] {
  return Object.keys(DRUM_PATTERNS) as DrumPatternName[];
}
