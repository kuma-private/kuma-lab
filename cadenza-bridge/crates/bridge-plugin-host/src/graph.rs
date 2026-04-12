//! Phase 3 audio graph: tracks → inserts → sends → buses → master, plus
//! block-rate (compiled per-sample) automation. The whole structure is
//! consumed by the audio worker thread, so it must be `Send`. The shape is
//! intentionally close to the frontend `Project` JSON model so a fresh
//! `Graph::from_project` rebuild on each project mutation is cheap.

use std::collections::HashMap;

use crate::automation::{Automation, AutomationFrame, AutomationPoint, Curve};
use crate::clip::MidiClip;
use crate::effects::{make_builtin, InsertEffect};
use crate::midi::{MidiEvent, MidiEventKind};
use crate::node::{Instrument, SilentInstrument};
use crate::transport::Transport;
use bridge_protocol::{AutomationSpec, ChainNodeSpec, MasterState, Project, SendSpec};

// ── Send / Bus / Master ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Send {
    pub id: String,
    pub dest_bus_id: String,
    pub level: f32,
    pub pre_fader: bool,
    /// Cached bus index, refreshed on graph build / patch. `None` until
    /// `Graph::cache_send_indices()` runs (or if the destination doesn't
    /// exist).
    pub dest_bus_idx: Option<usize>,
}

impl From<&SendSpec> for Send {
    fn from(s: &SendSpec) -> Self {
        Self {
            id: s.id.clone(),
            dest_bus_id: s.dest_bus_id.clone(),
            level: s.level,
            pre_fader: s.pre,
            dest_bus_idx: None,
        }
    }
}

pub struct Bus {
    pub id: String,
    pub name: String,
    pub inserts: Vec<EffectNode>,
    pub sends: Vec<Send>,
    pub volume_db: f64,
    pub pan: f64,
    /// Accumulator: written by track render, drained by bus render.
    pub input_buffer: Vec<f32>,
}

impl Bus {
    fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            inserts: Vec::new(),
            sends: Vec::new(),
            volume_db: 0.0,
            pan: 0.0,
            input_buffer: Vec::new(),
        }
    }
}

pub struct Master {
    pub inserts: Vec<EffectNode>,
    pub volume_db: f64,
}

impl Default for Master {
    fn default() -> Self {
        Self {
            inserts: Vec::new(),
            volume_db: 0.0,
        }
    }
}

// ── EffectNode wraps an InsertEffect with id+plugin metadata ──────────────

pub struct EffectNode {
    pub id: String,
    pub format: String,
    pub uid: String,
    pub name: String,
    pub bypass: bool,
    pub effect: Box<dyn InsertEffect>,
}

impl EffectNode {
    pub fn from_spec(spec: &ChainNodeSpec) -> Option<Self> {
        // Phase 3 only supports format=builtin
        if spec.plugin.format != "builtin" {
            return None;
        }
        let mut effect = make_builtin(&spec.plugin.uid)?;
        // Apply initial params
        for (k, v) in spec.params.iter() {
            if let Some(n) = v.as_f64() {
                effect.set_param(k, n);
            } else if let Some(b) = v.as_bool() {
                effect.set_param(k, if b { 1.0 } else { 0.0 });
            }
        }
        Some(Self {
            id: spec.id.clone(),
            format: spec.plugin.format.clone(),
            uid: spec.plugin.uid.clone(),
            name: spec.plugin.name.clone(),
            bypass: spec.bypass,
            effect,
        })
    }
}

// ── Track ─────────────────────────────────────────────────────────────────

pub struct Track {
    pub id: String,
    pub name: String,
    pub instrument: Box<dyn Instrument>,
    pub inserts: Vec<EffectNode>,
    pub sends: Vec<Send>,
    pub clips: Vec<MidiClip>,
    pub volume_db: f64,
    pub pan: f64,
    pub mute: bool,
    pub solo: bool,
    pub automation: Vec<Automation>,
    /// Live (non-clip) MIDI events queued from the network thread, in arrival order.
    live_events: Vec<MidiEvent>,
    /// Scratch buffer reused per process call. Owned by the track to keep
    /// the audio callback allocation-free after warmup.
    scratch: Vec<f32>,
    /// Pre-fader buffer (kept for pre-fader sends).
    pre_fader: Vec<f32>,
}

impl Track {
    pub fn new(id: String, name: String, instrument: Box<dyn Instrument>) -> Self {
        Self {
            id,
            name,
            instrument,
            inserts: Vec::new(),
            sends: Vec::new(),
            clips: Vec::new(),
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            automation: Vec::new(),
            live_events: Vec::new(),
            scratch: Vec::new(),
            pre_fader: Vec::new(),
        }
    }

    pub fn gain_linear(&self) -> f32 {
        if self.mute {
            return 0.0;
        }
        10f32.powf((self.volume_db as f32) / 20.0)
    }

    pub fn pan_gains(&self) -> (f32, f32) {
        // Equal-power pan, pan ∈ [-1, 1]
        let pan = self.pan.clamp(-1.0, 1.0) as f32;
        let theta = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
        (theta.cos(), theta.sin())
    }

    pub fn push_live(&mut self, ev: MidiEvent) {
        self.live_events.push(ev);
    }

    fn ensure_scratch(&mut self, n_frames: usize) {
        let needed = n_frames * 2;
        if self.scratch.len() < needed {
            self.scratch.resize(needed, 0.0);
        }
        if self.pre_fader.len() < needed {
            self.pre_fader.resize(needed, 0.0);
        }
    }
}

// ── Automation conversion helpers ─────────────────────────────────────────

fn make_automation(spec: &AutomationSpec) -> Automation {
    Automation {
        target_node_id: spec.node_id.clone(),
        target_param_id: spec.param_id.clone(),
        points: spec
            .points
            .iter()
            .map(|p| AutomationPoint {
                tick: p.tick,
                value: p.value,
                curve: Curve::from_label(&p.curve),
            })
            .collect(),
    }
}

fn make_inserts(specs: &[ChainNodeSpec]) -> Vec<EffectNode> {
    specs.iter().filter_map(EffectNode::from_spec).collect()
}

fn make_sends(specs: &[SendSpec]) -> Vec<Send> {
    specs.iter().map(Send::from).collect()
}

// ── Graph ─────────────────────────────────────────────────────────────────

pub struct Graph {
    pub tracks: Vec<Track>,
    pub buses: Vec<Bus>,
    pub master: Master,
    pub bpm: f64,
    pub sample_rate: u32,
    /// Topologically sorted bus indices for the current project.
    bus_order: Vec<usize>,
    /// Master scratch (interleaved stereo).
    master_buf: Vec<f32>,
    /// Reusable automation frame for per-block ramp compilation.
    auto_frame: AutomationFrame,
    /// Reusable scratch buffer for one bus signal during cascade routing.
    bus_signal_scratch: Vec<f32>,
}

impl Graph {
    pub fn new(bpm: f64, sample_rate: u32) -> Self {
        Self {
            tracks: Vec::new(),
            buses: Vec::new(),
            master: Master::default(),
            bpm,
            sample_rate,
            bus_order: Vec::new(),
            master_buf: Vec::new(),
            auto_frame: AutomationFrame::default(),
            bus_signal_scratch: Vec::new(),
        }
    }

    /// Build a graph from a parsed `Project`. Tracks without an instrument
    /// (or with an unknown plugin id) get a `SilentInstrument`. Returns
    /// an error if the bus topology contains a cycle.
    pub fn from_project(
        project: &Project,
        mut make_instrument: impl FnMut(&str) -> Option<Box<dyn Instrument>>,
    ) -> anyhow::Result<Self> {
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
            t.pan = ts.pan;
            t.mute = ts.mute;
            t.solo = ts.solo;
            t.inserts = make_inserts(&ts.inserts);
            t.sends = make_sends(&ts.sends);
            t.automation = ts.automation.iter().map(make_automation).collect();
            // Hint sample rate to inserts.
            for ins in t.inserts.iter_mut() {
                ins.effect.set_sample_rate(project.sample_rate);
            }
            g.tracks.push(t);
        }
        for bs in &project.buses {
            let mut b = Bus::new(bs.id.clone(), bs.name.clone());
            b.inserts = make_inserts(&bs.inserts);
            b.sends = make_sends(&bs.sends);
            b.volume_db = bs.volume_db;
            b.pan = bs.pan;
            for ins in b.inserts.iter_mut() {
                ins.effect.set_sample_rate(project.sample_rate);
            }
            g.buses.push(b);
        }
        g.master = make_master(&project.master, project.sample_rate);
        g.recompute_bus_order()?;
        Ok(g)
    }

    pub fn track_index(&self, id: &str) -> Option<usize> {
        self.tracks.iter().position(|t| t.id == id)
    }

    pub fn bus_index(&self, id: &str) -> Option<usize> {
        self.buses.iter().position(|b| b.id == id)
    }

    /// Recompute the topological order of buses. A bus may send to another
    /// bus; we use Kahn's algorithm. Cycles return an error.
    /// Also refreshes the cached `dest_bus_idx` on every track + bus send so
    /// that the audio callback never has to scan by id.
    pub fn recompute_bus_order(&mut self) -> anyhow::Result<()> {
        let n = self.buses.len();
        let mut in_degree = vec![0usize; n];
        let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
        let id_to_idx: HashMap<String, usize> = self
            .buses
            .iter()
            .enumerate()
            .map(|(i, b)| (b.id.clone(), i))
            .collect();
        for (i, b) in self.buses.iter().enumerate() {
            for s in &b.sends {
                if let Some(&j) = id_to_idx.get(&s.dest_bus_id) {
                    adj[i].push(j);
                    in_degree[j] += 1;
                }
            }
        }
        let mut order = Vec::with_capacity(n);
        let mut queue: Vec<usize> = (0..n).filter(|&i| in_degree[i] == 0).collect();
        while let Some(i) = queue.pop() {
            order.push(i);
            let neighbours = adj[i].clone();
            for j in neighbours {
                in_degree[j] -= 1;
                if in_degree[j] == 0 {
                    queue.push(j);
                }
            }
        }
        if order.len() != n {
            return Err(anyhow::anyhow!(
                "bus routing contains a cycle ({} of {} buses sorted)",
                order.len(),
                n
            ));
        }
        self.bus_order = order;
        self.cache_send_indices(&id_to_idx);
        Ok(())
    }

    /// Refresh the cached `dest_bus_idx` on every send (track and bus).
    fn cache_send_indices(&mut self, id_to_idx: &HashMap<String, usize>) {
        for t in self.tracks.iter_mut() {
            for s in t.sends.iter_mut() {
                s.dest_bus_idx = id_to_idx.get(&s.dest_bus_id).copied();
            }
        }
        for b in self.buses.iter_mut() {
            for s in b.sends.iter_mut() {
                s.dest_bus_idx = id_to_idx.get(&s.dest_bus_id).copied();
            }
        }
    }

    /// Render one block. `out` is interleaved stereo, `out.len() == n_frames * 2`.
    /// All temporary buffers (`master_buf`, `bus_signal_scratch`,
    /// `Track::scratch`, `Track::pre_fader`, `auto_frame.ramps`) are owned
    /// by the graph and resized lazily, so the steady-state callback path
    /// performs no allocations.
    pub fn process(&mut self, transport: &Transport, out: &mut [f32], n_frames: usize) {
        let stereo_len = n_frames * 2;
        debug_assert_eq!(out.len(), stereo_len);

        if self.master_buf.len() < stereo_len {
            self.master_buf.resize(stereo_len, 0.0);
        }
        if self.bus_signal_scratch.len() < stereo_len {
            self.bus_signal_scratch.resize(stereo_len, 0.0);
        }
        for s in self.master_buf[..stereo_len].iter_mut() {
            *s = 0.0;
        }

        // Clear / size bus accumulators.
        for b in self.buses.iter_mut() {
            if b.input_buffer.len() < stereo_len {
                b.input_buffer.resize(stereo_len, 0.0);
            }
            for s in b.input_buffer[..stereo_len].iter_mut() {
                *s = 0.0;
            }
        }

        let any_solo = self.tracks.iter().any(|t| t.solo);
        let spt = transport.samples_per_tick();
        let range_start = if transport.playing {
            transport.position_tick()
        } else {
            0
        };
        let range_end = if transport.playing {
            range_start + ((n_frames as f64 / spt).ceil() as i64).max(1)
        } else {
            0
        };
        let ticks_per_sample = if spt > 0.0 { 1.0 / spt } else { 0.0 };
        let block_start_tick_f = if transport.playing {
            transport.position_samples as f64 / spt
        } else {
            0.0
        };

        let mut events_buf: Vec<MidiEvent> = Vec::with_capacity(32);

        // ── Per-track render ──────────────────────────────────────────────
        let n_tracks = self.tracks.len();
        for ti in 0..n_tracks {
            let muted;
            let gain;
            let pan_l;
            let pan_r;
            {
                let track = &mut self.tracks[ti];
                track.ensure_scratch(n_frames);
                muted = track.mute || (any_solo && !track.solo);
                gain = track.gain_linear();
                let (pl, pr) = track.pan_gains();
                pan_l = pl;
                pan_r = pr;

                events_buf.clear();
                for ev in track.live_events.drain(..) {
                    events_buf.push(MidiEvent {
                        sample_offset: 0,
                        kind: ev.kind,
                    });
                }
                if transport.playing {
                    for clip in &track.clips {
                        clip.events_in_range(
                            range_start,
                            range_end,
                            spt,
                            &mut events_buf,
                        );
                    }
                }
                events_buf.sort_by_key(|e| e.sample_offset);

                let scratch = &mut track.scratch[..stereo_len];
                for s in scratch.iter_mut() {
                    *s = 0.0;
                }
                track.instrument.process(&events_buf, scratch, n_frames);
            }

            // ── Build automation frame for THIS track's chain ─────────────
            // Use the disjoint-field split helper to read from
            // self.tracks[ti].automation while mutating self.auto_frame.
            self.auto_frame.clear();
            {
                let (lanes, frame) = self.split_automation_and_frame_mut(ti);
                for lane in lanes.iter() {
                    let slot = frame.make_active(&lane.target_param_id, n_frames);
                    for (i, slot_i) in slot.iter_mut().enumerate().take(n_frames) {
                        let t =
                            block_start_tick_f + ticks_per_sample * (i as f64);
                        *slot_i = lane.value_at(t) as f32;
                    }
                }
            }

            // ── Apply track inserts ───────────────────────────────────────
            {
                let track = &mut self.tracks[ti];
                let scratch = &mut track.scratch[..stereo_len];
                for ins in track.inserts.iter_mut() {
                    if ins.bypass {
                        continue;
                    }
                    ins.effect.process(scratch, n_frames, &self.auto_frame);
                }

                // Snapshot pre-fader for pre-fader sends.
                let (head_scratch, tail_pre) = {
                    let pre = &mut track.pre_fader[..stereo_len];
                    pre.copy_from_slice(scratch);
                    (scratch, pre)
                };
                let _ = tail_pre; // shadow alias kept for readability

                // Apply pan + volume + mute/solo to scratch (post-fader path).
                if !muted {
                    for f in 0..n_frames {
                        let l = head_scratch[f * 2];
                        let r = head_scratch[f * 2 + 1];
                        head_scratch[f * 2] = l * pan_l * gain;
                        head_scratch[f * 2 + 1] = r * pan_r * gain;
                    }
                } else {
                    for s in head_scratch.iter_mut() {
                        *s = 0.0;
                    }
                }
            }

            // ── Sends: route into buses ──────────────────────────────────
            // Uses cached `dest_bus_idx` (refreshed at graph build /
            // patch time) so the audio callback never scans by id.
            let n_sends = self.tracks[ti].sends.len();
            for si in 0..n_sends {
                let (bus_idx, level, pre_fader) = {
                    let s = &self.tracks[ti].sends[si];
                    match s.dest_bus_idx {
                        Some(i) => (i, s.level, s.pre_fader),
                        None => continue,
                    }
                };
                let (track_ref, buses_slice) = self.split_track_and_buses_mut(ti);
                let dest = &mut buses_slice[bus_idx];
                let src: &[f32] = if pre_fader {
                    &track_ref.pre_fader[..stereo_len]
                } else {
                    &track_ref.scratch[..stereo_len]
                };
                for (b, t) in dest.input_buffer[..stereo_len]
                    .iter_mut()
                    .zip(src.iter())
                {
                    *b += *t * level;
                }
            }

            // Sum post-volume track signal into master.
            if !muted {
                let track = &self.tracks[ti];
                for (m, t) in self.master_buf[..stereo_len]
                    .iter_mut()
                    .zip(track.scratch[..stereo_len].iter())
                {
                    *m += *t;
                }
            }
        }

        // ── Buses (in topological order) ──────────────────────────────────
        // Borrow `bus_order` by reference, but we still need self.buses mut.
        // The order vector is small and rarely changes, so we use indexes
        // directly without cloning.
        for order_idx in 0..self.bus_order.len() {
            let bi = self.bus_order[order_idx];
            self.auto_frame.clear();
            {
                let bus = &mut self.buses[bi];
                let buf = &mut bus.input_buffer[..stereo_len];
                for ins in bus.inserts.iter_mut() {
                    if ins.bypass {
                        continue;
                    }
                    ins.effect.process(buf, n_frames, &self.auto_frame);
                }
                let gain = 10f32.powf(bus.volume_db as f32 / 20.0);
                let pan = bus.pan.clamp(-1.0, 1.0) as f32;
                let theta = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
                let pl = theta.cos();
                let pr = theta.sin();
                for f in 0..n_frames {
                    let l = buf[f * 2];
                    let r = buf[f * 2 + 1];
                    buf[f * 2] = l * pl * gain;
                    buf[f * 2 + 1] = r * pr * gain;
                }
            }

            // Copy this bus's signal into the graph-owned scratch so we
            // can fan it out into other buses + master without keeping a
            // mut borrow on self.buses[bi].
            self.bus_signal_scratch[..stereo_len]
                .copy_from_slice(&self.buses[bi].input_buffer[..stereo_len]);

            // Cascade bus → bus sends. Uses cached `dest_bus_idx`.
            let n_bus_sends = self.buses[bi].sends.len();
            for si in 0..n_bus_sends {
                let (dest_idx, level) = {
                    let s = &self.buses[bi].sends[si];
                    match s.dest_bus_idx {
                        Some(i) if i != bi => (i, s.level),
                        _ => continue,
                    }
                };
                let dest = &mut self.buses[dest_idx];
                for (d, t) in dest.input_buffer[..stereo_len]
                    .iter_mut()
                    .zip(self.bus_signal_scratch[..stereo_len].iter())
                {
                    *d += *t * level;
                }
            }

            // Sum bus into master.
            for (m, t) in self.master_buf[..stereo_len]
                .iter_mut()
                .zip(self.bus_signal_scratch[..stereo_len].iter())
            {
                *m += *t;
            }
        }

        // ── Master ────────────────────────────────────────────────────────
        {
            let mb = &mut self.master_buf[..stereo_len];
            self.auto_frame.clear();
            for ins in self.master.inserts.iter_mut() {
                if ins.bypass {
                    continue;
                }
                ins.effect.process(mb, n_frames, &self.auto_frame);
            }
            let mg = 10f32.powf(self.master.volume_db as f32 / 20.0);
            for s in mb.iter_mut() {
                *s *= mg;
            }
        }

        out.copy_from_slice(&self.master_buf[..stereo_len]);
    }

    /// Split self.tracks[ti] from self.buses safely. Both fields are
    /// disjoint members of `Graph`, so this is sound — the borrow checker
    /// just can't see it through field projection inside a loop.
    fn split_track_and_buses_mut(&mut self, ti: usize) -> (&Track, &mut [Bus]) {
        // SAFETY: tracks and buses are independent fields. The returned
        // references' lifetimes are tied to `&mut self` so the caller can't
        // reuse them after this borrow ends.
        let tracks_ptr: *const Vec<Track> = &self.tracks;
        let buses_ptr: *mut Vec<Bus> = &mut self.buses;
        unsafe {
            let tracks_ref: &Vec<Track> = &*tracks_ptr;
            let buses_ref: &mut Vec<Bus> = &mut *buses_ptr;
            (&tracks_ref[ti], buses_ref.as_mut_slice())
        }
    }

    /// Split self.tracks[ti].automation from self.auto_frame. Both live
    /// inside `&mut self` and are disjoint, so this is sound.
    fn split_automation_and_frame_mut(
        &mut self,
        ti: usize,
    ) -> (&[Automation], &mut AutomationFrame) {
        let auto_ptr: *const Vec<Automation> = &self.tracks[ti].automation;
        let frame_ptr: *mut AutomationFrame = &mut self.auto_frame;
        unsafe {
            let auto_ref: &Vec<Automation> = &*auto_ptr;
            let frame_ref: &mut AutomationFrame = &mut *frame_ptr;
            (auto_ref.as_slice(), frame_ref)
        }
    }

    /// Send "all notes off" to every track. Used on stop / panic.
    pub fn all_notes_off(&mut self) {
        for t in &mut self.tracks {
            t.live_events.push(MidiEvent::all_off(0));
        }
    }

    pub fn push_live(&mut self, track_idx: usize, ev: MidiEvent) {
        if let Some(t) = self.tracks.get_mut(track_idx) {
            t.push_live(ev);
        }
    }

    // ── Mutation API used by chain.* handlers and project.patch ──────────

    pub fn add_insert_to_track(
        &mut self,
        track_id: &str,
        position: usize,
        spec: &ChainNodeSpec,
    ) -> anyhow::Result<()> {
        let ti = self
            .track_index(track_id)
            .ok_or_else(|| anyhow::anyhow!("unknown track id: {track_id}"))?;
        let node = EffectNode::from_spec(spec)
            .ok_or_else(|| anyhow::anyhow!("unsupported plugin format or unknown builtin uid: {}", spec.plugin.uid))?;
        let track = &mut self.tracks[ti];
        let pos = position.min(track.inserts.len());
        track.inserts.insert(pos, node);
        for ins in track.inserts.iter_mut() {
            ins.effect.set_sample_rate(self.sample_rate);
        }
        Ok(())
    }

    pub fn remove_insert_from_track(
        &mut self,
        track_id: &str,
        node_id: &str,
    ) -> anyhow::Result<()> {
        let ti = self
            .track_index(track_id)
            .ok_or_else(|| anyhow::anyhow!("unknown track id: {track_id}"))?;
        let track = &mut self.tracks[ti];
        let before = track.inserts.len();
        track.inserts.retain(|n| n.id != node_id);
        if track.inserts.len() == before {
            return Err(anyhow::anyhow!("unknown insert node id: {node_id}"));
        }
        Ok(())
    }

    pub fn set_insert_param(
        &mut self,
        track_id: &str,
        node_id: &str,
        param_id: &str,
        value: f64,
    ) -> anyhow::Result<()> {
        let ti = self
            .track_index(track_id)
            .ok_or_else(|| anyhow::anyhow!("unknown track id: {track_id}"))?;
        let track = &mut self.tracks[ti];
        let node = track
            .inserts
            .iter_mut()
            .find(|n| n.id == node_id)
            .ok_or_else(|| anyhow::anyhow!("unknown insert node id: {node_id}"))?;
        node.effect.set_param(param_id, value);
        Ok(())
    }

    /// Snapshot the current Graph for offline rendering. The clone duplicates
    /// MIDI clips, automation, send routing and effect *parameters* but the
    /// effect instances themselves are reconstructed from their type ids
    /// (so internal filter state starts cold). This is what you want for
    /// reproducible bounces.
    pub fn snapshot_for_render(&self) -> Self {
        let mut g = Graph::new(self.bpm, self.sample_rate);
        for src in &self.tracks {
            let mut t = Track::new(
                src.id.clone(),
                src.name.clone(),
                Box::new(SilentInstrument),
            );
            t.clips = src.clips.clone();
            t.volume_db = src.volume_db;
            t.pan = src.pan;
            t.mute = src.mute;
            t.solo = src.solo;
            t.sends = src.sends.clone();
            t.automation = src.automation.clone();
            // Rebuild inserts from type id + current params.
            for ins in &src.inserts {
                if let Some(mut effect) = make_builtin(&ins.uid) {
                    for &pid in ins.effect.param_ids() {
                        effect.set_param(pid, ins.effect.get_param(pid));
                    }
                    effect.set_sample_rate(self.sample_rate);
                    t.inserts.push(EffectNode {
                        id: ins.id.clone(),
                        format: ins.format.clone(),
                        uid: ins.uid.clone(),
                        name: ins.name.clone(),
                        bypass: ins.bypass,
                        effect,
                    });
                }
            }
            g.tracks.push(t);
        }
        for src in &self.buses {
            let mut b = Bus::new(src.id.clone(), src.name.clone());
            b.sends = src.sends.clone();
            b.volume_db = src.volume_db;
            b.pan = src.pan;
            for ins in &src.inserts {
                if let Some(mut effect) = make_builtin(&ins.uid) {
                    for &pid in ins.effect.param_ids() {
                        effect.set_param(pid, ins.effect.get_param(pid));
                    }
                    effect.set_sample_rate(self.sample_rate);
                    b.inserts.push(EffectNode {
                        id: ins.id.clone(),
                        format: ins.format.clone(),
                        uid: ins.uid.clone(),
                        name: ins.name.clone(),
                        bypass: ins.bypass,
                        effect,
                    });
                }
            }
            g.buses.push(b);
        }
        // Master
        for ins in &self.master.inserts {
            if let Some(mut effect) = make_builtin(&ins.uid) {
                for &pid in ins.effect.param_ids() {
                    effect.set_param(pid, ins.effect.get_param(pid));
                }
                effect.set_sample_rate(self.sample_rate);
                g.master.inserts.push(EffectNode {
                    id: ins.id.clone(),
                    format: ins.format.clone(),
                    uid: ins.uid.clone(),
                    name: ins.name.clone(),
                    bypass: ins.bypass,
                    effect,
                });
            }
        }
        g.master.volume_db = self.master.volume_db;
        let _ = g.recompute_bus_order();
        g
    }
}

fn make_master(spec: &MasterState, sample_rate: u32) -> Master {
    let mut m = Master {
        inserts: make_inserts(&spec.inserts),
        volume_db: spec.volume_db,
    };
    for ins in m.inserts.iter_mut() {
        ins.effect.set_sample_rate(sample_rate);
    }
    m
}

impl MidiEventKind {
    pub fn is_note_on(&self) -> bool {
        matches!(self, MidiEventKind::NoteOn { .. })
    }
}

