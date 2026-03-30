// chord-player.ts
// Tone.js chord progression player

import * as Tone from 'tone';
import type { ParsedBar, BarEntry, ParsedChord } from './chord-parser';
import { resolveRepeats } from './chord-parser';

// ── Types ──────────────────────────────────────────────

export interface TimeSignature {
  beats: number;      // numerator (e.g. 4)
  beatValue: number;  // denominator (e.g. 4)
}

export interface PlayerConfig {
  bpm: number;
  timeSignature: TimeSignature;
}

export interface ScheduledNote {
  time: number;   // seconds from start
  notes: string[];
  duration: number; // seconds
}

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface PlayerCallbacks {
  onStateChange?: (state: PlayerState) => void;
  onProgress?: (currentTime: number, totalDuration: number) => void;
  onBarChange?: (barIndex: number) => void;
}

// ── Note mapping ───────────────────────────────────────

// Interval semitones from root for each quality
const QUALITY_INTERVALS: Record<string, number[]> = {
  // Triads
  '':       [0, 4, 7],
  'M':      [0, 4, 7],
  'maj':    [0, 4, 7],
  'm':      [0, 3, 7],
  'min':    [0, 3, 7],
  'dim':    [0, 3, 6],
  'aug':    [0, 4, 8],
  'sus4':   [0, 5, 7],
  'sus2':   [0, 2, 7],

  // Sevenths
  '7':      [0, 4, 7, 10],
  'M7':     [0, 4, 7, 11],
  'maj7':   [0, 4, 7, 11],
  'Maj7':   [0, 4, 7, 11],
  'm7':     [0, 3, 7, 10],
  'min7':   [0, 3, 7, 10],
  'mM7':    [0, 3, 7, 11],
  'dim7':   [0, 3, 6, 9],
  'm7b5':   [0, 3, 6, 10],
  'aug7':   [0, 4, 8, 10],

  // Extended
  '9':      [0, 4, 7, 10, 14],
  'M9':     [0, 4, 7, 11, 14],
  'maj9':   [0, 4, 7, 11, 14],
  'm9':     [0, 3, 7, 10, 14],
  '11':     [0, 4, 7, 10, 14, 17],
  'm11':    [0, 3, 7, 10, 14, 17],
  '13':     [0, 4, 7, 10, 14, 21],
  'm13':    [0, 3, 7, 10, 14, 21],

  // Add chords
  'add9':   [0, 4, 7, 14],
  'madd9':  [0, 3, 7, 14],
  'add11':  [0, 4, 7, 17],
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],

  // Suspended sevenths
  '7sus4':  [0, 5, 7, 10],
  '7sus2':  [0, 2, 7, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Enharmonic mapping for flats → sharps (for MIDI calculation)
const ENHARMONIC: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Fb': 'E',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
  'Cb': 'B',
};

function rootToMidi(root: string, octave: number): number {
  const normalized = ENHARMONIC[root] ?? root;
  const noteIndex = NOTE_NAMES.indexOf(normalized);
  if (noteIndex === -1) throw new Error(`Unknown root: ${root}`);
  return noteIndex + (octave + 1) * 12; // MIDI: C4 = 60
}

function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

/**
 * Convert a parsed chord to an array of note names for Tone.js.
 * Voicing: root at octave 3, upper notes stacked above.
 * For slash chords, the bass note is placed at octave 2.
 */
export function chordToNotes(chord: ParsedChord): string[] {
  const intervals = QUALITY_INTERVALS[chord.quality];
  if (!intervals) {
    // Fallback: treat as major triad
    return chordToNotes({ ...chord, quality: '' });
  }

  const rootMidi = rootToMidi(chord.root, 3);
  const notes = intervals.map((interval) => midiToNoteName(rootMidi + interval));

  if (chord.bass) {
    const bassMidi = rootToMidi(chord.bass, 2);
    // Ensure bass is below the root
    notes.unshift(midiToNoteName(bassMidi));
  }

  return notes;
}

// ── Scheduling ─────────────────────────────────────────

/**
 * Calculate the duration of one beat in seconds.
 */
function beatDuration(bpm: number): number {
  return 60 / bpm;
}

/**
 * Calculate the duration of one bar in seconds.
 */
function barDuration(config: PlayerConfig): number {
  return beatDuration(config.bpm) * config.timeSignature.beats;
}

/**
 * Build a schedule of notes from parsed bars.
 * Each bar is divided equally among its entries.
 * Returns scheduled notes with absolute times.
 */
export function buildSchedule(
  bars: ParsedBar[],
  config: PlayerConfig,
): ScheduledNote[] {
  const resolved = resolveRepeats(bars);
  const barDur = barDuration(config);
  const schedule: ScheduledNote[] = [];

  let lastChordNotes: string[] | null = null;

  for (let barIdx = 0; barIdx < resolved.length; barIdx++) {
    const bar = resolved[barIdx];
    const barStart = barIdx * barDur;
    const entryCount = bar.entries.length || 1;
    const entryDur = barDur / entryCount;

    for (let entryIdx = 0; entryIdx < bar.entries.length; entryIdx++) {
      const entry = bar.entries[entryIdx];
      const time = barStart + entryIdx * entryDur;

      const notes = entryToNotes(entry, lastChordNotes);
      if (notes) {
        schedule.push({ time, notes, duration: entryDur * 0.9 });
        if (entry.type === 'chord') {
          lastChordNotes = notes;
        }
      }
    }
  }

  return schedule;
}

function entryToNotes(entry: BarEntry, lastChordNotes: string[] | null): string[] | null {
  switch (entry.type) {
    case 'chord':
      return chordToNotes(entry.chord);
    case 'sustain':
      return lastChordNotes;
    case 'repeat':
      // Should already be resolved, but fallback
      return lastChordNotes;
    case 'rest':
      return null;
  }
}

// ── Player class ───────────────────────────────────────

export class ChordPlayer {
  private synth: Tone.PolySynth | null = null;
  private scheduledEvents: number[] = [];
  private _state: PlayerState = 'stopped';
  private _totalDuration = 0;
  private _config: PlayerConfig;
  private _callbacks: PlayerCallbacks;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private startOffset = 0;

  constructor(config: PlayerConfig, callbacks: PlayerCallbacks = {}) {
    this._config = config;
    this._callbacks = callbacks;
  }

  get state(): PlayerState {
    return this._state;
  }

  get totalDuration(): number {
    return this._totalDuration;
  }

  get currentTime(): number {
    if (this._state === 'stopped') return 0;
    return Tone.getTransport().seconds;
  }

  private setState(state: PlayerState): void {
    this._state = state;
    this._callbacks.onStateChange?.(state);
  }

  private ensureSynth(): Tone.PolySynth {
    if (!this.synth) {
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.02,
          decay: 0.3,
          sustain: 0.4,
          release: 0.8,
        },
        volume: -8,
      }).toDestination();
    }
    return this.synth;
  }

  /**
   * Load bars into the player and schedule playback.
   * Call this before play(). Can be called again to reload.
   */
  load(bars: ParsedBar[]): void {
    this.clearSchedule();

    const schedule = buildSchedule(bars, this._config);
    const transport = Tone.getTransport();
    transport.bpm.value = this._config.bpm;
    transport.timeSignature = this._config.timeSignature.beats;

    const synth = this.ensureSynth();
    const barDur = barDuration(this._config);

    for (const event of schedule) {
      const id = transport.schedule((time) => {
        synth.triggerAttackRelease(event.notes, event.duration, time);
      }, event.time);
      this.scheduledEvents.push(id);
    }

    // Track bar changes
    const resolved = resolveRepeats(bars);
    for (let i = 0; i < resolved.length; i++) {
      const id = transport.schedule(() => {
        this._callbacks.onBarChange?.(i);
      }, i * barDur);
      this.scheduledEvents.push(id);
    }

    this._totalDuration = resolved.length * barDur;

    // Auto-stop at end
    const stopId = transport.schedule(() => {
      this.stop();
    }, this._totalDuration);
    this.scheduledEvents.push(stopId);
  }

  /**
   * Load multiple sets of bars (e.g., from multiple posts) and play them
   * sequentially as one continuous progression.
   */
  loadMultiple(barSets: ParsedBar[][]): void {
    let barNumber = 1;
    const merged: ParsedBar[] = [];

    for (const bars of barSets) {
      for (const bar of bars) {
        merged.push({ ...bar, barNumber });
        barNumber++;
      }
    }

    this.load(merged);
  }

  async play(): Promise<void> {
    await Tone.start(); // Required: user gesture unlocks audio context
    const transport = Tone.getTransport();

    if (this._state === 'paused') {
      transport.start();
      this.setState('playing');
      this.startProgressTracking();
      return;
    }

    transport.stop();
    transport.position = 0;
    transport.start();
    this.setState('playing');
    this.startProgressTracking();
  }

  pause(): void {
    if (this._state !== 'playing') return;
    Tone.getTransport().pause();
    this.setState('paused');
    this.stopProgressTracking();
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    this.synth?.releaseAll();
    this.setState('stopped');
    this.stopProgressTracking();
    this._callbacks.onProgress?.(0, this._totalDuration);
  }

  seekTo(seconds: number): void {
    const transport = Tone.getTransport();
    const clamped = Math.max(0, Math.min(seconds, this._totalDuration));
    transport.seconds = clamped;
    this._callbacks.onProgress?.(clamped, this._totalDuration);
  }

  /**
   * Seek to a specific bar (0-based index).
   */
  seekToBar(barIndex: number): void {
    const barDur = barDuration(this._config);
    this.seekTo(barIndex * barDur);
  }

  updateConfig(config: Partial<PlayerConfig>): void {
    if (config.bpm !== undefined) {
      this._config.bpm = config.bpm;
      Tone.getTransport().bpm.value = config.bpm;
    }
    if (config.timeSignature !== undefined) {
      this._config.timeSignature = config.timeSignature;
      Tone.getTransport().timeSignature = config.timeSignature.beats;
    }
  }

  dispose(): void {
    this.stop();
    this.clearSchedule();
    this.synth?.dispose();
    this.synth = null;
  }

  private clearSchedule(): void {
    const transport = Tone.getTransport();
    for (const id of this.scheduledEvents) {
      transport.clear(id);
    }
    this.scheduledEvents = [];
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressInterval = setInterval(() => {
      if (this._state === 'playing') {
        this._callbacks.onProgress?.(
          Tone.getTransport().seconds,
          this._totalDuration,
        );
      }
    }, 50); // ~20fps updates
  }

  private stopProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
}
