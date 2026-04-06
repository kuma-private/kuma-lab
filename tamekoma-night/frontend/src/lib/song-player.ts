// song-player.ts
// Full pipeline player: Song → chord-parser → voicing-engine → rhythm-engine → Tone.js
// Phase 1: single track only (first non-empty track).

import * as Tone from 'tone';
import type { Song, MidiNote } from './types/song';
import type { ParsedDirectives, NoteRange as DirectiveNoteRange } from './directive-parser';
import type { VoicingConfig, NoteRange as VoicingNoteRange } from './voicing-engine';
import type { RhythmConfig } from './rhythm-engine';
import { parseProgression, resolveRepeats } from './chord-parser';
import type { ParsedBar } from './chord-parser';
import { parseDirectives } from './directive-parser';
import { voiceChords } from './voicing-engine';
import { generateRhythm } from './rhythm-engine';
import { rootToMidi, midiToNoteName } from './chord-player';

// ── Types ──────────────────────────────────────────────

export type SongPlayerState = 'stopped' | 'playing' | 'paused';

export interface SongPlayerCallbacks {
  onStateChange?: (state: SongPlayerState) => void;
  onProgress?: (currentTime: number, totalDuration: number) => void;
  onBarChange?: (barIndex: number) => void;
  onChordChange?: (chordName: string | null) => void;
}

// ── Constants ─────────────────────────────────────────

const TICKS_PER_QUARTER = 480;

// ── Helpers ───────────────────────────────────────────

/**
 * Convert a directive NoteRange (string-based, e.g. "C3-B4")
 * to a voicing-engine NoteRange (MIDI numbers).
 */
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

/**
 * Extract chord names per bar from resolved ParsedBars.
 * Each bar produces an array of chord name strings (one per chord entry).
 * Non-chord entries (rest, sustain) are skipped; repeat bars are already resolved.
 */
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
        // Carry forward the last chord
        if (lastChordName) chords.push(lastChordName);
      }
      // rest → skip (no chord for this beat slot)
    }
    // If bar has no chord entries at all, carry forward last chord as whole-bar
    if (chords.length === 0 && lastChordName) {
      chords.push(lastChordName);
    }
    result.push(chords);
  }

  return result;
}

/**
 * Parse "4/4" style time signature string.
 */
function parseTimeSignature(ts: string): { beats: number; beatValue: number } {
  const parts = ts.split('/');
  if (parts.length === 2) {
    const beats = Number(parts[0]);
    const beatValue = Number(parts[1]);
    if (Number.isFinite(beats) && Number.isFinite(beatValue) && beats > 0 && beatValue > 0) {
      return { beats, beatValue };
    }
  }
  return { beats: 4, beatValue: 4 }; // default
}

/**
 * Simple block cache hash. Combines chord text and directive text.
 */
function hashBlock(chordText: string, directives: string): string {
  return btoa(chordText + '|' + directives).slice(0, 32);
}

/**
 * Convert tick-based MidiNote to seconds for Tone.js scheduling.
 */
function tickToSeconds(tick: number, bpm: number): number {
  return (tick / TICKS_PER_QUARTER) * (60 / bpm);
}

// ── SongPlayer class ──────────────────────────────────

export class SongPlayer {
  private synth: Tone.PolySynth | null = null;
  private scheduledEvents: number[] = [];
  private _state: SongPlayerState = 'stopped';
  private _totalDuration = 0;
  private _callbacks: SongPlayerCallbacks;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private blockCache = new Map<string, { hash: string; notes: MidiNote[] }>();

  constructor(callbacks: SongPlayerCallbacks = {}) {
    this._callbacks = callbacks;
  }

  get state(): SongPlayerState {
    return this._state;
  }

  get totalDuration(): number {
    return this._totalDuration;
  }

  get currentTime(): number {
    if (this._state === 'stopped') return 0;
    return Tone.getTransport().seconds;
  }

  private setState(state: SongPlayerState): void {
    this._state = state;
    this._callbacks.onStateChange?.(state);
  }

  private ensureSynth(): Tone.PolySynth {
    if (!this.synth) {
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.25 }).toDestination();
      const compressor = new Tone.Compressor(-20, 4).connect(reverb);
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: 'fmtriangle' as const,
          modulationType: 'sine' as const,
          modulationIndex: 2,
          harmonicity: 3.01,
        },
        envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 1.0 },
        volume: -10,
      }).connect(compressor);
    }
    return this.synth;
  }

  /**
   * Load a song and generate MIDI for the first track that has blocks.
   * Runs the full pipeline: parse → voice → rhythm → schedule.
   */
  load(song: Song): void {
    this.clearSchedule();

    // 1. Parse chord progression
    const { bars } = parseProgression(song.chordProgression);
    if (bars.length === 0) return;

    const resolvedBars = resolveRepeats(bars);
    const chordsPerBar = extractChordsPerBar(resolvedBars);

    // Parse song-level config
    const bpm = song.bpm || 120;
    const timeSig = parseTimeSignature(song.timeSignature);

    // 2. Find first track with blocks
    const track = song.tracks.find(
      (t) => t.blocks.length > 0 && !t.mute,
    );

    if (!track) {
      // No playable track — schedule nothing, just set duration
      const ticksPerBeat = TICKS_PER_QUARTER * (4 / timeSig.beatValue);
      const ticksPerBar = ticksPerBeat * timeSig.beats;
      const totalTicks = resolvedBars.length * ticksPerBar;
      this._totalDuration = tickToSeconds(totalTicks, bpm);
      return;
    }

    // 3. Process each block in the track
    const allNotes: MidiNote[] = [];
    const channel = 0; // Phase 1: single channel

    for (const block of track.blocks) {
      // a. Parse directives
      const { directives } = parseDirectives(block.directives);

      // b. Slice chord names for this block's bar range
      const blockChordNames: string[] = [];
      const startBar = Math.max(0, block.startBar);
      const endBar = Math.min(block.endBar, resolvedBars.length);

      // Build a single string of chord names for the block (for hashing)
      const blockChordText: string[] = [];

      for (let barIdx = startBar; barIdx < endBar; barIdx++) {
        const barChords = chordsPerBar[barIdx] ?? [];
        blockChordNames.push(...barChords);
        blockChordText.push(barChords.join(' '));
      }

      if (blockChordNames.length === 0) continue;

      // c. Check block cache
      const chordText = blockChordText.join('|');
      const hash = hashBlock(chordText, block.directives);
      const cacheKey = block.id;
      const cached = this.blockCache.get(cacheKey);

      let notes: MidiNote[];

      if (cached && cached.hash === hash) {
        // Cache hit — reuse previously generated notes
        notes = cached.notes;
      } else {
        // d. Voice chords
        const voicingConfig = toVoicingConfig(directives);
        const voicedChords = voiceChords(blockChordNames, voicingConfig);

        // e. Generate rhythm — process bar by bar
        const rhythmConfig = toRhythmConfig(directives);
        notes = [];

        // Distribute voiced chords back to their bars
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

        // Update cache
        this.blockCache.set(cacheKey, { hash, notes });
      }

      allNotes.push(...notes);
    }

    // 4. Schedule on Tone.Transport
    const transport = Tone.getTransport();
    transport.bpm.value = bpm;
    transport.timeSignature = timeSig.beats;

    const synth = this.ensureSynth();

    for (const note of allNotes) {
      const timeSec = tickToSeconds(note.startTick, bpm);
      const durSec = tickToSeconds(note.durationTicks, bpm);
      const noteName = midiToNoteName(note.midi);
      // Map velocity 0-127 to volume offset (0 = silent, 127 = full)
      const velGain = note.velocity / 127;

      const id = transport.schedule((time) => {
        synth.triggerAttackRelease(noteName, durSec, time, velGain);
      }, timeSec);
      this.scheduledEvents.push(id);
    }

    // Build chord-change and bar-change callbacks
    const ticksPerBeat = TICKS_PER_QUARTER * (4 / timeSig.beatValue);
    const ticksPerBar = ticksPerBeat * timeSig.beats;

    // Bar change events
    for (let i = 0; i < resolvedBars.length; i++) {
      const barTimeSec = tickToSeconds(i * ticksPerBar, bpm);
      const id = transport.schedule(() => {
        this._callbacks.onBarChange?.(i);
      }, barTimeSec);
      this.scheduledEvents.push(id);
    }

    // Chord change events
    let lastChordName: string | null = null;
    for (let barIdx = 0; barIdx < resolvedBars.length; barIdx++) {
      const bar = resolvedBars[barIdx];
      const entryCount = bar.entries.length || 1;
      const entryDurTicks = ticksPerBar / entryCount;

      for (let entryIdx = 0; entryIdx < bar.entries.length; entryIdx++) {
        const entry = bar.entries[entryIdx];
        if (entry.type === 'chord') {
          lastChordName = entry.chord.raw;
          const timeSec = tickToSeconds(barIdx * ticksPerBar + entryIdx * entryDurTicks, bpm);
          const chordName = entry.chord.raw;
          const id = transport.schedule(() => {
            this._callbacks.onChordChange?.(chordName);
          }, timeSec);
          this.scheduledEvents.push(id);
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
    this.scheduledEvents.push(stopId);
  }

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
    if (this.synth) {
      this.synth.releaseAll();
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

  setVolume(db: number): void {
    const synth = this.ensureSynth();
    synth.volume.value = db;
  }

  dispose(): void {
    this.stop();
    this.clearSchedule();
    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }
    this.blockCache.clear();
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
    }, 50); // ~20fps
  }

  private stopProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
}
