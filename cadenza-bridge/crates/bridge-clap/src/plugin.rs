use bridge_plugin_host::{Instrument, MidiEvent};

/// Stub CLAP-backed instrument. Phase 2 emits silence so the audio graph,
/// transport, and live MIDI plumbing can be exercised end-to-end without a
/// real plugin host. Phase 2.5 will replace the body of `process` with a
/// clap-sys process call while keeping this same `Instrument` interface.
pub struct ClapInstrument {
    pub id: String,
    pub path: String,
    sample_rate: u32,
    block_size: usize,
}

impl ClapInstrument {
    pub fn new(id: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            path: path.into(),
            sample_rate: 48_000,
            block_size: 512,
        }
    }
}

impl Instrument for ClapInstrument {
    fn process(&mut self, _events: &[MidiEvent], out: &mut [f32], _n_frames: usize) {
        for s in out.iter_mut() {
            *s = 0.0;
        }
    }

    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr;
    }

    fn set_block_size(&mut self, max: usize) {
        self.block_size = max;
    }
}
