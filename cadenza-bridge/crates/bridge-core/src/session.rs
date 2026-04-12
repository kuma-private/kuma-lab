use std::sync::{Arc, Mutex};

use bridge_audio::{AudioHandle, RtCommand, TelemetryReceiver};
use bridge_clap::{scanner, ClapFactory, PluginCatalog};
use bridge_plugin_host::Graph;
use bridge_protocol::{PluginDescriptor, Project};

/// Snapshot of the currently loaded project's track ids, in order. The
/// network thread maps `track_id` strings on incoming midi.note* commands
/// to a numeric index that the audio thread can use without holding the
/// graph itself.
#[derive(Default, Clone)]
pub struct TrackIndex {
    pub ids: Vec<String>,
}

impl TrackIndex {
    pub fn position(&self, id: &str) -> Option<usize> {
        self.ids.iter().position(|x| x == id)
    }
}

#[derive(Clone)]
pub struct SessionState {
    audio: AudioHandle,
    catalog: Arc<Mutex<PluginCatalog>>,
    track_index: Arc<Mutex<TrackIndex>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            audio: AudioHandle::spawn(),
            catalog: Arc::new(Mutex::new(PluginCatalog::empty())),
            track_index: Arc::new(Mutex::new(TrackIndex::default())),
        }
    }

    pub fn audio(&self) -> &AudioHandle {
        &self.audio
    }

    pub fn telemetry(&self) -> Arc<TelemetryReceiver> {
        self.audio.telemetry()
    }

    // ── debug.sine (legacy) ────────────────────────────
    pub fn set_sine(&self, on: bool) -> anyhow::Result<()> {
        self.audio.set_sine(on)
    }

    // ── plugins ────────────────────────────────────────
    pub fn plugins_scan(&self) -> usize {
        let mut cat = self.catalog.lock().expect("catalog poisoned");
        cat.rescan()
    }

    pub fn plugins_list(&self) -> Vec<PluginDescriptor> {
        let cat = self.catalog.lock().expect("catalog poisoned");
        cat.plugins.clone()
    }

    // ── project.load ───────────────────────────────────
    pub fn project_load(&self, project: &Project) -> anyhow::Result<()> {
        let factory = {
            let cat = self.catalog.lock().expect("catalog poisoned");
            ClapFactory::new(cat.clone())
        };
        let graph = Graph::from_project(project, |id| factory.make_instrument(id));

        // Update the track-id → index map for live MIDI routing.
        {
            let mut idx = self.track_index.lock().expect("track index poisoned");
            idx.ids = graph.tracks.iter().map(|t| t.id.clone()).collect();
        }

        self.audio
            .send_rt(RtCommand::SetGraph(Box::new(graph)))?;
        Ok(())
    }

    // ── transport ──────────────────────────────────────
    pub fn transport_play(&self, from_tick: Option<i64>) -> anyhow::Result<()> {
        self.audio.send_rt(RtCommand::Play { from_tick })
    }

    pub fn transport_stop(&self) -> anyhow::Result<()> {
        self.audio.send_rt(RtCommand::Stop)
    }

    pub fn transport_seek(&self, tick: i64) -> anyhow::Result<()> {
        self.audio.send_rt(RtCommand::Seek { tick })
    }

    // ── live midi ──────────────────────────────────────
    pub fn midi_note_on(&self, track_id: &str, pitch: u8, velocity: u8) -> anyhow::Result<()> {
        let idx = {
            let g = self.track_index.lock().expect("track index poisoned");
            g.position(track_id)
        };
        let Some(track_idx) = idx else {
            return Err(anyhow::anyhow!("unknown track id: {track_id}"));
        };
        self.audio.send_rt(RtCommand::LiveNoteOn {
            track_idx,
            pitch,
            velocity,
        })
    }

    pub fn midi_note_off(&self, track_id: &str, pitch: u8) -> anyhow::Result<()> {
        let idx = {
            let g = self.track_index.lock().expect("track index poisoned");
            g.position(track_id)
        };
        let Some(track_idx) = idx else {
            return Err(anyhow::anyhow!("unknown track id: {track_id}"));
        };
        self.audio
            .send_rt(RtCommand::LiveNoteOff { track_idx, pitch })
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

/// Re-export the scanner free function so other crates can hit it without
/// pulling bridge-clap in directly.
pub fn scan_default_paths() -> Vec<PluginDescriptor> {
    scanner::scan_default_paths()
}
