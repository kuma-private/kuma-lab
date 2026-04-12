use crate::clip::MidiClip;
use crate::midi::{MidiEvent, MidiEventKind};
use crate::node::{Instrument, SilentInstrument};
use crate::transport::Transport;
use bridge_protocol::Project;

/// Single track in the audio graph. Phase 2 = exactly one instrument node.
pub struct Track {
    pub id: String,
    pub name: String,
    pub instrument: Box<dyn Instrument>,
    pub clips: Vec<MidiClip>,
    pub volume_db: f64,
    pub mute: bool,
    pub solo: bool,
    /// Live (non-clip) MIDI events queued from the network thread, in
    /// arrival order. Drained at the top of every process call.
    live_events: Vec<MidiEvent>,
    /// Scratch buffer reused per process call. Owned by the track to keep
    /// the audio callback allocation-free after warmup.
    scratch: Vec<f32>,
}

impl Track {
    pub fn new(id: String, name: String, instrument: Box<dyn Instrument>) -> Self {
        Self {
            id,
            name,
            instrument,
            clips: Vec::new(),
            volume_db: 0.0,
            mute: false,
            solo: false,
            live_events: Vec::new(),
            scratch: Vec::new(),
        }
    }

    pub fn gain_linear(&self) -> f32 {
        if self.mute {
            return 0.0;
        }
        10f32.powf((self.volume_db as f32) / 20.0)
    }

    pub fn push_live(&mut self, ev: MidiEvent) {
        self.live_events.push(ev);
    }

    fn ensure_scratch(&mut self, n_frames: usize) {
        let needed = n_frames * 2;
        if self.scratch.len() < needed {
            self.scratch.resize(needed, 0.0);
        }
    }
}

pub struct Graph {
    pub tracks: Vec<Track>,
    pub bpm: f64,
    pub sample_rate: u32,
    /// Master scratch (interleaved stereo).
    master: Vec<f32>,
}

impl Graph {
    pub fn new(bpm: f64, sample_rate: u32) -> Self {
        Self {
            tracks: Vec::new(),
            bpm,
            sample_rate,
            master: Vec::new(),
        }
    }

    /// Build a graph from a parsed `Project`. Tracks without an instrument
    /// (or with an unknown plugin id) get a `SilentInstrument` so the
    /// transport still advances and live noteOn/Off can be queued.
    pub fn from_project(
        project: &Project,
        mut make_instrument: impl FnMut(&str) -> Option<Box<dyn Instrument>>,
    ) -> Self {
        let mut g = Self::new(project.bpm, project.sample_rate);
        for ts in &project.tracks {
            let inst: Box<dyn Instrument> = ts
                .instrument
                .as_ref()
                .and_then(|r| make_instrument(&r.plugin_id))
                .unwrap_or_else(|| Box::new(SilentInstrument));
            let mut t = Track::new(ts.id.clone(), ts.name.clone(), inst);
            t.clips = ts.clips.iter().map(MidiClip::from).collect();
            t.volume_db = ts.volume_db;
            t.mute = ts.mute;
            t.solo = ts.solo;
            g.tracks.push(t);
        }
        g
    }

    pub fn track_index(&self, id: &str) -> Option<usize> {
        self.tracks.iter().position(|t| t.id == id)
    }

    /// Render one block. `out` is interleaved stereo, length = `n_frames * 2`.
    /// `transport` is consulted (and not advanced) for the current playhead.
    pub fn process(&mut self, transport: &Transport, out: &mut [f32], n_frames: usize) {
        let stereo_len = n_frames * 2;
        debug_assert_eq!(out.len(), stereo_len);

        if self.master.len() < stereo_len {
            self.master.resize(stereo_len, 0.0);
        }
        for s in self.master[..stereo_len].iter_mut() {
            *s = 0.0;
        }

        let any_solo = self.tracks.iter().any(|t| t.solo);

        // Compute MIDI range for clips (only when transport playing).
        let (range_start, range_end) = if transport.playing {
            let start = transport.position_tick();
            let spt = transport.samples_per_tick();
            let end = start + ((n_frames as f64 / spt).ceil() as i64).max(1);
            (start, end)
        } else {
            (0, 0)
        };
        let spt = transport.samples_per_tick();

        let mut events_buf: Vec<MidiEvent> = Vec::with_capacity(32);
        for track in self.tracks.iter_mut() {
            track.ensure_scratch(n_frames);
            let muted = track.mute || (any_solo && !track.solo);
            let gain = track.gain_linear();

            events_buf.clear();
            for ev in track.live_events.drain(..) {
                events_buf.push(MidiEvent {
                    sample_offset: 0,
                    kind: ev.kind,
                });
            }
            if transport.playing {
                for clip in &track.clips {
                    clip.events_in_range(range_start, range_end, spt, &mut events_buf);
                }
            }
            events_buf.sort_by_key(|e| e.sample_offset);

            let scratch = &mut track.scratch[..stereo_len];
            for s in scratch.iter_mut() {
                *s = 0.0;
            }
            track.instrument.process(&events_buf, scratch, n_frames);

            if muted {
                continue;
            }
            for (m, t) in self.master[..stereo_len]
                .iter_mut()
                .zip(scratch.iter())
            {
                *m += *t * gain;
            }
        }

        out.copy_from_slice(&self.master[..stereo_len]);
    }

    /// Send "all notes off" to every track. Used on stop / panic.
    pub fn all_notes_off(&mut self) {
        for t in &mut self.tracks {
            t.live_events.push(MidiEvent::all_off(0));
        }
    }

    /// Push a live noteOn into a specific track (by index). Network-thread
    /// will normally use the track id; the audio thread receives an index
    /// resolved at command-translation time.
    pub fn push_live(&mut self, track_idx: usize, ev: MidiEvent) {
        if let Some(t) = self.tracks.get_mut(track_idx) {
            t.push_live(ev);
        }
    }
}

impl MidiEventKind {
    pub fn is_note_on(&self) -> bool {
        matches!(self, MidiEventKind::NoteOn { .. })
    }
}
