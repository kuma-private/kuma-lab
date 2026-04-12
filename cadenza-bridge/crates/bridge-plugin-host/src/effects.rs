//! Built-in insert effects shipped with the Bridge. These exist so projects
//! can be tested end-to-end without external CLAP/VST3 hosts. Each effect
//! is small (`~50 lines`) and processes interleaved stereo in-place.

use crate::automation::AutomationFrame;

/// All built-in effects implement this trait. The host calls `process` once
/// per audio block with a stereo interleaved buffer of `n_frames * 2`
/// samples and an optional automation frame providing per-sample param ramps.
pub trait InsertEffect: Send {
    /// Process audio in-place. `audio.len() == n_frames * 2`.
    fn process(&mut self, audio: &mut [f32], n_frames: usize, automation: &AutomationFrame);
    /// Set a static parameter (used when no automation is active for that param).
    fn set_param(&mut self, id: &str, value: f64);
    /// Read back current value of a parameter.
    fn get_param(&self, id: &str) -> f64;
    /// List of supported parameter ids.
    fn param_ids(&self) -> &'static [&'static str];
    /// Sample rate hint (some effects need it for time constants).
    fn set_sample_rate(&mut self, _sr: u32) {}
    /// Effect type id ("gain", "svf", "compressor"). Used by patch decode.
    fn type_id(&self) -> &'static str;
}

// ── GainEffect ────────────────────────────────────────────────────────────

pub struct GainEffect {
    gain_db: f64,
}

impl GainEffect {
    pub fn new() -> Self {
        Self { gain_db: 0.0 }
    }
    pub fn with_gain_db(g: f64) -> Self {
        Self { gain_db: g }
    }
}

impl Default for GainEffect {
    fn default() -> Self {
        Self::new()
    }
}

impl InsertEffect for GainEffect {
    fn process(&mut self, audio: &mut [f32], n_frames: usize, automation: &AutomationFrame) {
        if let Some(ramp) = automation.active_ramp("gainDb") {
            // Per-sample ramp in dB → linear; one gain value per frame, both channels.
            let nf = n_frames.min(ramp.len());
            for i in 0..nf {
                let g = 10f32.powf(ramp[i] / 20.0);
                audio[i * 2] *= g;
                audio[i * 2 + 1] *= g;
            }
        } else {
            let g = 10f32.powf(self.gain_db as f32 / 20.0);
            for s in audio.iter_mut() {
                *s *= g;
            }
        }
    }
    fn set_param(&mut self, id: &str, value: f64) {
        if id == "gainDb" {
            self.gain_db = value;
        }
    }
    fn get_param(&self, id: &str) -> f64 {
        if id == "gainDb" {
            self.gain_db
        } else {
            0.0
        }
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &["gainDb"]
    }
    fn type_id(&self) -> &'static str {
        "gain"
    }
}

// ── State Variable Filter ─────────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
pub enum SvfMode {
    LowPass,
    HighPass,
    BandPass,
}

pub struct StateVariableFilter {
    cutoff_hz: f64,
    resonance: f64,
    mode: SvfMode,
    sr: f64,
    // Per-channel state
    z1l: f32,
    z2l: f32,
    z1r: f32,
    z2r: f32,
}

impl StateVariableFilter {
    pub fn new() -> Self {
        Self {
            cutoff_hz: 1000.0,
            resonance: 0.5,
            mode: SvfMode::LowPass,
            sr: 48_000.0,
            z1l: 0.0,
            z2l: 0.0,
            z1r: 0.0,
            z2r: 0.0,
        }
    }
    fn coeffs(cutoff: f64, q: f64, sr: f64) -> (f32, f32) {
        let g = (std::f64::consts::PI * cutoff / sr).tan() as f32;
        let k = (2.0 - 2.0 * q.clamp(0.0, 0.99)) as f32;
        (g, k)
    }
    fn step(g: f32, k: f32, z1: &mut f32, z2: &mut f32, x: f32, mode: SvfMode) -> f32 {
        // Topology-preserving SVF (Andy Simper)
        let a = 1.0 / (1.0 + g * (g + k));
        let v1 = a * (*z1 + g * (x - *z2));
        let v2 = *z2 + g * v1;
        *z1 = 2.0 * v1 - *z1;
        *z2 = 2.0 * v2 - *z2;
        match mode {
            SvfMode::LowPass => v2,
            SvfMode::HighPass => x - k * v1 - v2,
            SvfMode::BandPass => v1,
        }
    }
}

impl Default for StateVariableFilter {
    fn default() -> Self {
        Self::new()
    }
}

impl InsertEffect for StateVariableFilter {
    fn process(&mut self, audio: &mut [f32], n_frames: usize, automation: &AutomationFrame) {
        let cutoff_ramp = automation.active_ramp("cutoff");
        let res_ramp = automation.active_ramp("resonance");
        for i in 0..n_frames {
            let cutoff = cutoff_ramp
                .and_then(|r| r.get(i).copied())
                .map(|v| v as f64)
                .unwrap_or(self.cutoff_hz);
            let q = res_ramp
                .and_then(|r| r.get(i).copied())
                .map(|v| v as f64)
                .unwrap_or(self.resonance);
            let (g, k) = Self::coeffs(cutoff.max(20.0), q, self.sr);
            let l = audio[i * 2];
            let r = audio[i * 2 + 1];
            audio[i * 2] = Self::step(g, k, &mut self.z1l, &mut self.z2l, l, self.mode);
            audio[i * 2 + 1] = Self::step(g, k, &mut self.z1r, &mut self.z2r, r, self.mode);
        }
    }
    fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "cutoff" => self.cutoff_hz = value.max(20.0),
            "resonance" => self.resonance = value.clamp(0.0, 0.99),
            "mode" => {
                self.mode = match value as i32 {
                    1 => SvfMode::HighPass,
                    2 => SvfMode::BandPass,
                    _ => SvfMode::LowPass,
                };
            }
            _ => {}
        }
    }
    fn get_param(&self, id: &str) -> f64 {
        match id {
            "cutoff" => self.cutoff_hz,
            "resonance" => self.resonance,
            "mode" => match self.mode {
                SvfMode::LowPass => 0.0,
                SvfMode::HighPass => 1.0,
                SvfMode::BandPass => 2.0,
            },
            _ => 0.0,
        }
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &["cutoff", "resonance", "mode"]
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sr = sr as f64;
    }
    fn type_id(&self) -> &'static str {
        "svf"
    }
}

// ── Compressor ────────────────────────────────────────────────────────────

pub struct Compressor {
    threshold_db: f64,
    ratio: f64,
    attack_ms: f64,
    release_ms: f64,
    sr: f64,
    env: f32,
}

impl Compressor {
    pub fn new() -> Self {
        Self {
            threshold_db: -12.0,
            ratio: 4.0,
            attack_ms: 10.0,
            release_ms: 100.0,
            sr: 48_000.0,
            env: 0.0,
        }
    }
    fn coef(time_ms: f64, sr: f64) -> f32 {
        if time_ms <= 0.0 {
            0.0
        } else {
            (-1.0 / (time_ms * 0.001 * sr)).exp() as f32
        }
    }
}

impl Default for Compressor {
    fn default() -> Self {
        Self::new()
    }
}

impl InsertEffect for Compressor {
    fn process(&mut self, audio: &mut [f32], n_frames: usize, _automation: &AutomationFrame) {
        let att = Self::coef(self.attack_ms, self.sr);
        let rel = Self::coef(self.release_ms, self.sr);
        let thr = 10f32.powf(self.threshold_db as f32 / 20.0);
        let inv_ratio = 1.0 / self.ratio as f32;
        for i in 0..n_frames {
            let l = audio[i * 2];
            let r = audio[i * 2 + 1];
            let inp = l.abs().max(r.abs());
            // Branching peak detector
            let coef = if inp > self.env { att } else { rel };
            self.env = inp + coef * (self.env - inp);
            let g = if self.env > thr {
                // Reduce overshoot proportional to (1 - 1/ratio)
                let over = self.env / thr;
                over.powf(inv_ratio - 1.0)
            } else {
                1.0
            };
            audio[i * 2] = l * g;
            audio[i * 2 + 1] = r * g;
        }
    }
    fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "thresholdDb" => self.threshold_db = value,
            "ratio" => self.ratio = value.max(1.0),
            "attackMs" => self.attack_ms = value.max(0.0),
            "releaseMs" => self.release_ms = value.max(0.0),
            _ => {}
        }
    }
    fn get_param(&self, id: &str) -> f64 {
        match id {
            "thresholdDb" => self.threshold_db,
            "ratio" => self.ratio,
            "attackMs" => self.attack_ms,
            "releaseMs" => self.release_ms,
            _ => 0.0,
        }
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &["thresholdDb", "ratio", "attackMs", "releaseMs"]
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sr = sr as f64;
    }
    fn type_id(&self) -> &'static str {
        "compressor"
    }
}

// ── DelayEffect ───────────────────────────────────────────────────────────

pub struct DelayEffect {
    sample_rate: f64,
    buffer_l: Vec<f32>,
    buffer_r: Vec<f32>,
    write_pos: usize,
    time_ms: f64,
    feedback: f64,
    mix: f64,
    ping_pong: bool,
}

impl DelayEffect {
    pub fn new() -> Self {
        let sr = 48_000.0;
        let max_samples = (sr * 2.5) as usize; // up to 2.5 s
        Self {
            sample_rate: sr,
            buffer_l: vec![0.0; max_samples],
            buffer_r: vec![0.0; max_samples],
            write_pos: 0,
            time_ms: 350.0,
            feedback: 0.4,
            mix: 0.3,
            ping_pong: false,
        }
    }
    fn delay_samples(&self) -> usize {
        ((self.time_ms * 0.001 * self.sample_rate) as usize)
            .clamp(1, self.buffer_l.len() - 1)
    }
}

impl Default for DelayEffect {
    fn default() -> Self {
        Self::new()
    }
}

impl InsertEffect for DelayEffect {
    fn process(&mut self, audio: &mut [f32], n_frames: usize, _automation: &AutomationFrame) {
        let len = self.buffer_l.len();
        let delay = self.delay_samples();
        let fb = self.feedback as f32;
        let mix = self.mix as f32;
        for i in 0..n_frames {
            let l_in = audio[i * 2];
            let r_in = audio[i * 2 + 1];
            let read = (self.write_pos + len - delay) % len;
            let l_dly = self.buffer_l[read];
            let r_dly = self.buffer_r[read];
            // Write back input + feedback. Ping-pong cross-feeds channels.
            if self.ping_pong {
                self.buffer_l[self.write_pos] = r_in + r_dly * fb;
                self.buffer_r[self.write_pos] = l_in + l_dly * fb;
            } else {
                self.buffer_l[self.write_pos] = l_in + l_dly * fb;
                self.buffer_r[self.write_pos] = r_in + r_dly * fb;
            }
            audio[i * 2] = l_in * (1.0 - mix) + l_dly * mix;
            audio[i * 2 + 1] = r_in * (1.0 - mix) + r_dly * mix;
            self.write_pos = (self.write_pos + 1) % len;
        }
    }
    fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "timeMs" => self.time_ms = value.clamp(1.0, 2000.0),
            "feedback" => self.feedback = value.clamp(0.0, 0.95),
            "mix" => self.mix = value.clamp(0.0, 1.0),
            "pingPong" => self.ping_pong = value > 0.5,
            _ => {}
        }
    }
    fn get_param(&self, id: &str) -> f64 {
        match id {
            "timeMs" => self.time_ms,
            "feedback" => self.feedback,
            "mix" => self.mix,
            "pingPong" => {
                if self.ping_pong {
                    1.0
                } else {
                    0.0
                }
            }
            _ => 0.0,
        }
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &["timeMs", "feedback", "mix", "pingPong"]
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr as f64;
        let max = (self.sample_rate * 2.5) as usize;
        if self.buffer_l.len() != max {
            self.buffer_l.clear();
            self.buffer_r.clear();
            self.buffer_l.resize(max, 0.0);
            self.buffer_r.resize(max, 0.0);
            self.write_pos = 0;
        }
    }
    fn type_id(&self) -> &'static str {
        "delay"
    }
}

// ── ReverbEffect (Schroeder) ──────────────────────────────────────────────

struct CombFilter {
    buf: Vec<f32>,
    pos: usize,
    feedback: f32,
    damping: f32,
    z: f32,
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buf: vec![0.0; size],
            pos: 0,
            feedback: 0.7,
            damping: 0.5,
            z: 0.0,
        }
    }
    fn process(&mut self, x: f32) -> f32 {
        let out = self.buf[self.pos];
        self.z = out * (1.0 - self.damping) + self.z * self.damping;
        self.buf[self.pos] = x + self.z * self.feedback;
        self.pos = (self.pos + 1) % self.buf.len();
        out
    }
}

struct AllpassFilter {
    buf: Vec<f32>,
    pos: usize,
    feedback: f32,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buf: vec![0.0; size],
            pos: 0,
            feedback: 0.5,
        }
    }
    fn process(&mut self, x: f32) -> f32 {
        let bufout = self.buf[self.pos];
        let out = -x + bufout;
        self.buf[self.pos] = x + bufout * self.feedback;
        self.pos = (self.pos + 1) % self.buf.len();
        out
    }
}

pub struct ReverbEffect {
    sample_rate: f64,
    combs_l: [CombFilter; 4],
    combs_r: [CombFilter; 4],
    allpasses_l: [AllpassFilter; 2],
    allpasses_r: [AllpassFilter; 2],
    room_size: f64,
    damping: f64,
    mix: f64,
    width: f64,
}

impl ReverbEffect {
    pub fn new() -> Self {
        // Tunings adapted from Freeverb (samples at 44.1 kHz reference rate).
        let comb_sizes_l = [1116, 1188, 1277, 1356];
        let comb_sizes_r = [1139, 1211, 1300, 1379];
        let ap_sizes_l = [556, 441];
        let ap_sizes_r = [579, 464];
        Self {
            sample_rate: 48_000.0,
            combs_l: [
                CombFilter::new(comb_sizes_l[0]),
                CombFilter::new(comb_sizes_l[1]),
                CombFilter::new(comb_sizes_l[2]),
                CombFilter::new(comb_sizes_l[3]),
            ],
            combs_r: [
                CombFilter::new(comb_sizes_r[0]),
                CombFilter::new(comb_sizes_r[1]),
                CombFilter::new(comb_sizes_r[2]),
                CombFilter::new(comb_sizes_r[3]),
            ],
            allpasses_l: [
                AllpassFilter::new(ap_sizes_l[0]),
                AllpassFilter::new(ap_sizes_l[1]),
            ],
            allpasses_r: [
                AllpassFilter::new(ap_sizes_r[0]),
                AllpassFilter::new(ap_sizes_r[1]),
            ],
            room_size: 0.5,
            damping: 0.5,
            mix: 0.3,
            width: 1.0,
        }
    }
    fn refresh_coeffs(&mut self) {
        let fb = (0.28 + 0.7 * self.room_size) as f32;
        let damp = self.damping as f32;
        for c in self.combs_l.iter_mut() {
            c.feedback = fb;
            c.damping = damp;
        }
        for c in self.combs_r.iter_mut() {
            c.feedback = fb;
            c.damping = damp;
        }
    }
}

impl Default for ReverbEffect {
    fn default() -> Self {
        let mut r = Self::new();
        r.refresh_coeffs();
        r
    }
}

impl InsertEffect for ReverbEffect {
    fn process(&mut self, audio: &mut [f32], n_frames: usize, _automation: &AutomationFrame) {
        self.refresh_coeffs();
        let mix = self.mix as f32;
        let dry = 1.0 - mix;
        let width = self.width.clamp(0.0, 1.0) as f32;
        for i in 0..n_frames {
            let l_in = audio[i * 2];
            let r_in = audio[i * 2 + 1];
            let mono = (l_in + r_in) * 0.5 * 0.015;
            let mut wl = 0.0_f32;
            let mut wr = 0.0_f32;
            for c in self.combs_l.iter_mut() {
                wl += c.process(mono);
            }
            for c in self.combs_r.iter_mut() {
                wr += c.process(mono);
            }
            for ap in self.allpasses_l.iter_mut() {
                wl = ap.process(wl);
            }
            for ap in self.allpasses_r.iter_mut() {
                wr = ap.process(wr);
            }
            // Stereo width: blend mono/stereo
            let mid = (wl + wr) * 0.5;
            let side = (wl - wr) * 0.5 * width;
            let wet_l = mid + side;
            let wet_r = mid - side;
            audio[i * 2] = l_in * dry + wet_l * mix;
            audio[i * 2 + 1] = r_in * dry + wet_r * mix;
        }
    }
    fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "roomSize" => self.room_size = value.clamp(0.0, 1.0),
            "damping" => self.damping = value.clamp(0.0, 1.0),
            "mix" => self.mix = value.clamp(0.0, 1.0),
            "width" => self.width = value.clamp(0.0, 1.0),
            _ => {}
        }
    }
    fn get_param(&self, id: &str) -> f64 {
        match id {
            "roomSize" => self.room_size,
            "damping" => self.damping,
            "mix" => self.mix,
            "width" => self.width,
            _ => 0.0,
        }
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &["roomSize", "damping", "mix", "width"]
    }
    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr as f64;
    }
    fn type_id(&self) -> &'static str {
        "reverb"
    }
}

// ── SaturationEffect ──────────────────────────────────────────────────────

pub struct SaturationEffect {
    drive_db: f64,
    mix: f64,
}

impl SaturationEffect {
    pub fn new() -> Self {
        Self {
            drive_db: 6.0,
            mix: 1.0,
        }
    }
}

impl Default for SaturationEffect {
    fn default() -> Self {
        Self::new()
    }
}

impl InsertEffect for SaturationEffect {
    fn process(&mut self, audio: &mut [f32], n_frames: usize, _automation: &AutomationFrame) {
        let drive = 10f32.powf(self.drive_db as f32 / 20.0);
        let mix = self.mix as f32;
        let dry = 1.0 - mix;
        // Compensation: divide back so unity drive_db = 0 doesn't change loudness.
        let comp = 1.0 / drive.max(1.0);
        for i in 0..n_frames {
            let l = audio[i * 2];
            let r = audio[i * 2 + 1];
            let wl = (l * drive).tanh() * comp;
            let wr = (r * drive).tanh() * comp;
            audio[i * 2] = l * dry + wl * mix;
            audio[i * 2 + 1] = r * dry + wr * mix;
        }
    }
    fn set_param(&mut self, id: &str, value: f64) {
        match id {
            "drive" => self.drive_db = value.clamp(0.0, 24.0),
            "mix" => self.mix = value.clamp(0.0, 1.0),
            _ => {}
        }
    }
    fn get_param(&self, id: &str) -> f64 {
        match id {
            "drive" => self.drive_db,
            "mix" => self.mix,
            _ => 0.0,
        }
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &["drive", "mix"]
    }
    fn type_id(&self) -> &'static str {
        "saturation"
    }
}

// ── Factory ───────────────────────────────────────────────────────────────

/// Construct a built-in insert effect from its `uid`. Returns `None` if the
/// uid is unknown.
pub fn make_builtin(uid: &str) -> Option<Box<dyn InsertEffect>> {
    match uid {
        "gain" => Some(Box::new(GainEffect::new())),
        "svf" => Some(Box::new(StateVariableFilter::new())),
        "compressor" => Some(Box::new(Compressor::new())),
        "delay" => Some(Box::new(DelayEffect::new())),
        "reverb" => Some(Box::new(ReverbEffect::default())),
        "saturation" => Some(Box::new(SaturationEffect::new())),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::AutomationFrame;

    fn af() -> AutomationFrame {
        AutomationFrame::default()
    }

    #[test]
    fn gain_effect_scales_signal() {
        let mut g = GainEffect::with_gain_db(-6.0);
        let mut buf = vec![1.0_f32; 4];
        g.process(&mut buf, 2, &af());
        // -6dB ≈ 0.5012
        assert!((buf[0] - 0.5012).abs() < 0.01);
    }

    #[test]
    fn gain_zero_db_passes_through() {
        let mut g = GainEffect::new();
        let mut buf = vec![0.5_f32; 4];
        g.process(&mut buf, 2, &af());
        assert!((buf[0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn svf_lowpass_attenuates_high_freq() {
        let mut f = StateVariableFilter::new();
        f.set_sample_rate(48_000);
        f.set_param("cutoff", 200.0);
        f.set_param("resonance", 0.5);
        // 4 kHz sine input
        let n = 1024;
        let mut buf = vec![0.0_f32; n * 2];
        for i in 0..n {
            let s = (2.0 * std::f32::consts::PI * 4000.0 * (i as f32) / 48_000.0).sin();
            buf[i * 2] = s;
            buf[i * 2 + 1] = s;
        }
        f.process(&mut buf, n, &af());
        // Skip transient — measure RMS over the last half
        let rms: f32 = buf[n..]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            .sqrt()
            / (n as f32).sqrt();
        assert!(rms < 0.3, "lowpass should attenuate 4 kHz heavily, got {rms}");
    }

    #[test]
    fn compressor_reduces_loud_signal() {
        let mut c = Compressor::new();
        c.set_sample_rate(48_000);
        c.set_param("thresholdDb", -20.0);
        c.set_param("ratio", 8.0);
        c.set_param("attackMs", 0.1);
        let mut buf = vec![1.0_f32; 1024];
        c.process(&mut buf, 512, &af());
        // After settling we expect the level well below 1.0
        let last = buf[1022];
        assert!(last.abs() < 0.6, "compressor should attenuate; got {last}");
    }

    #[test]
    fn make_builtin_known_ids() {
        assert!(make_builtin("gain").is_some());
        assert!(make_builtin("svf").is_some());
        assert!(make_builtin("compressor").is_some());
        assert!(make_builtin("delay").is_some());
        assert!(make_builtin("reverb").is_some());
        assert!(make_builtin("saturation").is_some());
        assert!(make_builtin("unknown").is_none());
    }

    fn fill_white_noise(buf: &mut [f32]) {
        let mut x = 0x9e3779b9_u32;
        for s in buf.iter_mut() {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            *s = ((x as f32) / (u32::MAX as f32)) * 0.5 - 0.25;
        }
    }

    fn rms(buf: &[f32]) -> f32 {
        if buf.is_empty() {
            return 0.0;
        }
        (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt()
    }

    #[test]
    fn delay_effect_alters_signal() {
        let mut d = DelayEffect::new();
        d.set_sample_rate(48_000);
        d.set_param("timeMs", 100.0);
        d.set_param("feedback", 0.5);
        d.set_param("mix", 0.5);
        let mut input = vec![0.0_f32; 4096 * 2];
        fill_white_noise(&mut input);
        let original = input.clone();
        d.process(&mut input, 4096, &af());
        let diff: f32 = input.iter().zip(original.iter()).map(|(a, b)| (a - b).abs()).sum();
        assert!(diff > 0.1, "delay should alter signal, diff={diff}");
    }

    #[test]
    fn reverb_effect_alters_signal() {
        let mut r = ReverbEffect::default();
        r.set_sample_rate(48_000);
        r.set_param("mix", 0.5);
        r.set_param("roomSize", 0.7);
        let mut input = vec![0.0_f32; 4096 * 2];
        fill_white_noise(&mut input);
        let original = input.clone();
        r.process(&mut input, 4096, &af());
        let diff: f32 = input.iter().zip(original.iter()).map(|(a, b)| (a - b).abs()).sum();
        assert!(diff > 0.1, "reverb should alter signal, diff={diff}");
    }

    #[test]
    fn saturation_effect_clips_loud_input() {
        let mut s = SaturationEffect::new();
        s.set_param("drive", 24.0);
        s.set_param("mix", 1.0);
        let mut buf = vec![5.0_f32; 256];
        s.process(&mut buf, 128, &af());
        // Tanh-saturated and compensated should be < 1.0 magnitude
        for v in buf.iter() {
            assert!(v.abs() < 1.0, "saturation should clip, got {v}");
        }
        // Output is non-zero (signal still passes)
        let r = rms(&buf);
        assert!(r > 0.01);
    }
}
