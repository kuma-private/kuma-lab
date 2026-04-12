//! Vst3Instrument — `Instrument` implementation backed by the real VST3
//! SDK via the C++ shim in `cpp/vst3_shim.cpp`. When the SDK is not
//! vendored at build time, `Vst3Instrument::load` returns `Err` and the
//! factory falls back to `SilentVst3Instrument`.
//!
//! # Send safety
//! The underlying C++ plugin handle is not thread-safe, so the raw
//! pointer is `!Send` by default. We hand-implement `Send` after
//! asserting that only the audio worker thread (which owns the Graph)
//! ever calls `process`. The network thread rebuilds the graph on
//! patches rather than mutating an in-flight instrument.

use std::ffi::CString;
use std::os::raw::c_char;
use std::ptr;

use bridge_plugin_host::{Instrument, MidiEvent, MidiEventKind};

use crate::ffi;

pub struct Vst3Instrument {
    pub id: String,
    pub path: String,
    handle: *mut ffi::Vst3Plugin,
    sample_rate: u32,
    block_size: usize,
    /// Packed-byte scratch buffer reused across process calls so the
    /// audio thread never allocates. Filled from `events` at the top
    /// of every `process` call.
    midi_scratch: Vec<u8>,
    /// Scratch output pointer array, kept stable across calls so we
    /// don't publish an ephemeral stack address into FFI land.
    left_channel_scratch: Vec<f32>,
    right_channel_scratch: Vec<f32>,
    /// Playhead in samples. Advanced by `process`.
    playhead: i64,
}

// Safety: the Vst3Instrument pointer is owned by the audio thread at
// all times. Graph rebuilds happen on the network thread, but those
// construct fresh Vst3Instruments and hand them to the audio thread
// via the same SetGraph channel that existing CLAP instruments use —
// so there is no concurrent access on a single instance.
unsafe impl Send for Vst3Instrument {}

impl Vst3Instrument {
    /// Load a `.vst3` bundle. Returns `Err` if the SDK is not vendored
    /// (stub path returns a null handle) or if the load fails for any
    /// other reason (bundle not found, no audio processor class, etc.).
    pub fn load(
        id: impl Into<String>,
        path: impl Into<String>,
        sample_rate: u32,
        max_block_size: usize,
    ) -> anyhow::Result<Self> {
        let id = id.into();
        let path = path.into();

        if !ffi::HAS_VST3_SDK {
            return Err(anyhow::anyhow!(
                "VST3 SDK not vendored at build time (rebuild with VST3_SDK_PATH set)"
            ));
        }

        let c_path = CString::new(path.clone())
            .map_err(|e| anyhow::anyhow!("path contains nul byte: {e}"))?;
        // Safety: c_path lives until end of this scope.
        let handle = unsafe {
            ffi::vst3_load(
                c_path.as_ptr() as *const c_char,
                sample_rate as f64,
                max_block_size as i32,
            )
        };
        if handle.is_null() {
            let err = ffi::last_error();
            return Err(anyhow::anyhow!("vst3_load failed: {err}"));
        }

        Ok(Self {
            id,
            path,
            handle,
            sample_rate,
            block_size: max_block_size,
            midi_scratch: Vec::with_capacity(256),
            left_channel_scratch: vec![0.0; max_block_size],
            right_channel_scratch: vec![0.0; max_block_size],
            playhead: 0,
        })
    }
}

impl Drop for Vst3Instrument {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe { ffi::vst3_free(self.handle) };
            self.handle = ptr::null_mut();
        }
    }
}

/// Pack a `MidiEvent` into the shim's 8-byte-per-event wire format.
/// Layout: [offset: u32 LE][status: u8][data1: u8][data2: u8][_pad: u8]
fn pack_midi(events: &[MidiEvent], out: &mut Vec<u8>) {
    out.clear();
    for ev in events {
        let (status, data1, data2) = match ev.kind {
            MidiEventKind::NoteOn { pitch, velocity } => (0x90, pitch, velocity),
            MidiEventKind::NoteOff { pitch } => (0x80, pitch, 0),
            MidiEventKind::AllOff => (0xB0, 123, 0),
        };
        out.extend_from_slice(&ev.sample_offset.to_le_bytes());
        out.push(status);
        out.push(data1);
        out.push(data2);
        out.push(0);
    }
}

impl Instrument for Vst3Instrument {
    fn process(&mut self, events: &[MidiEvent], out: &mut [f32], n_frames: usize) {
        // Ensure scratch channels are large enough.
        if self.left_channel_scratch.len() < n_frames {
            self.left_channel_scratch.resize(n_frames, 0.0);
        }
        if self.right_channel_scratch.len() < n_frames {
            self.right_channel_scratch.resize(n_frames, 0.0);
        }
        for s in self.left_channel_scratch[..n_frames].iter_mut() {
            *s = 0.0;
        }
        for s in self.right_channel_scratch[..n_frames].iter_mut() {
            *s = 0.0;
        }

        pack_midi(events, &mut self.midi_scratch);

        let out_ptrs: [*mut f32; 2] = [
            self.left_channel_scratch.as_mut_ptr(),
            self.right_channel_scratch.as_mut_ptr(),
        ];

        // Safety: handle is non-null (load checked). Pointer arrays live
        // on the stack for the duration of the FFI call. The shim writes
        // n_frames samples into each output channel.
        let res = unsafe {
            ffi::vst3_process(
                self.handle,
                ptr::null(),
                0,
                out_ptrs.as_ptr(),
                2,
                n_frames as i32,
                if self.midi_scratch.is_empty() {
                    ptr::null()
                } else {
                    self.midi_scratch.as_ptr()
                },
                self.midi_scratch.len() as i32,
                self.playhead,
            )
        };

        if res != 0 {
            // Process error — emit silence and bail. The audio thread
            // must never panic; a stuck plugin gets silenced but the
            // rest of the graph keeps running.
            for s in out.iter_mut() {
                *s = 0.0;
            }
            return;
        }

        // Interleave the scratch back into `out` (LRLR…).
        for i in 0..n_frames {
            out[i * 2] = self.left_channel_scratch[i];
            out[i * 2 + 1] = self.right_channel_scratch[i];
        }

        self.playhead += n_frames as i64;
    }

    fn set_sample_rate(&mut self, sr: u32) {
        self.sample_rate = sr;
    }

    fn set_block_size(&mut self, max: usize) {
        self.block_size = max;
        if self.left_channel_scratch.len() < max {
            self.left_channel_scratch.resize(max, 0.0);
        }
        if self.right_channel_scratch.len() < max {
            self.right_channel_scratch.resize(max, 0.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_without_sdk_returns_err() {
        if ffi::HAS_VST3_SDK {
            // With SDK vendored the load path goes through real C++.
            // The stub-mode test below is what we actually exercise in CI.
            return;
        }
        let r = Vst3Instrument::load("id", "/nonexistent.vst3", 48_000, 512);
        assert!(r.is_err());
    }

    #[test]
    fn pack_midi_handles_note_on_off() {
        let events = [
            MidiEvent {
                sample_offset: 0,
                kind: MidiEventKind::NoteOn {
                    pitch: 60,
                    velocity: 100,
                },
            },
            MidiEvent {
                sample_offset: 128,
                kind: MidiEventKind::NoteOff { pitch: 60 },
            },
        ];
        let mut buf = Vec::new();
        pack_midi(&events, &mut buf);
        assert_eq!(buf.len(), 16);
        // First event: offset=0, status=0x90, data1=60, data2=100
        assert_eq!(&buf[0..4], &[0, 0, 0, 0]);
        assert_eq!(buf[4], 0x90);
        assert_eq!(buf[5], 60);
        assert_eq!(buf[6], 100);
        // Second event: offset=128 little-endian
        assert_eq!(&buf[8..12], &[128, 0, 0, 0]);
        assert_eq!(buf[12], 0x80);
        assert_eq!(buf[13], 60);
    }
}
