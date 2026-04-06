// rhythm-engine.ts
// VoicedChord[] + RhythmConfig → MidiNote[] を生成するリズムエンジン。
// 既存の playback-pattern.ts は変更しない（v1コードパス維持）。

import type { VoicedChord } from './voicing-engine';
import type { MidiNote } from './types/song';
import type { VelocityValue, VelocityLevel } from './directive-parser';

// ── Constants ─────────────────────────────────────────

const TICKS_PER_QUARTER = 480;

const VELOCITY_MAP: Record<string, number> = {
  pp: 30,
  p: 50,
  mp: 70,
  mf: 85,
  f: 100,
  ff: 120,
};

// ── Types ─────────────────────────────────────────────

export interface RhythmConfig {
  mode: string;
  swing?: number;
  strum?: number;
  humanize?: number;
  velocity?: VelocityValue;
}

interface TimeContext {
  bpm: number;
  beats: number;
  beatValue: number;
  ticksPerBar: number;
  ticksPerBeat: number;
}

// ── Velocity helpers ──────────────────────────────────

function velocityLevelToMidi(level: VelocityLevel): number {
  return VELOCITY_MAP[level] ?? 85;
}

function resolveBaseVelocity(velocity: VelocityValue | undefined): number {
  if (!velocity) return VELOCITY_MAP.mf;
  if (typeof velocity === 'string') return velocityLevelToMidi(velocity);
  // Gradient: return start value (interpolation handled in post-processing)
  return velocityLevelToMidi(velocity.from);
}

// ── Note generation per mode ──────────────────────────

type ModeGenerator = (
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
  nextChord?: VoicedChord,
) => MidiNote[];

/** block — 全音を同時に鳴らす。1拍ごと。 */
function genBlock(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const dur = Math.floor(ctx.ticksPerBeat * 0.9);

  for (let beat = 0; beat < ctx.beats; beat++) {
    const startTick = barStartTick + beat * ctx.ticksPerBeat;
    for (const midi of chord.midiNotes) {
      notes.push({ midi, startTick, durationTicks: dur, velocity: baseVelocity, channel });
    }
  }
  return notes;
}

/** arpUp — 低音→高音へ1拍を4分割 */
function genArpUp(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const sorted = [...chord.midiNotes].sort((a, b) => a - b);
  const subdivision = Math.floor(ctx.ticksPerBeat / sorted.length);
  const dur = Math.min(subdivision, 100);

  for (let beat = 0; beat < ctx.beats; beat++) {
    const beatStart = barStartTick + beat * ctx.ticksPerBeat;
    for (let i = 0; i < sorted.length; i++) {
      const velScale = i === 0 ? 1.0 : 0.85 - i * 0.02;
      notes.push({
        midi: sorted[i],
        startTick: beatStart + i * subdivision,
        durationTicks: dur,
        velocity: clampVelocity(Math.round(baseVelocity * velScale)),
        channel,
      });
    }
  }
  return notes;
}

/** arpDown — 高音→低音 */
function genArpDown(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const sorted = [...chord.midiNotes].sort((a, b) => b - a);
  const subdivision = Math.floor(ctx.ticksPerBeat / sorted.length);
  const dur = Math.min(subdivision, 100);

  for (let beat = 0; beat < ctx.beats; beat++) {
    const beatStart = barStartTick + beat * ctx.ticksPerBeat;
    for (let i = 0; i < sorted.length; i++) {
      const velScale = i === 0 ? 1.0 : 0.85 - i * 0.02;
      notes.push({
        midi: sorted[i],
        startTick: beatStart + i * subdivision,
        durationTicks: dur,
        velocity: clampVelocity(Math.round(baseVelocity * velScale)),
        channel,
      });
    }
  }
  return notes;
}

/** fingerpick — ベースと上声部を交互 */
function genFingerpick(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const upper = chord.upperMidi.length > 0 ? chord.upperMidi : [chord.bassMidi];
  const dur = Math.floor(ctx.ticksPerBeat * 0.4);

  for (let beat = 0; beat < ctx.beats; beat++) {
    const beatStart = barStartTick + beat * ctx.ticksPerBeat;
    const half = Math.floor(ctx.ticksPerBeat / 2);

    // Downbeat: bass
    notes.push({
      midi: chord.bassMidi,
      startTick: beatStart,
      durationTicks: dur,
      velocity: baseVelocity,
      channel,
    });

    // Upbeat: upper voice (cycle through)
    const upperIdx = beat % upper.length;
    notes.push({
      midi: upper[upperIdx],
      startTick: beatStart + half,
      durationTicks: dur,
      velocity: clampVelocity(Math.round(baseVelocity * 0.75)),
      channel,
    });
  }
  return notes;
}

/** bossa-nova — ベースと上声部をボサノバパターン */
function genBossaNova(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const dur = Math.floor(ctx.ticksPerBeat * 0.4);
  const half = Math.floor(ctx.ticksPerBeat / 2);

  for (let beat = 0; beat < ctx.beats; beat++) {
    const beatStart = barStartTick + beat * ctx.ticksPerBeat;
    const isEvenBeat = beat % 2 === 0;

    if (isEvenBeat) {
      // Beat 0, 2: bass on downbeat, upper on upbeat
      notes.push({
        midi: chord.bassMidi,
        startTick: beatStart,
        durationTicks: dur,
        velocity: baseVelocity,
        channel,
      });
      for (const m of chord.upperMidi) {
        notes.push({
          midi: m,
          startTick: beatStart + half,
          durationTicks: dur,
          velocity: clampVelocity(Math.round(baseVelocity * 0.7)),
          channel,
        });
      }
    } else {
      // Beat 1, 3: upper on downbeat, bass on upbeat
      for (const m of chord.upperMidi) {
        notes.push({
          midi: m,
          startTick: beatStart,
          durationTicks: dur,
          velocity: clampVelocity(Math.round(baseVelocity * 0.7)),
          channel,
        });
      }
      notes.push({
        midi: chord.bassMidi,
        startTick: beatStart + half,
        durationTicks: dur,
        velocity: clampVelocity(Math.round(baseVelocity * 0.9)),
        channel,
      });
    }
  }
  return notes;
}

/** comp-jazz — ジャズコンピング。裏拍にコードを刻む（Charleston rhythm風） */
function genCompJazz(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const dur = Math.floor(ctx.ticksPerBeat * 0.4);
  const half = Math.floor(ctx.ticksPerBeat / 2);

  // Charleston: hit on beat 1, then on the "and" of beat 2, rest, hit on "and" of beat 4
  // Pattern per bar (4/4): beat 0 downbeat, beat 1 upbeat, beat 3 upbeat
  const hitPositions = [
    { tick: 0, velScale: 1.0 },                           // beat 1 downbeat
    { tick: ctx.ticksPerBeat + half, velScale: 0.8 },     // "and" of beat 2
    { tick: 3 * ctx.ticksPerBeat + half, velScale: 0.75 }, // "and" of beat 4
  ];

  for (const hit of hitPositions) {
    if (hit.tick >= ctx.ticksPerBar) continue;
    const startTick = barStartTick + hit.tick;
    for (const m of chord.upperMidi) {
      notes.push({
        midi: m,
        startTick,
        durationTicks: dur,
        velocity: clampVelocity(Math.round(baseVelocity * hit.velScale)),
        channel,
      });
    }
  }
  return notes;
}

/** 8beat — 8分音符で刻む。アクセントは1拍目と3拍目 */
function gen8Beat(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const eighthTicks = Math.floor(ctx.ticksPerBeat / 2);
  const dur = Math.floor(eighthTicks * 0.8);
  const totalEighths = ctx.beats * 2;

  for (let i = 0; i < totalEighths; i++) {
    const startTick = barStartTick + i * eighthTicks;
    const beat = Math.floor(i / 2);
    // Accent on beats 0 and 2 (1st and 3rd)
    const isAccent = beat === 0 || beat === 2;
    const velScale = isAccent ? 1.0 : 0.7;

    for (const m of chord.midiNotes) {
      notes.push({
        midi: m,
        startTick,
        durationTicks: dur,
        velocity: clampVelocity(Math.round(baseVelocity * velScale)),
        channel,
      });
    }
  }
  return notes;
}

/** walking — ベースのみ。4分音符でルート→5度→経過音→アプローチノート */
function genWalking(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
  nextChord?: VoicedChord,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const dur = Math.floor(ctx.ticksPerBeat * 0.9);
  const root = chord.bassMidi;
  const fifth = root + 7;

  // Chromatic approach note: half step below next chord's root
  const nextRoot = nextChord ? nextChord.bassMidi : root;
  const approachNote = nextRoot - 1;

  // Pick a passing tone between fifth and approach
  // Use 3rd above root as passing tone
  const passingTone = root + 5; // perfect 4th as passing tone

  const walkNotes = [root, fifth, passingTone, approachNote];

  // Only generate as many notes as we have beats
  for (let beat = 0; beat < Math.min(ctx.beats, walkNotes.length); beat++) {
    notes.push({
      midi: walkNotes[beat],
      startTick: barStartTick + beat * ctx.ticksPerBeat,
      durationTicks: dur,
      velocity: baseVelocity,
      channel,
    });
  }

  // If more beats than walkNotes pattern, repeat root
  for (let beat = walkNotes.length; beat < ctx.beats; beat++) {
    notes.push({
      midi: root,
      startTick: barStartTick + beat * ctx.ticksPerBeat,
      durationTicks: dur,
      velocity: baseVelocity,
      channel,
    });
  }

  return notes;
}

/** root — ベースのみ。4分音符でルート音を繰り返す */
function genRoot(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const dur = Math.floor(ctx.ticksPerBeat * 0.9);

  for (let beat = 0; beat < ctx.beats; beat++) {
    notes.push({
      midi: chord.bassMidi,
      startTick: barStartTick + beat * ctx.ticksPerBeat,
      durationTicks: dur,
      velocity: baseVelocity,
      channel,
    });
  }
  return notes;
}

/** root-fifth — ベースのみ。ルート→5度の2音パターン */
function genRootFifth(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const notes: MidiNote[] = [];
  const dur = Math.floor(ctx.ticksPerBeat * 0.9);
  const root = chord.bassMidi;
  const fifth = root + 7;

  for (let beat = 0; beat < ctx.beats; beat++) {
    const midi = beat % 2 === 0 ? root : fifth;
    notes.push({
      midi,
      startTick: barStartTick + beat * ctx.ticksPerBeat,
      durationTicks: dur,
      velocity: baseVelocity,
      channel,
    });
  }
  return notes;
}

/** sustain — 全音を同時に小節いっぱい伸ばす */
function genSustain(
  chord: VoicedChord,
  barStartTick: number,
  ctx: TimeContext,
  baseVelocity: number,
  channel: number,
): MidiNote[] {
  const dur = ctx.ticksPerBar - 1; // leave 1 tick gap to avoid overlap with next bar

  return chord.midiNotes.map((midi) => ({
    midi,
    startTick: barStartTick,
    durationTicks: dur,
    velocity: baseVelocity,
    channel,
  }));
}

// ── Mode registry ─────────────────────────────────────

const MODE_GENERATORS: Record<string, ModeGenerator> = {
  block: genBlock,
  arpUp: genArpUp,
  arpDown: genArpDown,
  fingerpick: genFingerpick,
  'bossa-nova': genBossaNova,
  'comp-jazz': genCompJazz,
  '8beat': gen8Beat,
  walking: genWalking,
  root: genRoot,
  'root-fifth': genRootFifth,
  sustain: genSustain,
};

// ── Post-processing ───────────────────────────────────

function clampVelocity(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

function clampTick(t: number): number {
  return Math.max(0, Math.round(t));
}

/** @swing — オフビート（偶数番目の8分音符位置）のノートを遅らせる */
function applySwing(notes: MidiNote[], swingPercent: number, ticksPerBeat: number): MidiNote[] {
  if (swingPercent <= 0) return notes;
  const eighthTicks = Math.floor(ticksPerBeat / 2);

  return notes.map((note) => {
    // Check if this note falls on an offbeat 8th note position
    const positionInBeat = note.startTick % ticksPerBeat;
    // Is it close to the upbeat (halfway through the beat)?
    if (Math.abs(positionInBeat - eighthTicks) < eighthTicks / 4) {
      const swingOffset = Math.round(eighthTicks * (swingPercent / 100));
      return { ...note, startTick: clampTick(note.startTick + swingOffset) };
    }
    return note;
  });
}

/** @strum — コード内のノートを順次に鳴らす */
function applyStrum(
  notes: MidiNote[],
  strumMs: number,
  bpm: number,
): MidiNote[] {
  if (strumMs === 0) return notes;

  // Convert ms to ticks
  const delayTicksPerNote = Math.round(
    Math.abs(strumMs) * (TICKS_PER_QUARTER * bpm) / (60 * 1000),
  );
  const ascending = strumMs > 0;

  // Group notes by startTick (same chord)
  const groups = new Map<number, MidiNote[]>();
  for (const note of notes) {
    const group = groups.get(note.startTick) ?? [];
    group.push(note);
    groups.set(note.startTick, group);
  }

  const result: MidiNote[] = [];
  for (const [, group] of groups) {
    if (group.length <= 1) {
      result.push(...group);
      continue;
    }

    // Sort by pitch
    const sorted = [...group].sort((a, b) =>
      ascending ? a.midi - b.midi : b.midi - a.midi,
    );

    for (let i = 0; i < sorted.length; i++) {
      result.push({
        ...sorted[i],
        startTick: clampTick(sorted[i].startTick + i * delayTicksPerNote),
      });
    }
  }

  return result;
}

/** @humanize — タイミングとベロシティにランダムな揺れ */
function applyHumanize(notes: MidiNote[], humanizePercent: number): MidiNote[] {
  if (humanizePercent <= 0) return notes;

  const timingRange = (humanizePercent / 100) * (TICKS_PER_QUARTER / 4);
  const velocityRange = (humanizePercent / 100) * 20;

  return notes.map((note) => ({
    ...note,
    startTick: clampTick(note.startTick + (Math.random() * 2 - 1) * timingRange),
    velocity: clampVelocity(note.velocity + (Math.random() * 2 - 1) * velocityRange),
  }));
}

/** @velocity gradient — from→to の線形補間 */
function applyVelocityGradient(notes: MidiNote[], velocity: VelocityValue | undefined): MidiNote[] {
  if (!velocity || typeof velocity === 'string') return notes;

  // Gradient
  const fromVel = velocityLevelToMidi(velocity.from);
  const toVel = velocityLevelToMidi(velocity.to);

  if (notes.length <= 1) {
    return notes.map((n) => ({ ...n, velocity: clampVelocity(fromVel) }));
  }

  // Sort by startTick to determine interpolation order
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  const firstTick = sorted[0].startTick;
  const lastTick = sorted[sorted.length - 1].startTick;
  const tickRange = lastTick - firstTick;

  if (tickRange === 0) {
    return notes.map((n) => ({ ...n, velocity: clampVelocity(fromVel) }));
  }

  return notes.map((note) => {
    const t = (note.startTick - firstTick) / tickRange;
    const vel = fromVel + t * (toVel - fromVel);
    return { ...note, velocity: clampVelocity(vel) };
  });
}

// ── Main export ───────────────────────────────────────

/**
 * Generate MidiNote[] from voiced chords + rhythm config.
 *
 * @param chords - Array of VoicedChord from voicing-engine
 * @param config - Rhythm parameters from parsed directives
 * @param bpm - Beats per minute
 * @param timeSignature - { beats, beatValue }
 * @param startBar - 0-based bar offset for this block
 * @param channel - MIDI channel for this track
 */
export function generateRhythm(
  chords: VoicedChord[],
  config: RhythmConfig,
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
  startBar: number,
  channel: number,
): MidiNote[] {
  if (chords.length === 0) return [];

  const ticksPerBeat = TICKS_PER_QUARTER * (4 / timeSignature.beatValue);
  const ticksPerBar = ticksPerBeat * timeSignature.beats;

  const ctx: TimeContext = {
    bpm,
    beats: timeSignature.beats,
    beatValue: timeSignature.beatValue,
    ticksPerBar,
    ticksPerBeat,
  };

  const mode = config.mode || 'block';
  const generator = MODE_GENERATORS[mode] ?? MODE_GENERATORS.block;
  const baseVelocity = resolveBaseVelocity(config.velocity);

  // Generate raw notes for each chord
  let allNotes: MidiNote[] = [];

  // Distribute chords evenly across the bar
  // If 1 chord → full bar, 2 chords → half bar each, etc.
  const beatsPerChord = Math.floor(timeSignature.beats / chords.length);
  const remainderBeats = timeSignature.beats % chords.length;

  let currentBeatOffset = 0;

  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i];
    if (chord.midiNotes.length === 0) continue;

    const chordBeats = beatsPerChord + (i < remainderBeats ? 1 : 0);
    const chordStartTick = startBar * ticksPerBar + currentBeatOffset * ticksPerBeat;

    const chordCtx: TimeContext = { ...ctx, beats: chordBeats };
    const nextChord = i < chords.length - 1 ? chords[i + 1] : undefined;

    const notes = generator(chord, chordStartTick, chordCtx, baseVelocity, channel, nextChord);
    allNotes.push(...notes);

    currentBeatOffset += chordBeats;
  }

  // Post-processing pipeline (order matters)

  // 1. Velocity gradient
  allNotes = applyVelocityGradient(allNotes, config.velocity);

  // 2. Swing
  if (config.swing && config.swing > 0) {
    allNotes = applySwing(allNotes, config.swing, ticksPerBeat);
  }

  // 3. Strum
  if (config.strum && config.strum !== 0) {
    allNotes = applyStrum(allNotes, config.strum, bpm);
  }

  // 4. Humanize (last, so it doesn't interfere with swing/strum logic)
  if (config.humanize && config.humanize > 0) {
    allNotes = applyHumanize(allNotes, config.humanize);
  }

  return allNotes;
}
