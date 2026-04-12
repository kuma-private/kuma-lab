//! Audio graph, transport, MIDI clip, instrument abstraction for the
//! Cadenza Bridge. The actual CLAP host backend lives in `bridge-clap`,
//! and is plugged into a [`Node::Instrument`] via the [`Instrument`] trait.

pub mod clip;
pub mod graph;
pub mod midi;
pub mod node;
pub mod transport;

pub use clip::MidiClip;
pub use graph::{Graph, Track};
pub use midi::{MidiEvent, MidiEventKind};
pub use node::{Instrument, Node, SilentInstrument};
pub use transport::Transport;

/// PPQ (pulses per quarter note) used by Cadenza projects. Matches the
/// frontend default. All `tick` units in the protocol use this resolution.
pub const PPQ: u32 = 480;

/// Convert beats-per-minute + sample-rate into samples-per-tick (f64 for
/// fractional accuracy across blocks).
#[inline]
pub fn samples_per_tick(bpm: f64, sample_rate: u32) -> f64 {
    // 1 quarter note = 60/bpm seconds = 60*sr/bpm samples
    // 1 tick = 1/PPQ quarter note
    (60.0 * sample_rate as f64) / (bpm * PPQ as f64)
}

#[inline]
pub fn ticks_to_seconds(ticks: i64, bpm: f64) -> f64 {
    (ticks as f64) * 60.0 / (bpm * PPQ as f64)
}
