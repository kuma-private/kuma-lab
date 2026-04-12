//! Built-in instruments shipped with the Bridge so users can produce audio
//! end-to-end without installing CLAP or VST3 plugins. Each implementation is
//! RT-safe (no allocations in `process`) and uses pre-allocated voice pools.

use crate::midi::{MidiEvent, MidiEventKind};
use crate::node::Instrument;

const MAX_VOICES: usize = 16;
const TWO_PI: f64 = std::f64::consts::TAU;

fn midi_to_hz(pitch: u8) -> f64 {
    440.0 * 2f64.powf((pitch as f64 - 69.0) / 12.0)
}

// ── Envelope ──────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EnvStage {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy, Debug)]
struct Envelope {
    stage: EnvStage,
    value: f32,
    sample_rate: f64,
}

impl Envelope {
    fn new(sample_rate: f64) -> Self {
        Self {
            stage: EnvStage::Idle,
            value: 0.0,
            sample_rate,
        }
    }
    fn note_on(&mut self) {
        self.stage = EnvStage::Attack;
    }
    fn note_off(&mut self) {
        self.stage = EnvStage::Release;
    }
    fn is_active(&self) -> bool {
        self.stage != EnvStage::Idle
    }
    fn is_released(&self) -> bool {
        matches!(self.stage, EnvStage::Release | EnvStage::Idle)
    }
    fn step(&mut self, attack_ms: f64, decay_ms: f64, sustain: f64, release_ms: f64) -> f32 {
        let sr = self.sample_rate as f32;
        match self.stage {
            EnvStage::Idle => {
                self.value = 0.0;
            }
            EnvStage::Attack => {
                let inc = if attack_ms <= 0.0 {
                    1.0
                } else {
                    1000.0 / (attack_ms as f32 * sr)
                };
                self.value += inc;
                if self.value >= 1.0 {
                    self.value = 1.0;
                    self.stage = EnvStage::Decay;
                }
            }
            EnvStage::Decay => {
                let target = sustain as f32;
                let coeff = if decay_ms <= 0.0 {
                    0.0
                } else {
                    (-1.0 / (decay_ms as f32 * 0.001 * sr)).exp()
                };
                self.value = target + (self.value - target) * coeff;
                if (self.value - target).abs() < 1e-4 {
                    self.value = target;
                    self.stage = EnvStage::Sustain;
                }
            }
            EnvStage::Sustain => {
                self.value = sustain as f32;
            }
            EnvStage::Release => {
                let coeff = if release_ms <= 0.0 {
                    0.0
                } else {
                    (-1.0 / (release_ms as f32 * 0.001 * sr)).exp()
                };
                self.value *= coeff;
                if self.value < 1e-4 {
                    self.value = 0.0;
                    self.stage = EnvStage::Idle;
                }
            }
        }
        self.value
    }
}

// ── SineInstrument ────────────────────────────────────────────────────────

struct SineVoice {
    note: u8,
    phase: f64,
    velocity: f32,
    env: Envelope,
}

impl SineVoice {
    fn new(sample_rate: f64) -> Self {
        Self {
            note: 0,
            phase: 0.0,
            velocity: 0.0,
            env: Envelope::new(sample_rate),
        }
    }
}

pub struct SineInstrument {
    sample_rate: f64,
    voices: Vec<SineVoice>,
    attack_ms: f64,
    decay_ms: f64,
    sustain: f64,
    release_ms: f64,
    detune_cents: f64,
    gain_db: f64,
}

impl SineInstrument {
    pub fn new() -> Self {
        let sr = 48_000.0;
        Self {
            sample_rate: sr,
            voices: (0..MAX_VOICES).map(|_| SineVoice::new(sr)).collect(),
            attack_ms: 5.0,
            decay_ms: 200.0,
            sustain: 0.6,
            release_ms: 300.0,
            detune_cents: 0.0,
            gain_db: 0.0,
        }
    }

    pub fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "attack" => self.attack_ms = value.max(0.0),
            "decay" => self.decay_ms = value.max(0.0),
            "sustain" => self.sustain = value.clamp(0.0, 1.0),
            "release" => self.release_ms = value.max(0.0),
            "detune" => self.detune_cents = value.clamp(-100.0, 100.0),
            "gainDb" => self.gain_db = value,
            _ => {}
        }
    }

    fn allocate_voice(&mut self) -> usize {
        if let Some(i) = self.voices.iter().position(|v| !v.env.is_active()) {
            return i;
        }
        // Steal oldest released voice, otherwise oldest active voice (index 0
        // — voices grow downward when stolen so the head is always oldest).
        let mut idx = 0;
        for (i, v) in self.voices.iter().enumerate() {
            if v.env.is_released() {
                idx = i;
                break;
            }
        }
        idx
    }
}

impl Default for SineInstrument {
    fn default() -> Self {
        Self::new()
    }
}

impl Instrument for SineInstrument {
    fn process(&mut self, events: &[MidiEvent], out: &mut [f32], n_frames: usize) {
        for s in out[..n_frames * 2].iter_mut() {
            *s = 0.0;
        }
        let detune_ratio = 2f64.powf(self.detune_cents / 1200.0);
        let gain_lin = 10f32.powf(self.gain_db as f32 / 20.0);
        let mut ev_idx = 0;
        for f in 0..n_frames {
            while ev_idx < events.len() && events[ev_idx].sample_offset as usize <= f {
                match events[ev_idx].kind {
                    MidiEventKind::NoteOn { pitch, velocity } => {
                        let i = self.allocate_voice();
                        let v = &mut self.voices[i];
                        v.note = pitch;
                        v.velocity = velocity as f32 / 127.0;
                        v.phase = 0.0;
                        v.env.note_on();
                    }
                    MidiEventKind::NoteOff { pitch } => {
                        for v in self.voices.iter_mut() {
                            if v.note == pitch && v.env.is_active() && !v.env.is_released() {
                                v.env.note_off();
                            }
                        }
                    }
                    MidiEventKind::AllOff => {
                        for v in self.voices.iter_mut() {
                            v.env.note_off();
                        }
                    }
                }
                ev_idx += 1;
            }
            let mut sum = 0.0_f32;
            for v in self.voices.iter_mut() {
                if !v.env.is_active() {
                    continue;
                }
                let env =
                    v.env
                        .step(self.attack_ms, self.decay_ms, self.sustain, self.release_ms);
                let freq = midi_to_hz(v.note) * detune_ratio;
                let phase_inc = TWO_PI * freq / self.sample_rate;
                let s = (v.phase as f32).sin() * env * v.velocity;
                v.phase += phase_inc;
                if v.phase > TWO_PI {
                    v.phase -= TWO_PI;
                }
                sum += s;
            }
            sum *= gain_lin;
            out[f * 2] = sum;
            out[f * 2 + 1] = sum;
        }
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr as f64;
        for v in self.voices.iter_mut() {
            v.env.sample_rate = sr as f64;
        }
    }
}

// ── SuperSawInstrument ────────────────────────────────────────────────────

const SAW_COUNT: usize = 7;

struct SawVoice {
    note: u8,
    velocity: f32,
    phases: [f64; SAW_COUNT],
    env: Envelope,
    // Per-voice 2-pole lowpass state
    lp_z1: f32,
    lp_z2: f32,
}

impl SawVoice {
    fn new(sample_rate: f64) -> Self {
        Self {
            note: 0,
            velocity: 0.0,
            phases: [0.0; SAW_COUNT],
            env: Envelope::new(sample_rate),
            lp_z1: 0.0,
            lp_z2: 0.0,
        }
    }
}

pub struct SuperSawInstrument {
    sample_rate: f64,
    voices: Vec<SawVoice>,
    attack_ms: f64,
    decay_ms: f64,
    sustain: f64,
    release_ms: f64,
    detune: f64,
    mix: f64,
    cutoff_hz: f64,
    resonance: f64,
    gain_db: f64,
}

impl SuperSawInstrument {
    pub fn new() -> Self {
        let sr = 48_000.0;
        Self {
            sample_rate: sr,
            voices: (0..MAX_VOICES).map(|_| SawVoice::new(sr)).collect(),
            attack_ms: 10.0,
            decay_ms: 300.0,
            sustain: 0.7,
            release_ms: 400.0,
            detune: 0.4,
            mix: 0.6,
            cutoff_hz: 4000.0,
            resonance: 0.4,
            gain_db: -6.0,
        }
    }

    pub fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "attack" => self.attack_ms = value.max(0.0),
            "decay" => self.decay_ms = value.max(0.0),
            "sustain" => self.sustain = value.clamp(0.0, 1.0),
            "release" => self.release_ms = value.max(0.0),
            "detune" => self.detune = value.clamp(0.0, 1.0),
            "mix" => self.mix = value.clamp(0.0, 1.0),
            "cutoff" => self.cutoff_hz = value.clamp(20.0, 20_000.0),
            "resonance" => self.resonance = value.clamp(0.0, 0.99),
            "gainDb" => self.gain_db = value,
            _ => {}
        }
    }

    fn allocate_voice(&mut self) -> usize {
        if let Some(i) = self.voices.iter().position(|v| !v.env.is_active()) {
            return i;
        }
        let mut idx = 0;
        for (i, v) in self.voices.iter().enumerate() {
            if v.env.is_released() {
                idx = i;
                break;
            }
        }
        idx
    }
}

impl Default for SuperSawInstrument {
    fn default() -> Self {
        Self::new()
    }
}

impl Instrument for SuperSawInstrument {
    fn process(&mut self, events: &[MidiEvent], out: &mut [f32], n_frames: usize) {
        for s in out[..n_frames * 2].iter_mut() {
            *s = 0.0;
        }
        let gain_lin = 10f32.powf(self.gain_db as f32 / 20.0);
        // 7-saw detune offsets in cents (symmetric around center)
        let cents = [0.0, -12.0, 12.0, -7.0, 7.0, -22.0, 22.0];
        let mut detune_ratios = [1.0_f64; SAW_COUNT];
        for (i, c) in cents.iter().enumerate() {
            detune_ratios[i] = 2f64.powf((*c * self.detune) / 1200.0);
        }
        // Pre-compute SVF coefficients (constant per block).
        let g = (std::f64::consts::PI * self.cutoff_hz / self.sample_rate).tan() as f32;
        let k = (2.0 - 2.0 * self.resonance.clamp(0.0, 0.99)) as f32;
        let a = 1.0 / (1.0 + g * (g + k));
        let center_amp = (1.0 - self.mix) as f32;
        let side_amp = (self.mix / 6.0) as f32;
        let mut ev_idx = 0;
        for f in 0..n_frames {
            while ev_idx < events.len() && events[ev_idx].sample_offset as usize <= f {
                match events[ev_idx].kind {
                    MidiEventKind::NoteOn { pitch, velocity } => {
                        let i = self.allocate_voice();
                        let v = &mut self.voices[i];
                        v.note = pitch;
                        v.velocity = velocity as f32 / 127.0;
                        for p in v.phases.iter_mut() {
                            *p = (i as f64 * 0.137).fract();
                        }
                        v.lp_z1 = 0.0;
                        v.lp_z2 = 0.0;
                        v.env.note_on();
                    }
                    MidiEventKind::NoteOff { pitch } => {
                        for v in self.voices.iter_mut() {
                            if v.note == pitch && v.env.is_active() && !v.env.is_released() {
                                v.env.note_off();
                            }
                        }
                    }
                    MidiEventKind::AllOff => {
                        for v in self.voices.iter_mut() {
                            v.env.note_off();
                        }
                    }
                }
                ev_idx += 1;
            }
            let mut sum = 0.0_f32;
            for v in self.voices.iter_mut() {
                if !v.env.is_active() {
                    continue;
                }
                let env =
                    v.env
                        .step(self.attack_ms, self.decay_ms, self.sustain, self.release_ms);
                let f0 = midi_to_hz(v.note);
                let mut x = 0.0_f32;
                for (i, ratio) in detune_ratios.iter().enumerate() {
                    let inc = (f0 * ratio) / self.sample_rate;
                    v.phases[i] += inc;
                    if v.phases[i] >= 1.0 {
                        v.phases[i] -= 1.0;
                    }
                    let saw = (v.phases[i] as f32 * 2.0) - 1.0;
                    let amp = if i == 0 { center_amp } else { side_amp };
                    x += saw * amp;
                }
                // 2-pole topology-preserving SVF lowpass
                let v1 = a * (v.lp_z1 + g * (x - v.lp_z2));
                let v2 = v.lp_z2 + g * v1;
                v.lp_z1 = 2.0 * v1 - v.lp_z1;
                v.lp_z2 = 2.0 * v2 - v.lp_z2;
                sum += v2 * env * v.velocity;
            }
            sum *= gain_lin;
            out[f * 2] = sum;
            out[f * 2 + 1] = sum;
        }
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr as f64;
        for v in self.voices.iter_mut() {
            v.env.sample_rate = sr as f64;
        }
    }
}

// ── SubBassInstrument ─────────────────────────────────────────────────────

struct SubVoice {
    note: u8,
    velocity: f32,
    phase: f64,
    sub_phase: f64,
    env: Envelope,
}

impl SubVoice {
    fn new(sample_rate: f64) -> Self {
        Self {
            note: 0,
            velocity: 0.0,
            phase: 0.0,
            sub_phase: 0.0,
            env: Envelope::new(sample_rate),
        }
    }
}

pub struct SubBassInstrument {
    sample_rate: f64,
    voices: Vec<SubVoice>,
    attack_ms: f64,
    decay_ms: f64,
    sustain: f64,
    release_ms: f64,
    drive: f64,
    sub_octave_mix: f64,
    gain_db: f64,
}

impl SubBassInstrument {
    pub fn new() -> Self {
        let sr = 48_000.0;
        Self {
            sample_rate: sr,
            voices: (0..MAX_VOICES).map(|_| SubVoice::new(sr)).collect(),
            attack_ms: 5.0,
            decay_ms: 200.0,
            sustain: 0.85,
            release_ms: 200.0,
            drive: 2.5,
            sub_octave_mix: 0.5,
            gain_db: -3.0,
        }
    }

    pub fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "attack" => self.attack_ms = value.max(0.0),
            "decay" => self.decay_ms = value.max(0.0),
            "sustain" => self.sustain = value.clamp(0.0, 1.0),
            "release" => self.release_ms = value.max(0.0),
            "drive" => self.drive = value.clamp(0.5, 10.0),
            "subOctaveMix" => self.sub_octave_mix = value.clamp(0.0, 1.0),
            "gainDb" => self.gain_db = value,
            _ => {}
        }
    }

    fn allocate_voice(&mut self) -> usize {
        if let Some(i) = self.voices.iter().position(|v| !v.env.is_active()) {
            return i;
        }
        let mut idx = 0;
        for (i, v) in self.voices.iter().enumerate() {
            if v.env.is_released() {
                idx = i;
                break;
            }
        }
        idx
    }
}

impl Default for SubBassInstrument {
    fn default() -> Self {
        Self::new()
    }
}

impl Instrument for SubBassInstrument {
    fn process(&mut self, events: &[MidiEvent], out: &mut [f32], n_frames: usize) {
        for s in out[..n_frames * 2].iter_mut() {
            *s = 0.0;
        }
        let gain_lin = 10f32.powf(self.gain_db as f32 / 20.0);
        let drive = self.drive as f32;
        let mix_main = (1.0 - self.sub_octave_mix) as f32;
        let mix_sub = self.sub_octave_mix as f32;
        let mut ev_idx = 0;
        for f in 0..n_frames {
            while ev_idx < events.len() && events[ev_idx].sample_offset as usize <= f {
                match events[ev_idx].kind {
                    MidiEventKind::NoteOn { pitch, velocity } => {
                        let i = self.allocate_voice();
                        let v = &mut self.voices[i];
                        v.note = pitch;
                        v.velocity = velocity as f32 / 127.0;
                        v.phase = 0.0;
                        v.sub_phase = 0.0;
                        v.env.note_on();
                    }
                    MidiEventKind::NoteOff { pitch } => {
                        for v in self.voices.iter_mut() {
                            if v.note == pitch && v.env.is_active() && !v.env.is_released() {
                                v.env.note_off();
                            }
                        }
                    }
                    MidiEventKind::AllOff => {
                        for v in self.voices.iter_mut() {
                            v.env.note_off();
                        }
                    }
                }
                ev_idx += 1;
            }
            let mut sum = 0.0_f32;
            for v in self.voices.iter_mut() {
                if !v.env.is_active() {
                    continue;
                }
                let env =
                    v.env
                        .step(self.attack_ms, self.decay_ms, self.sustain, self.release_ms);
                let freq = midi_to_hz(v.note);
                let inc = TWO_PI * freq / self.sample_rate;
                let sub_inc = TWO_PI * (freq * 0.5) / self.sample_rate;
                let main = (v.phase as f32).sin();
                let sub = (v.sub_phase as f32).sin();
                v.phase += inc;
                v.sub_phase += sub_inc;
                if v.phase > TWO_PI {
                    v.phase -= TWO_PI;
                }
                if v.sub_phase > TWO_PI {
                    v.sub_phase -= TWO_PI;
                }
                let mixed = main * mix_main + sub * mix_sub;
                let saturated = (mixed * drive).tanh();
                sum += saturated * env * v.velocity;
            }
            sum *= gain_lin;
            out[f * 2] = sum;
            out[f * 2 + 1] = sum;
        }
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr as f64;
        for v in self.voices.iter_mut() {
            v.env.sample_rate = sr as f64;
        }
    }
}

// ── DrumKitInstrument ─────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DrumKind {
    Kick,
    Snare,
    ClosedHat,
    OpenHat,
    Clap,
}

#[derive(Clone, Copy)]
struct DrumTrigger {
    kind: DrumKind,
    velocity: f32,
    age: u32,
    active: bool,
    // Per-voice oscillator phase for kick body
    phase: f64,
    // Per-voice noise filter state for hat/snare/clap
    bp_z1: f32,
    bp_z2: f32,
}

impl DrumTrigger {
    fn empty() -> Self {
        Self {
            kind: DrumKind::Kick,
            velocity: 0.0,
            age: 0,
            active: false,
            phase: 0.0,
            bp_z1: 0.0,
            bp_z2: 0.0,
        }
    }
}

const MAX_DRUM_TRIGGERS: usize = 16;

pub struct DrumKitInstrument {
    sample_rate: f64,
    triggers: [DrumTrigger; MAX_DRUM_TRIGGERS],
    rng_state: u32,
    kick_pitch: f64,
    kick_decay: f64,
    snare_tone: f64,
    hat_decay: f64,
    gain_db: f64,
}

impl DrumKitInstrument {
    pub fn new() -> Self {
        Self {
            sample_rate: 48_000.0,
            triggers: [DrumTrigger::empty(); MAX_DRUM_TRIGGERS],
            rng_state: 0xa3b1_c2d4,
            kick_pitch: 60.0,
            kick_decay: 220.0,
            snare_tone: 0.5,
            hat_decay: 50.0,
            gain_db: -3.0,
        }
    }

    pub fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "kickPitch" => self.kick_pitch = value.clamp(30.0, 200.0),
            "kickDecay" => self.kick_decay = value.clamp(20.0, 800.0),
            "snareTone" => self.snare_tone = value.clamp(0.0, 1.0),
            "hatDecay" => self.hat_decay = value.clamp(5.0, 800.0),
            "gainDb" => self.gain_db = value,
            _ => {}
        }
    }

    fn next_rng(&mut self) -> f32 {
        // xorshift32
        let mut x = self.rng_state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng_state = x;
        ((x as f32) / (u32::MAX as f32)) * 2.0 - 1.0
    }

    fn trigger(&mut self, kind: DrumKind, velocity: f32) {
        for t in self.triggers.iter_mut() {
            if !t.active {
                t.kind = kind;
                t.velocity = velocity;
                t.age = 0;
                t.active = true;
                t.phase = 0.0;
                t.bp_z1 = 0.0;
                t.bp_z2 = 0.0;
                return;
            }
        }
        // Steal oldest
        let mut oldest = 0;
        let mut oldest_age = 0;
        for (i, t) in self.triggers.iter().enumerate() {
            if t.age > oldest_age {
                oldest_age = t.age;
                oldest = i;
            }
        }
        let t = &mut self.triggers[oldest];
        t.kind = kind;
        t.velocity = velocity;
        t.age = 0;
        t.phase = 0.0;
        t.bp_z1 = 0.0;
        t.bp_z2 = 0.0;
    }
}

impl Default for DrumKitInstrument {
    fn default() -> Self {
        Self::new()
    }
}

impl Instrument for DrumKitInstrument {
    fn process(&mut self, events: &[MidiEvent], out: &mut [f32], n_frames: usize) {
        for s in out[..n_frames * 2].iter_mut() {
            *s = 0.0;
        }
        let gain_lin = 10f32.powf(self.gain_db as f32 / 20.0);
        let sr = self.sample_rate as f32;
        let mut ev_idx = 0;
        for f in 0..n_frames {
            while ev_idx < events.len() && events[ev_idx].sample_offset as usize <= f {
                if let MidiEventKind::NoteOn { pitch, velocity } = events[ev_idx].kind {
                    let kind = match pitch {
                        36 => Some(DrumKind::Kick),
                        38 | 40 => Some(DrumKind::Snare),
                        42 | 44 => Some(DrumKind::ClosedHat),
                        46 => Some(DrumKind::OpenHat),
                        39 => Some(DrumKind::Clap),
                        _ => None,
                    };
                    if let Some(k) = kind {
                        self.trigger(k, velocity as f32 / 127.0);
                    }
                }
                ev_idx += 1;
            }
            let mut sum = 0.0_f32;
            for ti in 0..MAX_DRUM_TRIGGERS {
                if !self.triggers[ti].active {
                    continue;
                }
                let kind = self.triggers[ti].kind;
                let vel = self.triggers[ti].velocity;
                let age = self.triggers[ti].age;
                let t_secs = age as f32 / sr;
                let s = match kind {
                    DrumKind::Kick => {
                        // Pitch sweep: starts at kick_pitch*3, falls to kick_pitch over 50ms
                        let sweep = (-t_secs * 40.0).exp();
                        let inst_pitch = self.kick_pitch as f32 * (1.0 + 2.0 * sweep);
                        let body_env = (-t_secs * (1000.0 / self.kick_decay as f32)).exp();
                        let phase_inc = TWO_PI as f32 * inst_pitch / sr;
                        self.triggers[ti].phase += phase_inc as f64;
                        if self.triggers[ti].phase > TWO_PI {
                            self.triggers[ti].phase -= TWO_PI;
                        }
                        (self.triggers[ti].phase as f32).sin() * body_env * vel
                    }
                    DrumKind::Snare => {
                        let env = (-t_secs * 12.0).exp();
                        let noise = self.next_rng();
                        // Tone layer: 200 Hz sine
                        let tone_inc = TWO_PI as f32 * 200.0 / sr;
                        self.triggers[ti].phase += tone_inc as f64;
                        if self.triggers[ti].phase > TWO_PI {
                            self.triggers[ti].phase -= TWO_PI;
                        }
                        let tone = (self.triggers[ti].phase as f32).sin();
                        let mix = noise * (1.0 - self.snare_tone as f32)
                            + tone * (self.snare_tone as f32);
                        mix * env * vel * 0.8
                    }
                    DrumKind::ClosedHat | DrumKind::OpenHat => {
                        let decay = if matches!(kind, DrumKind::ClosedHat) {
                            self.hat_decay as f32
                        } else {
                            self.hat_decay as f32 * 5.0
                        };
                        let env = (-t_secs * (1000.0 / decay)).exp();
                        let noise = self.next_rng();
                        // 2-pole bandpass at 8 kHz, q ~3
                        let g = (std::f32::consts::PI * 8000.0 / sr).tan();
                        let k = 2.0 - 2.0 * 0.85;
                        let a = 1.0 / (1.0 + g * (g + k));
                        let v1 = a * (self.triggers[ti].bp_z1 + g * (noise - self.triggers[ti].bp_z2));
                        let v2 = self.triggers[ti].bp_z2 + g * v1;
                        self.triggers[ti].bp_z1 = 2.0 * v1 - self.triggers[ti].bp_z1;
                        self.triggers[ti].bp_z2 = 2.0 * v2 - self.triggers[ti].bp_z2;
                        v1 * env * vel * 0.6
                    }
                    DrumKind::Clap => {
                        // 4 short noise bursts spaced 8ms apart, then sustained tail
                        let burst_period = (sr * 0.008) as u32;
                        let bursts = (age / burst_period).min(4);
                        let burst_env = if bursts < 4 {
                            let phase_in_burst =
                                (age - bursts * burst_period) as f32 / burst_period as f32;
                            (1.0 - phase_in_burst).max(0.0)
                        } else {
                            (-t_secs * 8.0).exp()
                        };
                        let noise = self.next_rng();
                        // Tame highs with bandpass at 1.5 kHz
                        let g = (std::f32::consts::PI * 1500.0 / sr).tan();
                        let k = 2.0 - 2.0 * 0.7;
                        let a = 1.0 / (1.0 + g * (g + k));
                        let v1 = a * (self.triggers[ti].bp_z1 + g * (noise - self.triggers[ti].bp_z2));
                        let v2 = self.triggers[ti].bp_z2 + g * v1;
                        self.triggers[ti].bp_z1 = 2.0 * v1 - self.triggers[ti].bp_z1;
                        self.triggers[ti].bp_z2 = 2.0 * v2 - self.triggers[ti].bp_z2;
                        v1 * burst_env * vel * 0.7
                    }
                };
                sum += s;
                self.triggers[ti].age = self.triggers[ti].age.saturating_add(1);
                // Deactivate after ~2 seconds
                if self.triggers[ti].age as f32 / sr > 2.0 {
                    self.triggers[ti].active = false;
                }
            }
            let s = sum * gain_lin;
            out[f * 2] = s;
            out[f * 2 + 1] = s;
        }
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr as f64;
    }
}

// ── Factory ───────────────────────────────────────────────────────────────

/// Construct a built-in instrument from its `uid`. Returns `None` if the uid
/// is unknown — callers fall through to `SilentInstrument` in that case.
pub fn make_builtin_instrument(uid: &str) -> Option<Box<dyn Instrument>> {
    match uid {
        "sine" => Some(Box::new(SineInstrument::new())),
        "supersaw" => Some(Box::new(SuperSawInstrument::new())),
        "subbass" => Some(Box::new(SubBassInstrument::new())),
        "drumkit" => Some(Box::new(DrumKitInstrument::new())),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(buf: &[f32]) -> f32 {
        if buf.is_empty() {
            return 0.0;
        }
        (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt()
    }

    #[test]
    fn sine_produces_audio_after_note_on() {
        let mut inst = SineInstrument::new();
        inst.set_sample_rate(48_000);
        let events = [MidiEvent::note_on(0, 60, 100)];
        let mut buf = vec![0.0_f32; 1024 * 2];
        inst.process(&events, &mut buf, 1024);
        let r = rms(&buf);
        assert!(r > 0.05, "expected non-silent sine output, rms={r}");
    }

    #[test]
    fn sine_voice_release_silences() {
        let mut inst = SineInstrument::new();
        inst.set_sample_rate(48_000);
        inst.set_param("release", 5.0);
        let on = [MidiEvent::note_on(0, 60, 100)];
        let off = [MidiEvent::note_off(0, 60)];
        let mut buf = vec![0.0_f32; 1024 * 2];
        inst.process(&on, &mut buf, 1024);
        // After noteOff and a long render the buffer should fade.
        for _ in 0..10 {
            inst.process(&off, &mut buf, 1024);
        }
        let r = rms(&buf);
        assert!(r < 0.01, "expected silent after release, rms={r}");
    }

    #[test]
    fn supersaw_produces_audio() {
        let mut inst = SuperSawInstrument::new();
        inst.set_sample_rate(48_000);
        let events = [MidiEvent::note_on(0, 64, 110)];
        let mut buf = vec![0.0_f32; 2048 * 2];
        inst.process(&events, &mut buf, 2048);
        let r = rms(&buf);
        assert!(r > 0.02, "expected non-silent supersaw output, rms={r}");
    }

    #[test]
    fn subbass_produces_audio() {
        let mut inst = SubBassInstrument::new();
        inst.set_sample_rate(48_000);
        let events = [MidiEvent::note_on(0, 36, 110)];
        let mut buf = vec![0.0_f32; 2048 * 2];
        inst.process(&events, &mut buf, 2048);
        let r = rms(&buf);
        assert!(r > 0.05, "expected non-silent subbass output, rms={r}");
    }

    #[test]
    fn drumkit_kick_produces_audio() {
        let mut inst = DrumKitInstrument::new();
        inst.set_sample_rate(48_000);
        let events = [MidiEvent::note_on(0, 36, 120)];
        let mut buf = vec![0.0_f32; 2048 * 2];
        inst.process(&events, &mut buf, 2048);
        let r = rms(&buf);
        assert!(r > 0.02, "expected non-silent kick output, rms={r}");
    }

    #[test]
    fn drumkit_snare_and_hat_produce_audio() {
        let mut inst = DrumKitInstrument::new();
        inst.set_sample_rate(48_000);
        let events = [
            MidiEvent::note_on(0, 38, 120),
            MidiEvent::note_on(64, 42, 100),
        ];
        let mut buf = vec![0.0_f32; 2048 * 2];
        inst.process(&events, &mut buf, 2048);
        let r = rms(&buf);
        assert!(r > 0.01, "expected non-silent snare+hat output, rms={r}");
    }

    #[test]
    fn voice_stealing_does_not_panic() {
        let mut inst = SineInstrument::new();
        inst.set_sample_rate(48_000);
        // Allocate more notes than MAX_VOICES (16)
        let events: Vec<MidiEvent> = (0..32)
            .map(|i| MidiEvent::note_on(0, 40 + i as u8, 100))
            .collect();
        let mut buf = vec![0.0_f32; 256 * 2];
        inst.process(&events, &mut buf, 256);
        // Should not panic; voices should still produce audio
        let r = rms(&buf);
        assert!(r > 0.0);
    }

    #[test]
    fn make_builtin_instrument_known_ids() {
        assert!(make_builtin_instrument("sine").is_some());
        assert!(make_builtin_instrument("supersaw").is_some());
        assert!(make_builtin_instrument("subbass").is_some());
        assert!(make_builtin_instrument("drumkit").is_some());
        assert!(make_builtin_instrument("unknown").is_none());
    }
}
