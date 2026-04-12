use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use bridge_audio::{AudioHandle, RtCommand, TelemetryReceiver};
use bridge_clap::{scanner, ClapFactory, PluginCatalog};
use bridge_plugin_host::{
    apply_patch_to_project, hash_project, render_to_wav, render::RenderResult, Graph,
};
use bridge_protocol::{
    ChainNodeSpec, JsonPatchOp, PluginDescriptor, PluginRef, Project,
};

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
    /// Authoritative copy of the loaded project — the only source of truth on
    /// the network thread. Every patch / chain.* command mutates this and
    /// then triggers a fresh `Graph` rebuild that gets pushed to the audio
    /// thread.
    project: Arc<Mutex<Option<Project>>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            audio: AudioHandle::spawn(),
            catalog: Arc::new(Mutex::new(PluginCatalog::empty())),
            track_index: Arc::new(Mutex::new(TrackIndex::default())),
            project: Arc::new(Mutex::new(None)),
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
        let graph = self.build_graph(project)?;

        {
            let mut idx = self.track_index.lock().expect("track index poisoned");
            idx.ids = graph.tracks.iter().map(|t| t.id.clone()).collect();
        }
        {
            let mut p = self.project.lock().expect("project poisoned");
            *p = Some(project.clone());
        }
        self.audio.send_rt(RtCommand::SetGraph(Box::new(graph)))?;
        Ok(())
    }

    fn build_graph(&self, project: &Project) -> anyhow::Result<Graph> {
        let factory = {
            let cat = self.catalog.lock().expect("catalog poisoned");
            ClapFactory::new(cat.clone())
        };
        Graph::from_project(project, |id| factory.make_instrument(id))
    }

    /// Mutate `self.project` under the lock with the provided closure, then
    /// rebuild + push the resulting `Graph` to the audio thread. Returns
    /// the closure's result.
    fn mutate_project<R>(
        &self,
        f: impl FnOnce(&mut Project) -> anyhow::Result<R>,
    ) -> anyhow::Result<R> {
        let (rebuilt, result) = {
            let mut p = self.project.lock().expect("project poisoned");
            let project = p
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("no project loaded"))?;
            let res = f(project)?;
            // Refresh track-id index in case tracks were added/removed.
            {
                let mut idx = self.track_index.lock().expect("track index poisoned");
                idx.ids = project.tracks.iter().map(|t| t.id.clone()).collect();
            }
            (project.clone(), res)
        };
        let graph = self.build_graph(&rebuilt)?;
        self.audio.send_rt(RtCommand::SetGraph(Box::new(graph)))?;
        Ok(result)
    }

    // ── project.patch ──────────────────────────────────
    pub fn project_patch(&self, ops: &[JsonPatchOp]) -> anyhow::Result<usize> {
        self.mutate_project(|project| apply_patch_to_project(project, ops))
    }

    pub fn project_hash(&self) -> anyhow::Result<String> {
        let p = self.project.lock().expect("project poisoned");
        let project = p
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("no project loaded"))?;
        Ok(hash_project(project))
    }

    // ── chain.* commands ───────────────────────────────
    pub fn chain_add_node(
        &self,
        track_id: &str,
        position: usize,
        plugin: &PluginRef,
    ) -> anyhow::Result<String> {
        if plugin.format != "builtin" {
            return Err(anyhow::anyhow!(
                "{} hosting not yet implemented",
                plugin.format
            ));
        }
        let node_id = format!("node-{}", uuid_like());
        let track_id_owned = track_id.to_string();
        let plugin_owned = plugin.clone();
        let node_id_owned = node_id.clone();
        self.mutate_project(move |project| {
            let track = project
                .tracks
                .iter_mut()
                .find(|t| t.id == track_id_owned)
                .ok_or_else(|| anyhow::anyhow!("unknown track id: {}", track_id_owned))?;
            let pos = position.min(track.inserts.len());
            track.inserts.insert(
                pos,
                ChainNodeSpec {
                    id: node_id_owned.clone(),
                    kind: "insert".into(),
                    plugin: plugin_owned,
                    bypass: false,
                    params: Default::default(),
                    state_blob: None,
                },
            );
            Ok(())
        })?;
        Ok(node_id)
    }

    pub fn chain_remove_node(&self, track_id: &str, node_id: &str) -> anyhow::Result<()> {
        let track_id_owned = track_id.to_string();
        let node_id_owned = node_id.to_string();
        self.mutate_project(move |project| {
            let track = project
                .tracks
                .iter_mut()
                .find(|t| t.id == track_id_owned)
                .ok_or_else(|| anyhow::anyhow!("unknown track id: {}", track_id_owned))?;
            let before = track.inserts.len();
            track.inserts.retain(|n| n.id != node_id_owned);
            if track.inserts.len() == before {
                return Err(anyhow::anyhow!("unknown insert id: {}", node_id_owned));
            }
            Ok(())
        })
    }

    pub fn chain_set_param(
        &self,
        track_id: &str,
        node_id: &str,
        param_id: &str,
        value: f64,
    ) -> anyhow::Result<()> {
        let track_id_owned = track_id.to_string();
        let node_id_owned = node_id.to_string();
        let param_id_owned = param_id.to_string();
        self.mutate_project(move |project| {
            let track = project
                .tracks
                .iter_mut()
                .find(|t| t.id == track_id_owned)
                .ok_or_else(|| anyhow::anyhow!("unknown track id: {}", track_id_owned))?;
            let node = track
                .inserts
                .iter_mut()
                .find(|n| n.id == node_id_owned)
                .ok_or_else(|| anyhow::anyhow!("unknown insert id: {}", node_id_owned))?;
            node.params.insert(param_id_owned, serde_json::Value::from(value));
            Ok(())
        })
    }

    // ── render.wav ─────────────────────────────────────
    pub fn render_wav(
        &self,
        from_tick: i64,
        to_tick: i64,
        sample_rate: u32,
        bit_depth: u8,
        path: &str,
    ) -> anyhow::Result<RenderResult> {
        let project = {
            let p = self.project.lock().expect("project poisoned");
            p.as_ref()
                .ok_or_else(|| anyhow::anyhow!("no project loaded"))?
                .clone()
        };
        // For render we build a fresh graph from the project — instruments
        // are stub-silent today (real audio depends on Phase 8 CLAP host),
        // but built-in inserts on tracks/buses/master will produce signal.
        let graph = self.build_graph(&project)?;
        let pb = PathBuf::from(path);
        render_to_wav(graph, from_tick, to_tick, sample_rate, bit_depth, &pb)
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

/// Cheap monotonic id generator. Not a real UUID; used for chain node ids
/// when the frontend doesn't supply one. Combines process time with a
/// thread-local counter.
fn uuid_like() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_micros() as u64)
        .unwrap_or(0);
    format!("{:x}{:x}", t, n)
}
