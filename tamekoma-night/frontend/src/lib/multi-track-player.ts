// multi-track-player.ts
// Multi-track simultaneous playback engine.
// Extends Phase 1 SongPlayer to play all tracks at once.
// Does NOT modify song-player.ts (kept as v1 fallback).

import * as Tone from 'tone';
import type { Song, Track, MidiNote } from './types/song';
import type { ParsedDirectives, NoteRange as DirectiveNoteRange, VelocityValue } from './directive-parser';
import type { VoicingConfig, NoteRange as VoicingNoteRange } from './voicing-engine';
import type { RhythmConfig } from './rhythm-engine';
import { parseProgression, resolveRepeats } from './chord-parser';
import type { ParsedBar } from './chord-parser';
import { parseDirectives } from './directive-parser';
import { voiceChords } from './voicing-engine';
import { generateRhythm } from './rhythm-engine';
import { rootToMidi, midiToNoteName, getPianoSampler } from './chord-player';
import { generateDrumRhythm } from './drum-patterns';
import type { RhythmConfig as DrumRhythmConfig, DrumPatternName } from './drum-patterns';

// ── Types ──────────────────────────────────────────────

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface PlayerCallbacks {
  onStateChange?: (state: PlayerState) => void;
  onProgress?: (currentTime: number, totalDuration: number) => void;
  onBarChange?: (barIndex: number) => void;
  onChordChange?: (chordName: string | null) => void;
}

export interface TrackInstance {
  id: string;
  name: string;
  instrument: Tone.PolySynth | Tone.Sampler;
  volume: Tone.Volume;
  mute: boolean;
  solo: boolean;
  scheduledEvents: number[];
  generatedNotes: MidiNote[];
  /** Whether this TrackInstance owns its instrument (should dispose on cleanup). */
  ownsInstrument: boolean;
}

// ── Constants ─────────────────────────────────────────

const TICKS_PER_QUARTER = 480;

// ── Helpers (shared with song-player.ts) ──────────────

function parseNoteRange(range: DirectiveNoteRange): VoicingNoteRange {
  const lowMatch = range.low.match(/^([A-Ga-g][#b]?)(\d+)$/);
  const highMatch = range.high.match(/^([A-Ga-g][#b]?)(\d+)$/);
  if (!lowMatch || !highMatch) {
    return { low: 48, high: 72 }; // C3-C5 fallback
  }
  return {
    low: rootToMidi(lowMatch[1].toUpperCase(), Number(lowMatch[2])),
    high: rootToMidi(highMatch[1].toUpperCase(), Number(highMatch[2])),
  };
}

function toVoicingConfig(d: ParsedDirectives): VoicingConfig {
  return {
    type: (d.voicing as VoicingConfig['type']) ?? 'close',
    range: d.range ? parseNoteRange(d.range) : undefined,
    lead: d.lead as 'smooth' | undefined,
  };
}

function toRhythmConfig(d: ParsedDirectives): RhythmConfig {
  return {
    mode: d.mode ?? 'block',
    swing: d.swing,
    strum: d.strum,
    humanize: d.humanize,
    velocity: d.velocity,
  };
}

function extractChordsPerBar(bars: ParsedBar[]): string[][] {
  const result: string[][] = [];
  let lastChordName: string | null = null;

  for (const bar of bars) {
    const chords: string[] = [];
    for (const entry of bar.entries) {
      if (entry.type === 'chord') {
        lastChordName = entry.chord.raw;
        chords.push(entry.chord.raw);
      } else if (entry.type === 'sustain' || entry.type === 'repeat') {
        if (lastChordName) chords.push(lastChordName);
      }
    }
    if (chords.length === 0 && lastChordName) {
      chords.push(lastChordName);
    }
    result.push(chords);
  }

  return result;
}

function parseTimeSignature(ts: string): { beats: number; beatValue: number } {
  const parts = ts.split('/');
  if (parts.length === 2) {
    const beats = Number(parts[0]);
    const beatValue = Number(parts[1]);
    if (Number.isFinite(beats) && Number.isFinite(beatValue) && beats > 0 && beatValue > 0) {
      return { beats, beatValue };
    }
  }
  return { beats: 4, beatValue: 4 };
}

function hashBlock(chordText: string, directives: string): string {
  return btoa(chordText + '|' + directives).slice(0, 32);
}

function tickToSeconds(tick: number, bpm: number): number {
  return (tick / TICKS_PER_QUARTER) * (60 / bpm);
}

const VELOCITY_LEVEL_MAP: Record<string, number> = {
  pp: 30, p: 50, mp: 70, mf: 85, f: 105, ff: 120,
};

function resolveDrumVelocity(v: VelocityValue | undefined): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return VELOCITY_LEVEL_MAP[v] ?? 100;
  // Gradient: use start value
  return VELOCITY_LEVEL_MAP[v.from] ?? 100;
}

// ── Instrument factory ────────────────────────────────

function createInstrument(
  instrumentName: string,
): { instrument: Tone.PolySynth | Tone.Sampler; ownsInstrument: boolean } {
  switch (instrumentName) {
    case 'piano':
      // Shared Salamander piano sampler — do not dispose
      return { instrument: getPianoSampler(), ownsInstrument: false };

    case 'organ':
      return {
        instrument: new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.3 },
          volume: -10,
        }),
        ownsInstrument: true,
      };

    case 'strings':
      return {
        instrument: new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.1, decay: 0.3, sustain: 0.7, release: 1.5 },
          volume: -12,
        }),
        ownsInstrument: true,
      };

    case 'bass':
      return {
        instrument: new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5 },
          volume: -8,
        }),
        ownsInstrument: true,
      };

    case 'guitar':
      return {
        instrument: new Tone.PolySynth(Tone.Synth, {
          oscillator: {
            type: 'fmtriangle' as const,
            modulationType: 'sine' as const,
            modulationIndex: 2,
            harmonicity: 3.01,
          },
          envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.8 },
          volume: -10,
        }),
        ownsInstrument: true,
      };

    default:
      // drums / unknown — generic synth fallback
      return {
        instrument: new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.5 },
          volume: -10,
        }),
        ownsInstrument: true,
      };
  }
}

// ── MultiTrackPlayer class ────────────────────────────

export class MultiTrackPlayer {
  private tracks: TrackInstance[] = [];
  private _state: PlayerState = 'stopped';
  private _totalDuration = 0;
  private _callbacks: PlayerCallbacks;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private masterVolume: Tone.Volume;
  private blockCache = new Map<string, { hash: string; notes: MidiNote[] }>();
  /** Transport event IDs for bar/chord/auto-stop callbacks */
  private globalScheduledEvents: number[] = [];

  constructor(callbacks: PlayerCallbacks = {}) {
    this._callbacks = callbacks;
    this.masterVolume = new Tone.Volume(0).toDestination();
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

  // ── Load ──────────────────────────────────────────

  /**
   * Load a Song: run the full pipeline for every track and schedule on Transport.
   */
  load(song: Song): void {
    this.clearSchedule();

    // 1. Parse chord progression (shared across all tracks)
    const { bars } = parseProgression(song.chordProgression);
    if (bars.length === 0) return;

    const resolvedBars = resolveRepeats(bars);
    const chordsPerBar = extractChordsPerBar(resolvedBars);

    const bpm = song.bpm || 120;
    const timeSig = parseTimeSignature(song.timeSignature);
    const ticksPerBeat = TICKS_PER_QUARTER * (4 / timeSig.beatValue);
    const ticksPerBar = ticksPerBeat * timeSig.beats;

    const transport = Tone.getTransport();
    transport.bpm.value = bpm;
    transport.timeSignature = timeSig.beats;

    // 2. Process each track
    for (let trackIdx = 0; trackIdx < song.tracks.length; trackIdx++) {
      const trackDef = song.tracks[trackIdx];

      // Create instrument and audio routing: instrument → Volume → masterVolume → Destination
      const { instrument, ownsInstrument } = createInstrument(trackDef.instrument);

      const volumeNode = new Tone.Volume(trackDef.volume ?? 0);

      // Connect: instrument → volumeNode → masterVolume
      instrument.disconnect(); // disconnect default toDestination if any
      instrument.connect(volumeNode);
      volumeNode.connect(this.masterVolume);

      // Apply initial mute
      volumeNode.mute = trackDef.mute ?? false;

      const trackInstance: TrackInstance = {
        id: trackDef.id,
        name: trackDef.name,
        instrument,
        volume: volumeNode,
        mute: trackDef.mute ?? false,
        solo: trackDef.solo ?? false,
        scheduledEvents: [],
        generatedNotes: [],
        ownsInstrument,
      };

      // 3. Process each block in the track
      const trackNotes: MidiNote[] = [];
      const channel = trackIdx;

      for (const block of trackDef.blocks) {
        // AI-generated MIDI: skip voicing/rhythm pipeline entirely
        if (block.generatedMidi && block.generatedMidi.notes.length > 0) {
          trackNotes.push(...block.generatedMidi.notes);
          continue;
        }

        const { directives } = parseDirectives(block.directives);

        // Slice chord names for this block's bar range
        const blockChordNames: string[] = [];
        const startBar = Math.max(0, block.startBar);
        const endBar = Math.min(block.endBar, resolvedBars.length);
        const blockChordText: string[] = [];

        for (let barIdx = startBar; barIdx < endBar; barIdx++) {
          const barChords = chordsPerBar[barIdx] ?? [];
          blockChordNames.push(...barChords);
          blockChordText.push(barChords.join(' '));
        }

        if (blockChordNames.length === 0) continue;

        // Check block cache
        const chordText = blockChordText.join('|');
        const hash = hashBlock(chordText, block.directives);
        const cacheKey = `${trackDef.id}:${block.id}`;
        const cached = this.blockCache.get(cacheKey);

        let notes: MidiNote[];

        if (cached && cached.hash === hash) {
          notes = cached.notes;
        } else if (trackDef.instrument === 'drums') {
          // Drum track: use drum-patterns generator
          const drumPatternName = (directives.mode ?? '8beat') as DrumPatternName;
          const drumConfig: DrumRhythmConfig = {
            pattern: drumPatternName,
            velocity: resolveDrumVelocity(directives.velocity),
            humanize: directives.humanize,
            swing: directives.swing,
          };
          const barCount = endBar - startBar;
          notes = generateDrumRhythm(drumConfig, bpm, timeSig, startBar, barCount, 9);

          this.blockCache.set(cacheKey, { hash, notes });
        } else {
          // Voice chords
          const voicingConfig = toVoicingConfig(directives);
          const voicedChords = voiceChords(blockChordNames, voicingConfig);

          // Generate rhythm — bar by bar
          const rhythmConfig = toRhythmConfig(directives);
          notes = [];

          let chordIdx = 0;
          for (let barIdx = startBar; barIdx < endBar; barIdx++) {
            const barChordCount = (chordsPerBar[barIdx] ?? []).length;
            if (barChordCount === 0) continue;

            const barChords = voicedChords.slice(chordIdx, chordIdx + barChordCount);
            chordIdx += barChordCount;

            const barNotes = generateRhythm(
              barChords,
              rhythmConfig,
              bpm,
              timeSig,
              barIdx,
              channel,
            );
            notes.push(...barNotes);
          }

          this.blockCache.set(cacheKey, { hash, notes });
        }

        trackNotes.push(...notes);
      }

      // Store generated notes for Visualizer API
      trackInstance.generatedNotes = trackNotes;

      // 4. Schedule notes on Transport
      for (const note of trackNotes) {
        const timeSec = tickToSeconds(note.startTick, bpm);
        const durSec = tickToSeconds(note.durationTicks, bpm);
        const noteName = midiToNoteName(note.midi);
        const velGain = note.velocity / 127;

        const id = transport.schedule((time) => {
          instrument.triggerAttackRelease(noteName, durSec, time, velGain);
        }, timeSec);
        trackInstance.scheduledEvents.push(id);
      }

      this.tracks.push(trackInstance);
    }

    // 5. Apply initial solo/mute state
    this.updateMuteState();

    // 6. Schedule bar-change and chord-change callbacks (once, not per track)
    for (let i = 0; i < resolvedBars.length; i++) {
      const barTimeSec = tickToSeconds(i * ticksPerBar, bpm);
      const id = transport.schedule(() => {
        this._callbacks.onBarChange?.(i);
      }, barTimeSec);
      this.globalScheduledEvents.push(id);
    }

    for (let barIdx = 0; barIdx < resolvedBars.length; barIdx++) {
      const bar = resolvedBars[barIdx];
      const entryCount = bar.entries.length || 1;
      const entryDurTicks = ticksPerBar / entryCount;

      for (let entryIdx = 0; entryIdx < bar.entries.length; entryIdx++) {
        const entry = bar.entries[entryIdx];
        if (entry.type === 'chord') {
          const timeSec = tickToSeconds(barIdx * ticksPerBar + entryIdx * entryDurTicks, bpm);
          const chordName = entry.chord.raw;
          const id = transport.schedule(() => {
            this._callbacks.onChordChange?.(chordName);
          }, timeSec);
          this.globalScheduledEvents.push(id);
        }
      }
    }

    // Total duration
    const totalTicks = resolvedBars.length * ticksPerBar;
    this._totalDuration = tickToSeconds(totalTicks, bpm);

    // Auto-stop at end
    const stopId = transport.schedule(() => {
      this.stop();
    }, this._totalDuration);
    this.globalScheduledEvents.push(stopId);
  }

  // ── Playback controls ─────────────────────────────

  async play(): Promise<void> {
    await Tone.start();

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

    // Release all instruments
    for (const track of this.tracks) {
      if ('releaseAll' in track.instrument) {
        (track.instrument as Tone.PolySynth).releaseAll();
      }
    }

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

  // ── Volume controls ───────────────────────────────

  setVolume(db: number): void {
    this.masterVolume.volume.value = db;
  }

  setTrackVolume(trackId: string, db: number): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track) {
      track.volume.volume.value = db;
    }
  }

  setTrackMute(trackId: string, mute: boolean): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track) {
      track.mute = mute;
      this.updateMuteState();
    }
  }

  setTrackSolo(trackId: string, solo: boolean): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track) {
      track.solo = solo;
      this.updateMuteState();
    }
  }

  // ── MIDI data API (for Visualizer) ────────────────

  getTrackNotes(trackId: string): MidiNote[] {
    const track = this.tracks.find((t) => t.id === trackId);
    return track ? track.generatedNotes : [];
  }

  getAllTrackNotes(): Map<string, MidiNote[]> {
    const result = new Map<string, MidiNote[]>();
    for (const track of this.tracks) {
      result.set(track.id, track.generatedNotes);
    }
    return result;
  }

  // ── Cleanup ───────────────────────────────────────

  dispose(): void {
    this.stop();
    this.clearSchedule();
    this.masterVolume.dispose();
    this.masterVolume = new Tone.Volume(0).toDestination();
    this.blockCache.clear();
  }

  // ── Private ───────────────────────────────────────

  private setState(state: PlayerState): void {
    this._state = state;
    this._callbacks.onStateChange?.(state);
  }

  /**
   * Apply mute/solo logic to all track Volume nodes.
   * - If any track has solo=true, only soloed tracks are audible.
   * - Otherwise, muted tracks are silenced.
   */
  private updateMuteState(): void {
    const hasSolo = this.tracks.some((t) => t.solo);

    for (const track of this.tracks) {
      if (hasSolo) {
        track.volume.mute = !track.solo;
      } else {
        track.volume.mute = track.mute;
      }
    }
  }

  private clearSchedule(): void {
    const transport = Tone.getTransport();

    // Clear per-track events and dispose instruments
    for (const track of this.tracks) {
      for (const id of track.scheduledEvents) {
        transport.clear(id);
      }
      // Disconnect and dispose owned instruments
      track.instrument.disconnect();
      if (track.ownsInstrument) {
        track.instrument.dispose();
      }
      track.volume.dispose();
    }
    this.tracks = [];

    // Clear global events (bar/chord/auto-stop)
    for (const id of this.globalScheduledEvents) {
      transport.clear(id);
    }
    this.globalScheduledEvents = [];
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
    }, 50); // ~20fps
  }

  private stopProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
}
