//! Per-block automation. The host pre-computes a per-sample ramp for each
//! automated parameter at the start of every audio block, then the insert
//! effect (or track gain) reads from the ramp during processing.
//!
//! Curve types:
//! - Linear: lerp between adjacent points
//! - Hold: take the prior point's value (zero-order hold)
//! - Bezier: cubic with implicit symmetric tangents (smoothstep approximation)

use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Curve {
    Linear,
    Hold,
    Bezier,
}

impl Curve {
    /// Inherent helper — a free `Curve::from_label("linear")` is more
    /// ergonomic at call sites than the trait dance, and we never need the
    /// fallible `FromStr` semantics here.
    pub fn from_label(s: &str) -> Self {
        match s {
            "hold" => Curve::Hold,
            "bezier" => Curve::Bezier,
            _ => Curve::Linear,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AutomationPoint {
    pub tick: i64,
    pub value: f64,
    pub curve: Curve,
}

#[derive(Debug, Clone)]
pub struct Automation {
    /// Empty string => the track itself (gain/pan).
    pub target_node_id: String,
    pub target_param_id: String,
    pub points: Vec<AutomationPoint>,
}

impl Automation {
    /// Sample the lane at a fractional tick. Returns the constant value if
    /// only one point exists, or the curve interpolation between adjacent
    /// points. Out-of-range queries clamp to the nearest endpoint.
    pub fn value_at(&self, tick: f64) -> f64 {
        if self.points.is_empty() {
            return 0.0;
        }
        if self.points.len() == 1 {
            return self.points[0].value;
        }
        if tick <= self.points[0].tick as f64 {
            return self.points[0].value;
        }
        let last = self.points.last().unwrap();
        if tick >= last.tick as f64 {
            return last.value;
        }
        // Find the segment containing `tick`.
        // For reasonable point counts (<256) linear scan is faster than binary search.
        for w in self.points.windows(2) {
            let a = w[0];
            let b = w[1];
            if tick >= a.tick as f64 && tick <= b.tick as f64 {
                let span = (b.tick - a.tick) as f64;
                let t = if span > 0.0 {
                    (tick - a.tick as f64) / span
                } else {
                    0.0
                };
                return interpolate(a.value, b.value, t, a.curve);
            }
        }
        last.value
    }
}

fn interpolate(a: f64, b: f64, t: f64, curve: Curve) -> f64 {
    match curve {
        Curve::Hold => a,
        Curve::Linear => a + (b - a) * t,
        Curve::Bezier => {
            // Smoothstep — symmetric S-curve, indistinguishable from a tame
            // bezier with implicit tangents in this context.
            let s = t * t * (3.0 - 2.0 * t);
            a + (b - a) * s
        }
    }
}

/// AutomationFrame is the per-block compiled view: a hash map from param-id to
/// `Vec<f32>` of length `n_frames`. Built once per block by `Graph::process`.
/// We keep `ramps` allocated across calls — `clear_active()` resets which
/// ramps are active without dropping the underlying buffers, so the audio
/// callback never allocates.
#[derive(Debug, Default, Clone)]
pub struct AutomationFrame {
    pub ramps: HashMap<String, Vec<f32>>,
    /// Names that are "active" for this block. Effects should consult
    /// `active_ramp(name)` rather than `ramps.get(name)` directly so a stale
    /// buffer from a previous block is not picked up.
    active: Vec<String>,
}

impl AutomationFrame {
    pub fn clear(&mut self) {
        self.active.clear();
    }
    /// Look up an active ramp by name. Returns None if no automation lane
    /// targets this parameter for the current block.
    pub fn active_ramp(&self, name: &str) -> Option<&[f32]> {
        if self.active.iter().any(|s| s == name) {
            self.ramps.get(name).map(|v| v.as_slice())
        } else {
            None
        }
    }
    /// Get-or-create a buffer slot for `name`, mark it active, resize to
    /// `n_frames`, and return a mutable slice the caller can fill.
    pub fn make_active(&mut self, name: &str, n_frames: usize) -> &mut [f32] {
        if !self.active.iter().any(|s| s == name) {
            self.active.push(name.to_string());
        }
        let entry = self
            .ramps
            .entry(name.to_string())
            .or_insert_with(|| Vec::with_capacity(n_frames));
        if entry.len() < n_frames {
            entry.resize(n_frames, 0.0);
        }
        &mut entry[..n_frames]
    }
}

/// Compile a single automation lane into a per-sample ramp `out` of length
/// `n_frames`. `start_tick_f` is the (fractional) playhead at the start of
/// the block; `ticks_per_sample` is the increment per sample.
pub fn compile_ramp(
    auto: &Automation,
    start_tick_f: f64,
    ticks_per_sample: f64,
    n_frames: usize,
    out: &mut Vec<f32>,
) {
    if out.len() != n_frames {
        out.resize(n_frames, 0.0);
    }
    for (i, slot) in out.iter_mut().enumerate().take(n_frames) {
        let t = start_tick_f + ticks_per_sample * (i as f64);
        *slot = auto.value_at(t) as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pt(tick: i64, value: f64, curve: Curve) -> AutomationPoint {
        AutomationPoint { tick, value, curve }
    }

    #[test]
    fn linear_lerp() {
        let a = Automation {
            target_node_id: String::new(),
            target_param_id: "g".into(),
            points: vec![pt(0, 0.0, Curve::Linear), pt(100, 1.0, Curve::Linear)],
        };
        assert!((a.value_at(0.0) - 0.0).abs() < 1e-9);
        assert!((a.value_at(50.0) - 0.5).abs() < 1e-9);
        assert!((a.value_at(100.0) - 1.0).abs() < 1e-9);
        // Out-of-range clamps
        assert!((a.value_at(-10.0) - 0.0).abs() < 1e-9);
        assert!((a.value_at(200.0) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn hold_returns_prior_value() {
        let a = Automation {
            target_node_id: String::new(),
            target_param_id: "g".into(),
            points: vec![pt(0, 0.2, Curve::Hold), pt(100, 0.9, Curve::Linear)],
        };
        assert!((a.value_at(50.0) - 0.2).abs() < 1e-9);
        assert!((a.value_at(99.9) - 0.2).abs() < 1e-9);
    }

    #[test]
    fn bezier_smoothstep() {
        let a = Automation {
            target_node_id: String::new(),
            target_param_id: "g".into(),
            points: vec![pt(0, 0.0, Curve::Bezier), pt(100, 1.0, Curve::Linear)],
        };
        let mid = a.value_at(50.0);
        assert!((mid - 0.5).abs() < 1e-9);
        // Quarter of the way the smoothstep value is below 0.25 (eased start).
        assert!(a.value_at(25.0) < 0.25);
    }

    #[test]
    fn compile_ramp_advances_per_sample() {
        let a = Automation {
            target_node_id: String::new(),
            target_param_id: "g".into(),
            points: vec![pt(0, 0.0, Curve::Linear), pt(100, 1.0, Curve::Linear)],
        };
        let mut out = Vec::new();
        // 1 tick per sample, 100 samples → ramp 0 → 0.99
        compile_ramp(&a, 0.0, 1.0, 100, &mut out);
        assert_eq!(out.len(), 100);
        assert!((out[0] - 0.0).abs() < 1e-6);
        assert!(out[99] > 0.98);
    }
}
