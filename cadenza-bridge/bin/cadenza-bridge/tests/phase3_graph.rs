//! Phase 3 integration: full audio graph (inserts/sends/buses/master),
//! automation, render.wav, project.patch, project.hash, chain.* commands.
//!
//! Most tests construct Graphs directly (no WS roundtrip) so we can poke
//! buffers; the dispatcher tests use the in-process `SessionState` to
//! exercise the command path without an audio device.

use bridge_core::session::SessionState;
use bridge_plugin_host::{
    apply_patch, automation::Curve, hash::hash_project, render::render_to_wav, Automation,
    AutomationPoint, Bus, EffectNode, GainEffect, Graph, InsertEffect, Send, SilentInstrument,
    Track, Transport,
};
use bridge_protocol::{
    BusState, ChainNodeSpec, JsonPatchOp, MasterState, MidiClipSpec, PluginRef, Project,
    TrackState,
};
use serde_json::json;

// ── Test instrument: emits a constant DC signal we can sum and inspect ──

struct DcInstrument(f32);
impl bridge_plugin_host::Instrument for DcInstrument {
    fn process(
        &mut self,
        _events: &[bridge_plugin_host::MidiEvent],
        out: &mut [f32],
        n_frames: usize,
    ) {
        for i in 0..n_frames {
            out[i * 2] = self.0;
            out[i * 2 + 1] = self.0;
        }
    }
}

fn rms(buf: &[f32]) -> f32 {
    if buf.is_empty() {
        return 0.0;
    }
    let sum: f32 = buf.iter().map(|s| s * s).sum();
    (sum / buf.len() as f32).sqrt()
}

fn make_gain_node(id: &str, gain_db: f64) -> EffectNode {
    let mut effect: Box<dyn InsertEffect> = Box::new(GainEffect::with_gain_db(gain_db));
    effect.set_sample_rate(48_000);
    EffectNode {
        id: id.into(),
        format: "builtin".into(),
        uid: "gain".into(),
        name: "Gain".into(),
        bypass: false,
        effect,
    }
}

// ── 1. Track + insert produces non-silent output ──────────────────────────

#[test]
fn track_with_gain_insert_produces_audio() {
    let mut g = Graph::new(120.0, 48_000);
    let mut t = Track::new("t1".into(), "T".into(), Box::new(DcInstrument(0.5)));
    t.inserts.push(make_gain_node("g1", -6.0));
    g.tracks.push(t);
    g.recompute_bus_order().unwrap();
    let transport = Transport::new(120.0, 48_000);
    let mut out = vec![0.0_f32; 256 * 2];
    g.process(&transport, &mut out, 256);
    let r = rms(&out);
    // Input is DC 0.5, gain -6 dB → 0.25, then track gain 0 dB pan center.
    assert!(r > 0.1, "expected non-silent output, rms={r}");
    assert!(r < 0.4, "expected attenuated output, rms={r}");
}

// ── 2. Track → send → bus → master ────────────────────────────────────────

#[test]
fn track_send_to_bus_with_insert_routes_signal() {
    let mut g = Graph::new(120.0, 48_000);
    let mut t = Track::new("t1".into(), "T".into(), Box::new(DcInstrument(0.5)));
    // No track-to-master path: mute the dry signal so we can isolate the
    // bus return.
    t.mute = true;
    t.sends.push(Send {
        id: "s1".into(),
        dest_bus_id: "bus1".into(),
        level: 1.0,
        pre_fader: true, // pre-fader so mute doesn't kill the send
        dest_bus_idx: None, // refreshed by recompute_bus_order
    });
    g.tracks.push(t);
    let mut bus = Bus {
        id: "bus1".into(),
        name: "Reverb".into(),
        inserts: vec![make_gain_node("bg", -6.0)],
        sends: vec![],
        volume_db: 0.0,
        pan: 0.0,
        input_buffer: Vec::new(),
    };
    bus.input_buffer.resize(2048, 0.0);
    g.buses.push(bus);
    g.recompute_bus_order().unwrap();
    let transport = Transport::new(120.0, 48_000);
    let mut out = vec![0.0_f32; 256 * 2];
    g.process(&transport, &mut out, 256);
    let r = rms(&out);
    assert!(r > 0.1, "bus return should be audible, rms={r}");
}

// ── 3. Automation ramp on a gain insert ───────────────────────────────────

#[test]
fn gain_automation_ramp_increases_output() {
    let mut g = Graph::new(120.0, 48_000);
    let mut t = Track::new("t1".into(), "T".into(), Box::new(DcInstrument(0.5)));
    t.inserts.push(make_gain_node("g1", 0.0));
    // Linear -20 → 0 dB over 96000 ticks (~125 ms at 120 bpm, PPQ 480)
    t.automation.push(Automation {
        target_node_id: "g1".into(),
        target_param_id: "gainDb".into(),
        points: vec![
            AutomationPoint {
                tick: 0,
                value: -20.0,
                curve: Curve::Linear,
            },
            AutomationPoint {
                tick: 96_000,
                value: 0.0,
                curve: Curve::Linear,
            },
        ],
    });
    g.tracks.push(t);
    g.recompute_bus_order().unwrap();
    let mut transport = Transport::new(120.0, 48_000);
    transport.play();
    let mut out_a = vec![0.0_f32; 256 * 2];
    g.process(&transport, &mut out_a, 256);
    transport.advance(48_000); // 1 second
    let mut out_b = vec![0.0_f32; 256 * 2];
    g.process(&transport, &mut out_b, 256);
    let r1 = rms(&out_a);
    let r2 = rms(&out_b);
    assert!(r2 > r1, "ramp should grow: r1={r1} r2={r2}");
}

// ── 4. Topological sort: bus chain ────────────────────────────────────────

#[test]
fn topological_sort_orders_buses() {
    let mut g = Graph::new(120.0, 48_000);
    g.buses.push(Bus {
        id: "a".into(),
        name: "A".into(),
        inserts: vec![],
        sends: vec![Send {
            id: "sa".into(),
            dest_bus_id: "b".into(),
            level: 1.0,
            pre_fader: false,
            dest_bus_idx: None,
        }],
        volume_db: 0.0,
        pan: 0.0,
        input_buffer: Vec::new(),
    });
    g.buses.push(Bus {
        id: "b".into(),
        name: "B".into(),
        inserts: vec![],
        sends: vec![],
        volume_db: 0.0,
        pan: 0.0,
        input_buffer: Vec::new(),
    });
    g.recompute_bus_order().unwrap();
    let transport = Transport::new(120.0, 48_000);
    let mut out = vec![0.0_f32; 64 * 2];
    g.process(&transport, &mut out, 64);
}

// ── 5. Cycle detection ────────────────────────────────────────────────────

#[test]
fn bus_cycle_returns_error() {
    let mut g = Graph::new(120.0, 48_000);
    g.buses.push(Bus {
        id: "a".into(),
        name: "A".into(),
        inserts: vec![],
        sends: vec![Send {
            id: "sa".into(),
            dest_bus_id: "b".into(),
            level: 1.0,
            pre_fader: false,
            dest_bus_idx: None,
        }],
        volume_db: 0.0,
        pan: 0.0,
        input_buffer: Vec::new(),
    });
    g.buses.push(Bus {
        id: "b".into(),
        name: "B".into(),
        inserts: vec![],
        sends: vec![Send {
            id: "sb".into(),
            dest_bus_id: "a".into(),
            level: 1.0,
            pre_fader: false,
            dest_bus_idx: None,
        }],
        volume_db: 0.0,
        pan: 0.0,
        input_buffer: Vec::new(),
    });
    let res = g.recompute_bus_order();
    assert!(res.is_err(), "cycle should be detected");
}

// ── 6. render.wav round-trip ──────────────────────────────────────────────

#[test]
fn render_wav_writes_audible_file() {
    let mut g = Graph::new(120.0, 48_000);
    let mut t = Track::new("t1".into(), "T".into(), Box::new(DcInstrument(0.5)));
    t.inserts.push(make_gain_node("g", 0.0));
    g.tracks.push(t);
    g.recompute_bus_order().unwrap();
    let tmp = std::env::temp_dir().join(format!(
        "phase3-render-{}.wav",
        std::process::id()
    ));
    let res = render_to_wav(g, 0, 480, 48_000, 24, &tmp).unwrap();
    assert!(res.frames > 0);
    assert_eq!(res.sample_rate, 48_000);
    assert_eq!(res.bit_depth, 24);
    let reader = hound::WavReader::open(&res.path).unwrap();
    let max_abs: i32 = reader
        .into_samples::<i32>()
        .map(|s| s.unwrap().abs())
        .max()
        .unwrap();
    assert!(max_abs > 0, "render must be non-silent, max_abs={max_abs}");
    let _ = std::fs::remove_file(&tmp);
}

// ── 7. chain.addNode through dispatcher ──────────────────────────────────

#[test]
fn dispatcher_chain_add_node_updates_graph() {
    let state = SessionState::new();
    let project = Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: None,
            clips: vec![],
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            inserts: vec![],
            sends: vec![],
            automation: vec![],
        }],
        buses: vec![],
        master: MasterState::default(),
    };
    state.project_load(&project).unwrap();
    let plugin = PluginRef {
        format: "builtin".into(),
        uid: "gain".into(),
        name: "Gain".into(),
        vendor: None,
    };
    let node_id = state.chain_add_node("t1", 0, &plugin).unwrap();
    assert!(node_id.starts_with("node-"));
    // Set a parameter through the dispatcher
    state
        .chain_set_param("t1", &node_id, "gainDb", -12.0)
        .unwrap();
    // Remove
    state.chain_remove_node("t1", &node_id).unwrap();
}

#[test]
fn dispatcher_chain_add_node_rejects_clap_format() {
    let state = SessionState::new();
    let project = Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: None,
            clips: vec![],
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            inserts: vec![],
            sends: vec![],
            automation: vec![],
        }],
        buses: vec![],
        master: MasterState::default(),
    };
    state.project_load(&project).unwrap();
    let plugin = PluginRef {
        format: "clap".into(),
        uid: "/some/plugin.clap".into(),
        name: "X".into(),
        vendor: None,
    };
    let res = state.chain_add_node("t1", 0, &plugin);
    let err = res.unwrap_err().to_string();
    assert!(err.contains("not yet implemented"), "got: {err}");
}

// ── 8. project.patch via dispatcher ──────────────────────────────────────

#[test]
fn dispatcher_project_patch_updates_volume() {
    let state = SessionState::new();
    let project = Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: None,
            clips: vec![],
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            inserts: vec![],
            sends: vec![],
            automation: vec![],
        }],
        buses: vec![],
        master: MasterState::default(),
    };
    state.project_load(&project).unwrap();
    let ops = vec![JsonPatchOp {
        op: "replace".into(),
        path: "/tracks/t1/volumeDb".into(),
        value: Some(json!(-9.0)),
    }];
    let applied = state.project_patch(&ops).unwrap();
    assert_eq!(applied, 1);
}

// ── 9. project.hash deterministic ────────────────────────────────────────

#[test]
fn project_hash_is_deterministic() {
    let project = Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: None,
            clips: vec![],
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            inserts: vec![],
            sends: vec![],
            automation: vec![],
        }],
        buses: vec![],
        master: MasterState::default(),
    };
    let h1 = hash_project(&project);
    let h2 = hash_project(&project);
    assert_eq!(h1, h2);
    assert_eq!(h1.len(), 64); // 32-byte hex
}

// ── 10. SVF in project loaded via from_project ───────────────────────────

#[test]
fn project_with_svf_insert_loads() {
    let project = Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: None,
            clips: vec![],
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            inserts: vec![ChainNodeSpec {
                id: "filt".into(),
                kind: "insert".into(),
                plugin: PluginRef {
                    format: "builtin".into(),
                    uid: "svf".into(),
                    name: "SVF".into(),
                    vendor: None,
                },
                bypass: false,
                params: serde_json::Map::from_iter(vec![(
                    "cutoff".to_string(),
                    json!(800.0),
                )]),
                state_blob: None,
            }],
            sends: vec![],
            automation: vec![],
        }],
        buses: vec![],
        master: MasterState::default(),
    };
    let g = Graph::from_project(&project, |_| Some(Box::new(SilentInstrument))).unwrap();
    assert_eq!(g.tracks[0].inserts.len(), 1);
    let cutoff = g.tracks[0].inserts[0].effect.get_param("cutoff");
    assert!((cutoff - 800.0).abs() < 1e-6);
}

// ── 11. apply_patch round-trip on a non-empty project ────────────────────

#[test]
fn patch_add_send_then_replace_level() {
    let project = Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: None,
            clips: vec![MidiClipSpec {
                id: "c1".into(),
                start_tick: 0,
                length_ticks: 1920,
                notes: vec![],
            }],
            volume_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            inserts: vec![],
            sends: vec![],
            automation: vec![],
        }],
        buses: vec![BusState {
            id: "bus1".into(),
            name: "Reverb".into(),
            inserts: vec![],
            sends: vec![],
            volume_db: 0.0,
            pan: 0.0,
        }],
        master: MasterState::default(),
    };
    let mut g = Graph::from_project(&project, |_| Some(Box::new(SilentInstrument))).unwrap();
    let add = JsonPatchOp {
        op: "add".into(),
        path: "/tracks/t1/sends/-".into(),
        value: Some(json!({
            "id":"s1",
            "destBusId":"bus1",
            "level":0.3,
            "pre":false
        })),
    };
    apply_patch(&mut g, &[add]).unwrap();
    let level = g.tracks[0].sends[0].level;
    assert!((level - 0.3).abs() < 1e-6);
    let replace = JsonPatchOp {
        op: "replace".into(),
        path: "/tracks/t1/sends/s1/level".into(),
        value: Some(json!(0.7)),
    };
    apply_patch(&mut g, &[replace]).unwrap();
    let level = g.tracks[0].sends[0].level;
    assert!((level - 0.7).abs() < 1e-6);
}
