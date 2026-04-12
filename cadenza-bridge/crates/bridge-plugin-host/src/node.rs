use crate::midi::MidiEvent;

/// An audio-rendering instrument. Implementations must be `Send` so the
/// graph can be moved onto the audio worker thread, but they don't need
/// to be `Sync` (the graph is owned by exactly one thread at a time).
pub trait Instrument: Send {
    /// Render `n_frames` of interleaved stereo (`out.len() == n_frames * 2`)
    /// using the supplied `events` (sample-offsets relative to this block).
    fn process(&mut self, events: &[MidiEvent], out: &mut [f32], n_frames: usize);

    /// Optional hint for buffer-size changes.
    fn set_block_size(&mut self, _max_frames: usize) {}

    /// Optional hint for sample-rate changes.
    fn set_sample_rate(&mut self, _sr: u32) {}
}

/// A null instrument that emits silence. Used as a placeholder when a track
/// has no plugin assigned, or when CLAP scanning failed and the project
/// references a missing plugin id.
pub struct SilentInstrument;

impl Instrument for SilentInstrument {
    fn process(&mut self, _events: &[MidiEvent], out: &mut [f32], _n_frames: usize) {
        for s in out.iter_mut() {
            *s = 0.0;
        }
    }
}

/// Internal node enum. Phase 2 only models instrument + master sum, but the
/// shape lets Phase 3 add insert effects without restructuring.
pub enum Node {
    Instrument(Box<dyn Instrument>),
    Master,
}
