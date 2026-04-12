//! SilentVst3Instrument — the `Instrument` implementation used when the
//! VST3 SDK is not vendored at build time. Emits silence so the rest of
//! the audio graph (automation, inserts, buses, master, render.wav) can
//! still be exercised end-to-end.
//!
//! This is intentionally *not* a fallback for failed plugin loads. The
//! graph-side fallback is `bridge_plugin_host::SilentInstrument`. This
//! stub exists so the `bridge-vst3` crate compiles and passes tests
//! without any C++ SDK present.

use bridge_plugin_host::{Instrument, MidiEvent};

pub struct SilentVst3Instrument {
    pub id: String,
    pub path: String,
    sample_rate: u32,
    block_size: usize,
}

impl SilentVst3Instrument {
    pub fn new(id: impl Into<String>, path: impl Into<String>) -> Self {
        tracing::debug!("SilentVst3Instrument: VST3 SDK not vendored, using silence stub");
        Self {
            id: id.into(),
            path: path.into(),
            sample_rate: 48_000,
            block_size: 512,
        }
    }
}

impl Instrument for SilentVst3Instrument {
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

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_plugin_host::{MidiEvent, MidiEventKind};

    #[test]
    fn silent_vst3_emits_zeros() {
        let mut inst = SilentVst3Instrument::new("id", "/path");
        let events = [MidiEvent {
            sample_offset: 0,
            kind: MidiEventKind::NoteOn {
                pitch: 60,
                velocity: 100,
            },
        }];
        let mut buf = vec![1.0_f32; 256];
        inst.process(&events, &mut buf, 128);
        assert!(buf.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn silent_vst3_accepts_sr_and_block_size() {
        let mut inst = SilentVst3Instrument::new("id", "/path");
        inst.set_sample_rate(44_100);
        inst.set_block_size(1024);
        assert_eq!(inst.sample_rate, 44_100);
        assert_eq!(inst.block_size, 1024);
    }
}
