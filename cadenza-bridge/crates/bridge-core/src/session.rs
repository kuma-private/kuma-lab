use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use bridge_audio::{AudioHandle, RtCommand, TelemetryReceiver};
use bridge_clap::{scanner, ClapFactory, PluginCatalog};
use bridge_plugin_host::{
    apply_patch_to_project, hash_project, make_placeholder_editor, render_to_wav,
    render::RenderResult, Graph, Instrument, SilentInstrument, PluginEditor,
};
use bridge_protocol::{
    ChainNodeSpec, JsonPatchOp, PluginDescriptor, PluginRef, Project,
};
use bridge_vst3::{Vst3Catalog, Vst3Factory};

use crate::autostart::{self, Target as AutostartTarget};
use crate::bridge_state::BridgeState;
use crate::entitlement::{EntitlementCache, VerifiedSession};

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

type EditorMap = HashMap<(String, String), Box<dyn PluginEditor>>;

#[derive(Clone)]
pub struct SessionState {
    audio: AudioHandle,
    catalog: Arc<Mutex<PluginCatalog>>,
    vst3_catalog: Arc<Mutex<Vst3Catalog>>,
    track_index: Arc<Mutex<TrackIndex>>,
    /// Authoritative copy of the loaded project — the only source of truth on
    /// the network thread. Every patch / chain.* command mutates this and
    /// then triggers a fresh `Graph` rebuild that gets pushed to the audio
    /// thread.
    project: Arc<Mutex<Option<Project>>>,
    /// Open plugin-editor windows keyed by `(track_id, node_id)`. Phase 7
    /// always produces `PlaceholderEditor` instances; Phase 8 will swap in
    /// the real platform editor when the plugin actually exposes a view.
    editors: Arc<Mutex<EditorMap>>,
    /// Cross-subsystem shared state (tray, updater, autostart UI).
    bridge_state: BridgeState,
    /// Cached premium entitlements. Populated by `session.verify`.
    entitlements: EntitlementCache,
}

impl SessionState {
    pub fn new() -> Self {
        Self::with_bridge_state(BridgeState::new())
    }

    pub fn with_bridge_state(bridge_state: BridgeState) -> Self {
        Self {
            audio: AudioHandle::spawn(),
            catalog: Arc::new(Mutex::new(PluginCatalog::empty())),
            vst3_catalog: Arc::new(Mutex::new(Vst3Catalog::empty())),
            track_index: Arc::new(Mutex::new(TrackIndex::default())),
            project: Arc::new(Mutex::new(None)),
            editors: Arc::new(Mutex::new(HashMap::new())),
            bridge_state,
            entitlements: EntitlementCache::new(),
        }
    }

    /// Read-only access to the entitlement cache. Handlers call
    /// `state.entitlements().is_premium()` to gate commands.
    pub fn entitlements(&self) -> &EntitlementCache {
        &self.entitlements
    }

    pub fn bridge_state(&self) -> &BridgeState {
        &self.bridge_state
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
        let clap_count = {
            let mut cat = self.catalog.lock().expect("catalog poisoned");
            cat.rescan()
        };
        let vst3_count = {
            let mut cat = self.vst3_catalog.lock().expect("vst3 catalog poisoned");
            cat.rescan()
        };
        let total = clap_count + vst3_count;
        self.bridge_state.set_plugin_count(total as u32);
        total
    }

    pub fn plugins_list(&self) -> Vec<PluginDescriptor> {
        let mut out = {
            let cat = self.catalog.lock().expect("catalog poisoned");
            cat.plugins.clone()
        };
        let vst3 = {
            let cat = self.vst3_catalog.lock().expect("vst3 catalog poisoned");
            cat.plugins.clone()
        };
        out.extend(vst3);
        out
    }

    // ── session.verify (Phase 8) ───────────────────────
    /// Verify a premium ticket by POSTing it to the backend and
    /// caching the resulting entitlements. Blocking HTTP — callers
    /// running inside a tokio context should wrap in `spawn_blocking`.
    pub fn session_verify(&self, ticket: &str) -> anyhow::Result<VerifiedSession> {
        self.entitlements.refresh_blocking(ticket)
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
        let clap_factory = {
            let cat = self.catalog.lock().expect("catalog poisoned");
            ClapFactory::new(cat.clone())
                .with_audio_settings(project.sample_rate, 512)
        };
        let vst3_factory = {
            let cat = self.vst3_catalog.lock().expect("vst3 catalog poisoned");
            // max_block_size 512 matches Phase 2 default; audio thread
            // will `set_block_size` on rebuild if the device uses a
            // different value.
            Vst3Factory::new(cat.clone(), project.sample_rate, 512)
        };
        // Route by looking up the instrument ref's format field. The
        // `Graph::from_project` closure only sees the plugin id today,
        // so we scan the project's tracks for the format and choose
        // the right factory. This keeps Graph::from_project agnostic
        // of plugin backends.
        Graph::from_project(project, |id| {
            // Find which format owns this id. A future refactor could
            // pass the format through directly; for Phase 8 we do a
            // cheap linear scan per id.
            let format = project
                .tracks
                .iter()
                .find_map(|t| match &t.instrument {
                    Some(ir) if ir.plugin_id == id => Some(ir.plugin_format.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| "clap".into());
            match format.as_str() {
                "vst3" => vst3_factory.make_instrument(id),
                "clap" => clap_factory.make_instrument(id),
                _ => Some(Box::new(SilentInstrument) as Box<dyn Instrument>),
            }
        })
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
        // Phase 8 accepts "builtin", "clap", and "vst3". Real rendering
        // for clap/vst3 depends on whether the respective SDK is
        // vendored at build time — the graph rebuild path logs a
        // warning and falls back to Silent instruments when not.
        match plugin.format.as_str() {
            "builtin" | "clap" | "vst3" => {}
            other => {
                return Err(anyhow::anyhow!("unsupported plugin format: {other}"));
            }
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

    // ── chain.showEditor / chain.hideEditor ────────────
    pub fn chain_show_editor(&self, track_id: &str, node_id: &str) -> anyhow::Result<()> {
        // Look up the node in the current project just to confirm it
        // exists — the placeholder doesn't actually need the plugin
        // reference, but returning ok for a bogus node id would mask
        // frontend bugs.
        let plugin_name = {
            let p = self.project.lock().expect("project poisoned");
            let project = p
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("no project loaded"))?;
            let track = project
                .tracks
                .iter()
                .find(|t| t.id == track_id)
                .ok_or_else(|| anyhow::anyhow!("unknown track id: {track_id}"))?;
            let node = track
                .inserts
                .iter()
                .find(|n| n.id == node_id)
                .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
            node.plugin.name.clone()
        };

        let key = (track_id.to_string(), node_id.to_string());
        let mut editors = self.editors.lock().expect("editors poisoned");
        let entry = editors
            .entry(key)
            .or_insert_with(|| make_placeholder_editor(plugin_name));
        entry.show()
    }

    pub fn chain_hide_editor(&self, track_id: &str, node_id: &str) -> anyhow::Result<()> {
        let key = (track_id.to_string(), node_id.to_string());
        let mut editors = self.editors.lock().expect("editors poisoned");
        if let Some(ed) = editors.get_mut(&key) {
            ed.hide()?;
        }
        // Drop the editor after hide — Phase 8 real windows will keep
        // them around for snappy re-show, but the placeholder has no
        // state worth caching.
        editors.remove(&key);
        Ok(())
    }

    /// Total number of open plugin editors. Used by the tray's status line
    /// and the integration tests.
    pub fn editor_count(&self) -> usize {
        self.editors.lock().expect("editors poisoned").len()
    }

    // ── system.*  ──────────────────────────────────────
    pub fn system_set_autostart(&self, enabled: bool) -> anyhow::Result<()> {
        let exe = watchdog_target_exe()?;
        let target = AutostartTarget::default_for(exe)?;
        if enabled {
            autostart::enable_autostart(&target)?;
        } else {
            autostart::disable_autostart(&target)?;
        }
        self.bridge_state.set_autostart_enabled(enabled);
        Ok(())
    }

    pub fn system_get_autostart(&self) -> anyhow::Result<bool> {
        let exe = watchdog_target_exe()?;
        let target = AutostartTarget::default_for(exe)?;
        let enabled = autostart::is_autostart_enabled(&target);
        self.bridge_state.set_autostart_enabled(enabled);
        Ok(enabled)
    }

    // ── update.*  ──────────────────────────────────────
    /// Synchronous update check. Phase 7 always returns `Ok(false)` (no
    /// update) because `bridge_updater::check_for_update` short-circuits
    /// on empty `CADENZA_BRIDGE_REPO`. The caller may also get back the
    /// latest polled state via `update_info()`.
    ///
    /// The async version lives in `update_poll` and runs in a tokio task
    /// at startup.
    pub fn update_check_sync(&self) -> anyhow::Result<bool> {
        // For now, just read whatever the background poll task has
        // cached into `bridge_state`. The protocol command asks "is
        // there an update?" and the answer is whatever the poller knows.
        Ok(self.bridge_state.update_info().is_some())
    }

    pub fn update_apply(&self) -> anyhow::Result<()> {
        // Phase 7 stub: the real apply path lives in bridge-updater and
        // is gated until Phase 9.
        let Some(_info) = self.bridge_state.update_info() else {
            return Err(anyhow::anyhow!("no update available to apply"));
        };
        Err(anyhow::anyhow!(
            "update apply not yet implemented (Phase 9)"
        ))
    }

    pub fn update_info(&self) -> Option<bridge_protocol::UpdateInfoSnapshot> {
        self.bridge_state.update_info()
    }
}

/// Resolve the watchdog executable path for the autostart registration. In
/// dev we assume the watchdog lives next to the bridge binary in the same
/// cargo target directory. In production the installer deposits it under
/// `/Applications/Cadenza Bridge.app/Contents/MacOS/` or equivalent.
fn watchdog_target_exe() -> anyhow::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let parent = exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("current_exe has no parent"))?;
    let name = if cfg!(target_os = "windows") {
        "cadenza-watchdog.exe"
    } else {
        "cadenza-watchdog"
    };
    Ok(parent.join(name))
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

/// Re-export the scanner free function so other crates can hit it without
/// pulling bridge-clap in directly.
pub fn scan_default_paths() -> Vec<PluginDescriptor> {
    let mut out = scanner::scan_default_paths();
    out.extend(bridge_vst3::scan_default_paths());
    out
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
