// chord-player.ts
// Tone.js chord progression player

import * as Tone from 'tone';
import type { ParsedBar, BarEntry, ParsedChord } from './chord-parser';
import { resolveRepeats, parseChord, parseProgression } from './chord-parser';

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
  onChordChange?: (chordName: string | null) => void;
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

  // Power chord
  '5':      [0, 7],

  // Altered tensions
  '7b9':    [0, 4, 7, 10, 13],
  '7#9':    [0, 4, 7, 10, 15],
  '7#11':   [0, 4, 7, 10, 18],
  '7b13':   [0, 4, 7, 10, 20],
  '7b5':    [0, 4, 6, 10],
  '7#5':    [0, 4, 8, 10],
  '7alt':   [0, 4, 8, 10, 13],

  // Augmented extended
  'aug9':   [0, 4, 8, 10, 14],
  'augM7':  [0, 4, 8, 11],
  'augmaj7':[0, 4, 8, 11],

  // Six-nine
  '69':     [0, 4, 7, 9, 14],
  'm69':    [0, 3, 7, 9, 14],

  // Minor-major seventh (alternate spellings)
  'mmaj7':  [0, 3, 7, 11],
  'm(maj7)':[0, 3, 7, 11],
  'mMaj7':  [0, 3, 7, 11],

  // Diminished extended
  'dim9':   [0, 3, 6, 9, 14],

  // Add chords (more)
  'add2':   [0, 2, 4, 7],
  'add4':   [0, 4, 5, 7],
  'madd11': [0, 3, 7, 17],

  // Dominant extended with alterations
  '9#11':   [0, 4, 7, 10, 14, 18],
  '9b5':    [0, 4, 6, 10, 14],
  '13b9':   [0, 4, 7, 10, 13, 21],
  'm7b9':   [0, 3, 7, 10, 13],

  // 13th extended
  'M13':    [0, 4, 7, 11, 14, 21],
  'maj13':  [0, 4, 7, 11, 14, 21],
  '13#11':  [0, 4, 7, 10, 18, 21],
  '13sus4': [0, 5, 7, 10, 14, 21],

  // 11th extended
  'M11':    [0, 4, 7, 11, 14, 17],
  'maj11':  [0, 4, 7, 11, 14, 17],
  '11b9':   [0, 4, 7, 10, 13, 17],

  // 9th extended
  'm9b5':   [0, 3, 6, 10, 14],
  'mM9':    [0, 3, 7, 11, 14],
  'mmaj9':  [0, 3, 7, 11, 14],
  '9sus4':  [0, 5, 7, 10, 14],

  // Omit chords (approximate voicing)
  'omit3':  [0, 7],
  'omit5':  [0, 4],
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
    throw new Error(`Unknown chord quality: "${chord.quality}" in "${chord.raw}"`);
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
      try {
        return chordToNotes(entry.chord);
      } catch (e) {
        console.error(`[ChordPlayer] ${e instanceof Error ? e.message : e}`);
        return null;
      }
    case 'sustain':
      return lastChordNotes;
    case 'repeat':
      return lastChordNotes;
    case 'rest':
      return null;
  }
}

// ── Standalone preview functions ──────────────────────

/**
 * Play a single chord for 0.5 seconds (preview).
 * Uses a disposable PolySynth to avoid interfering with the main player.
 */
export const playChordPreview = async (chordName: string): Promise<void> => {
  await Tone.start();
  const parsed = parseChord(chordName);
  const notes = chordToNotes(parsed);

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fmtriangle' as const, modulationType: 'sine' as const, modulationIndex: 2, harmonicity: 3.01 },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.8 },
    volume: -12,
  }).toDestination();

  synth.triggerAttackRelease(notes, 0.5);
  await new Promise<void>((resolve) => setTimeout(() => { synth.dispose(); resolve(); }, 800));
};

/**
 * Parse and play a selection of text as a chord progression.
 * Returns a promise that resolves when playback completes.
 */
export const playSelection = async (text: string, config: PlayerConfig): Promise<void> => {
  await Tone.start();
  const { bars } = parseProgression(text);
  if (bars.length === 0) return;

  const schedule = buildSchedule(bars, config);
  if (schedule.length === 0) return;

  const barDur = (60 / config.bpm) * config.timeSignature.beats;
  const resolved = resolveRepeats(bars);
  const totalDuration = resolved.length * barDur;

  const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.2 }).toDestination();
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fmtriangle' as const, modulationType: 'sine' as const, modulationIndex: 2, harmonicity: 3.01 },
    envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 1.0 },
    volume: -10,
  }).connect(reverb);

  const transport = Tone.getTransport();
  const ids: number[] = [];

  for (const event of schedule) {
    const id = transport.schedule((time) => {
      synth.triggerAttackRelease(event.notes, event.duration, time);
    }, '+' + event.time);
    ids.push(id);
  }

  return new Promise<void>((resolve) => {
    const stopId = transport.schedule(() => {
      for (const id of ids) transport.clear(id);
      transport.clear(stopId);
      synth.dispose();
      reverb.dispose();
      resolve();
    }, '+' + totalDuration);
    ids.push(stopId);

    if (transport.state !== 'started') {
      transport.start();
    }
  });
};

/**
 * Play a single note for preview (e.g. from piano keyboard).
 */
export const playNote = async (note: string): Promise<void> => {
  await Tone.start();
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' as const },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
    volume: -8,
  }).toDestination();
  synth.triggerAttackRelease(note, '8n');
  setTimeout(() => synth.dispose(), 1000);
};

// ── Keyboard synth (sustained attack/release) ────────

let _kbSynth: Tone.PolySynth | null = null;

const getKeyboardSynth = (): Tone.PolySynth => {
  if (!_kbSynth) {
    _kbSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' as const },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.6 },
      volume: -8,
    }).toDestination();
  }
  return _kbSynth;
};

export const keyboardAttack = async (notes: string[]): Promise<void> => {
  await Tone.start();
  const synth = getKeyboardSynth();
  synth.triggerAttack(notes);
};

export const keyboardRelease = (notes: string[]): void => {
  if (!_kbSynth) return;
  _kbSynth.triggerRelease(notes);
};

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
  private _loop = false;
  private _currentChord: string | null = null;
  private _bars: ParsedBar[] = [];

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
      // Piano-like sound: layered oscillators with harmonics + reverb
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.25 }).toDestination();
      const compressor = new Tone.Compressor(-20, 4).connect(reverb);

      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: 'fmtriangle',
          modulationType: 'sine',
          modulationIndex: 2,
          harmonicity: 3.01,
        },
        envelope: {
          attack: 0.005,
          decay: 0.6,
          sustain: 0.2,
          release: 1.2,
        },
        volume: -10,
      }).connect(compressor);
    }
    return this.synth;
  }

  /**
   * Load bars into the player and schedule playback.
   * Call this before play(). Can be called again to reload.
   */
  load(bars: ParsedBar[]): void {
    this.clearSchedule();
    this._bars = bars;
    this._currentChord = null;

    const schedule = buildSchedule(bars, this._config);
    console.log('[ChordPlayer] load: bars=', bars.length, 'scheduled notes=', schedule.length);
    const transport = Tone.getTransport();
    transport.bpm.value = this._config.bpm;
    transport.timeSignature = this._config.timeSignature.beats;

    const synth = this.ensureSynth();
    const barDur = barDuration(this._config);

    // Build a chord-name schedule from resolved bars
    const resolved = resolveRepeats(bars);
    const chordNames: { time: number; name: string }[] = [];
    let lastChordName: string | null = null;
    for (let barIdx = 0; barIdx < resolved.length; barIdx++) {
      const bar = resolved[barIdx];
      const barStart = barIdx * barDur;
      const entryCount = bar.entries.length || 1;
      const entryDur = barDur / entryCount;
      for (let entryIdx = 0; entryIdx < bar.entries.length; entryIdx++) {
        const entry = bar.entries[entryIdx];
        const time = barStart + entryIdx * entryDur;
        if (entry.type === 'chord') {
          lastChordName = entry.chord.raw;
          chordNames.push({ time, name: entry.chord.raw });
        } else if ((entry.type === 'sustain' || entry.type === 'repeat') && lastChordName) {
          chordNames.push({ time, name: lastChordName });
        }
      }
    }

    for (const event of schedule) {
      const id = transport.schedule((time) => {
        synth.triggerAttackRelease(event.notes, event.duration, time);
      }, event.time);
      this.scheduledEvents.push(id);
    }

    // Track chord changes
    for (const cn of chordNames) {
      const id = transport.schedule(() => {
        this._currentChord = cn.name;
        this._callbacks.onChordChange?.(cn.name);
      }, cn.time);
      this.scheduledEvents.push(id);
    }

    // Track bar changes
    for (let i = 0; i < resolved.length; i++) {
      const id = transport.schedule(() => {
        this._callbacks.onBarChange?.(i);
      }, i * barDur);
      this.scheduledEvents.push(id);
    }

    this._totalDuration = resolved.length * barDur;

    // Auto-stop or loop at end
    const stopId = transport.schedule(() => {
      if (this._loop) {
        transport.stop();
        transport.position = 0;
        transport.start();
      } else {
        this.stop();
      }
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
    console.log('[ChordPlayer] play: AudioContext state=', Tone.getContext().state, 'scheduled=', this.scheduledEvents.length, 'totalDuration=', this._totalDuration);
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
    console.log('[ChordPlayer] transport started, state=', transport.state);
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
    this._currentChord = null;
    this._callbacks.onChordChange?.(null);
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

  setVolume(db: number): void {
    const synth = this.ensureSynth();
    synth.volume.value = db;
  }

  setLoop(loop: boolean): void {
    this._loop = loop;
  }

  getCurrentChord(): string | null {
    return this._currentChord;
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
