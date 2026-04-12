//! Polish round: end-to-end smoke tests for the new built-in instruments
//! and effects. The whole point of these is to prove a project can be loaded
//! through the public API with `format=builtin` instruments and produce
//! audible output, with no third-party plugin installation.

use bridge_core::session::SessionState;
use bridge_plugin_host::{
    instruments::make_builtin_instrument, Graph, MidiEvent, Transport,
};
use bridge_protocol::{
    BusState, ChainNodeSpec, InstrumentRef, MasterState, MidiClipSpec, MidiNoteSpec, PluginRef,
    Project, SendSpec, TrackState,
};
use serde_json::json;

fn rms(buf: &[f32]) -> f32 {
    if buf.is_empty() {
        return 0.0;
    }
    (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt()
}

// ── 1. Built-in factory returns the right instruments ─────────────────────

#[test]
fn make_builtin_instrument_returns_known_ids() {
    assert!(make_builtin_instrument("sine").is_some());
    assert!(make_builtin_instrument("supersaw").is_some());
    assert!(make_builtin_instrument("subbass").is_some());
    assert!(make_builtin_instrument("drumkit").is_some());
    assert!(make_builtin_instrument("not-a-thing").is_none());
}

// ── 2. Build a Graph from a Project that uses a built-in instrument ──────

fn make_project_with_builtin(uid: &str, note: u8) -> Project {
    Project {
        version: "1".into(),
        bpm: 120.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "t1".into(),
            name: "Lead".into(),
            instrument: Some(InstrumentRef {
                plugin_format: "builtin".into(),
                plugin_id: uid.into(),
            }),
            clips: vec![MidiClipSpec {
                id: "c1".into(),
                start_tick: 0,
                length_ticks: 1920,
                notes: vec![MidiNoteSpec {
                    pitch: note,
                    velocity: 110,
                    start_tick: 0,
                    length_ticks: 960,
                }],
            }],
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
    }
}

#[test]
fn supersaw_track_renders_audible_audio() {
    let project = make_project_with_builtin("supersaw", 64);
    let state = SessionState::new();
    state.project_load(&project).unwrap();
    let tmp = std::env::temp_dir().join(format!(
        "supersaw-render-{}.wav",
        std::process::id()
    ));
    let res = state
        .render_wav(0, 960, 48_000, 24, tmp.to_str().unwrap())
        .unwrap();
    let reader = hound::WavReader::open(&res.path).unwrap();
    let samples: Vec<f32> = reader
        .into_samples::<i32>()
        .map(|s| s.unwrap() as f32 / (1 << 23) as f32)
        .collect();
    let r = rms(&samples);
    assert!(r > 0.005, "supersaw render should be non-silent, rms={r}");
    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn subbass_track_renders_audible_audio() {
    let project = make_project_with_builtin("subbass", 36);
    let state = SessionState::new();
    state.project_load(&project).unwrap();
    let tmp = std::env::temp_dir().join(format!(
        "subbass-render-{}.wav",
        std::process::id()
    ));
    let res = state
        .render_wav(0, 960, 48_000, 24, tmp.to_str().unwrap())
        .unwrap();
    let reader = hound::WavReader::open(&res.path).unwrap();
    let samples: Vec<f32> = reader
        .into_samples::<i32>()
        .map(|s| s.unwrap() as f32 / (1 << 23) as f32)
        .collect();
    let r = rms(&samples);
    assert!(r > 0.005, "subbass render should be non-silent, rms={r}");
    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn drumkit_track_renders_audible_audio() {
    let project = make_project_with_builtin("drumkit", 36); // kick
    let state = SessionState::new();
    state.project_load(&project).unwrap();
    let tmp = std::env::temp_dir().join(format!(
        "drumkit-render-{}.wav",
        std::process::id()
    ));
    let res = state
        .render_wav(0, 960, 48_000, 24, tmp.to_str().unwrap())
        .unwrap();
    let reader = hound::WavReader::open(&res.path).unwrap();
    let samples: Vec<f32> = reader
        .into_samples::<i32>()
        .map(|s| s.unwrap() as f32 / (1 << 23) as f32)
        .collect();
    let r = rms(&samples);
    assert!(r > 0.001, "drumkit render should be non-silent, rms={r}");
    let _ = std::fs::remove_file(&tmp);
}

// ── 3. Built-in instrument + insert + send to bus integration test ───────

#[test]
fn supersaw_with_filter_and_delay_send_renders_non_silent() {
    let project = Project {
        version: "1".into(),
        bpm: 128.0,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![TrackState {
            id: "lead".into(),
            name: "Lead".into(),
            instrument: Some(InstrumentRef {
                plugin_format: "builtin".into(),
                plugin_id: "supersaw".into(),
            }),
            clips: vec![MidiClipSpec {
                id: "c1".into(),
                start_tick: 0,
                length_ticks: 1920,
                notes: vec![
                    MidiNoteSpec {
                        pitch: 60,
                        velocity: 110,
                        start_tick: 0,
                        length_ticks: 480,
                    },
                    MidiNoteSpec {
                        pitch: 64,
                        velocity: 110,
                        start_tick: 480,
                        length_ticks: 480,
                    },
                    MidiNoteSpec {
                        pitch: 67,
                        velocity: 110,
                        start_tick: 960,
                        length_ticks: 480,
                    },
                ],
            }],
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
                    name: "Filter".into(),
                    vendor: None,
                },
                bypass: false,
                params: serde_json::Map::from_iter(vec![
                    ("cutoff".to_string(), json!(2000.0)),
                    ("resonance".to_string(), json!(0.4)),
                ]),
                state_blob: None,
            }],
            sends: vec![SendSpec {
                id: "s1".into(),
                dest_bus_id: "fx".into(),
                level: 0.5,
                pre: false,
            }],
            automation: vec![],
        }],
        buses: vec![BusState {
            id: "fx".into(),
            name: "FX".into(),
            inserts: vec![ChainNodeSpec {
                id: "dly".into(),
                kind: "insert".into(),
                plugin: PluginRef {
                    format: "builtin".into(),
                    uid: "delay".into(),
                    name: "Delay".into(),
                    vendor: None,
                },
                bypass: false,
                params: serde_json::Map::from_iter(vec![
                    ("timeMs".to_string(), json!(220.0)),
                    ("feedback".to_string(), json!(0.45)),
                    ("mix".to_string(), json!(1.0)),
                ]),
                state_blob: None,
            }],
            sends: vec![],
            volume_db: 0.0,
            pan: 0.0,
        }],
        master: MasterState::default(),
    };

    let g = Graph::from_project(&project, make_builtin_instrument)
        .expect("graph builds");
    let mut transport = Transport::new(128.0, 48_000);
    transport.play();
    let n_frames = 48_000; // 1 second
    let mut out = vec![0.0_f32; n_frames * 2];
    let mut g = g;
    g.process(&transport, &mut out, n_frames);
    let r = rms(&out);
    assert!(
        r > 0.005,
        "supersaw + filter + delay send should produce audio, rms={r}"
    );
    assert_eq!(out.len(), n_frames * 2);
}

// ── 4. EDM demo: 4 tracks (kick, bass, lead, pad) renders non-silent ─────

#[test]
fn edm_demo_renders_non_silent() {
    let project = build_edm_demo_project();
    let state = SessionState::new();
    state.project_load(&project).unwrap();
    let tmp = std::env::temp_dir().join(format!(
        "edm-demo-render-{}.wav",
        std::process::id()
    ));
    // 4 bars at 128 BPM, PPQ 480 → 4 * 4 * 480 = 7680 ticks
    let res = state
        .render_wav(0, 7680, 48_000, 24, tmp.to_str().unwrap())
        .unwrap();
    let reader = hound::WavReader::open(&res.path).unwrap();
    let samples: Vec<f32> = reader
        .into_samples::<i32>()
        .map(|s| s.unwrap() as f32 / (1 << 23) as f32)
        .collect();
    assert!(samples.len() > 1000);
    let r = rms(&samples);
    assert!(r > 0.001, "edm demo render should be non-silent, rms={r}");
    let _ = std::fs::remove_file(&tmp);
}

fn build_edm_demo_project() -> Project {
    let bpm = 128.0;
    let bar = 1920_i64; // 4/4 at PPQ 480
    let mut kick_notes = Vec::new();
    // Kick on every quarter for 4 bars
    for bar_idx in 0..4 {
        for beat in 0..4 {
            kick_notes.push(MidiNoteSpec {
                pitch: 36,
                velocity: 120,
                start_tick: (bar_idx * bar) + (beat * 480),
                length_ticks: 240,
            });
        }
    }
    let mut bass_notes = Vec::new();
    // Bass eighth-notes on root
    for bar_idx in 0..4 {
        for eighth in 0..8 {
            bass_notes.push(MidiNoteSpec {
                pitch: 36,
                velocity: 100,
                start_tick: (bar_idx * bar) + (eighth * 240),
                length_ticks: 200,
            });
        }
    }
    // Lead chord stabs on each beat (Cmaj triad)
    let mut lead_notes = Vec::new();
    for bar_idx in 0..4 {
        for beat in 0..4 {
            for &p in &[60u8, 64, 67] {
                lead_notes.push(MidiNoteSpec {
                    pitch: p,
                    velocity: 100,
                    start_tick: (bar_idx * bar) + (beat * 480),
                    length_ticks: 360,
                });
            }
        }
    }
    // Pad: long sustained chord
    let mut pad_notes = Vec::new();
    for &p in &[48u8, 55, 64] {
        pad_notes.push(MidiNoteSpec {
            pitch: p,
            velocity: 80,
            start_tick: 0,
            length_ticks: bar * 4,
        });
    }

    Project {
        version: "1".into(),
        bpm,
        time_signature: [4, 4],
        sample_rate: 48_000,
        tracks: vec![
            // Kick
            TrackState {
                id: "kick".into(),
                name: "Kick".into(),
                instrument: Some(InstrumentRef {
                    plugin_format: "builtin".into(),
                    plugin_id: "drumkit".into(),
                }),
                clips: vec![MidiClipSpec {
                    id: "kick-c".into(),
                    start_tick: 0,
                    length_ticks: bar * 4,
                    notes: kick_notes,
                }],
                volume_db: 0.0,
                pan: 0.0,
                mute: false,
                solo: false,
                inserts: vec![],
                sends: vec![],
                automation: vec![],
            },
            // Bass
            TrackState {
                id: "bass".into(),
                name: "Bass".into(),
                instrument: Some(InstrumentRef {
                    plugin_format: "builtin".into(),
                    plugin_id: "subbass".into(),
                }),
                clips: vec![MidiClipSpec {
                    id: "bass-c".into(),
                    start_tick: 0,
                    length_ticks: bar * 4,
                    notes: bass_notes,
                }],
                volume_db: -3.0,
                pan: 0.0,
                mute: false,
                solo: false,
                inserts: vec![],
                sends: vec![],
                automation: vec![],
            },
            // Lead with svf + automation (200 → 8000 Hz)
            TrackState {
                id: "lead".into(),
                name: "Lead".into(),
                instrument: Some(InstrumentRef {
                    plugin_format: "builtin".into(),
                    plugin_id: "supersaw".into(),
                }),
                clips: vec![MidiClipSpec {
                    id: "lead-c".into(),
                    start_tick: 0,
                    length_ticks: bar * 4,
                    notes: lead_notes,
                }],
                volume_db: -6.0,
                pan: 0.0,
                mute: false,
                solo: false,
                inserts: vec![ChainNodeSpec {
                    id: "lead-filt".into(),
                    kind: "insert".into(),
                    plugin: PluginRef {
                        format: "builtin".into(),
                        uid: "svf".into(),
                        name: "Filter".into(),
                        vendor: None,
                    },
                    bypass: false,
                    params: serde_json::Map::from_iter(vec![(
                        "resonance".to_string(),
                        json!(0.6),
                    )]),
                    state_blob: None,
                }],
                sends: vec![SendSpec {
                    id: "lead-snd".into(),
                    dest_bus_id: "fx".into(),
                    level: 0.4,
                    pre: false,
                }],
                automation: vec![bridge_protocol::AutomationSpec {
                    node_id: "lead-filt".into(),
                    param_id: "cutoff".into(),
                    points: vec![
                        bridge_protocol::AutomationPointSpec {
                            id: "p1".into(),
                            tick: 0,
                            value: 200.0,
                            curve: "linear".into(),
                        },
                        bridge_protocol::AutomationPointSpec {
                            id: "p2".into(),
                            tick: bar * 4,
                            value: 8000.0,
                            curve: "linear".into(),
                        },
                    ],
                }],
            },
            // Pad → reverb send
            TrackState {
                id: "pad".into(),
                name: "Pad".into(),
                instrument: Some(InstrumentRef {
                    plugin_format: "builtin".into(),
                    plugin_id: "supersaw".into(),
                }),
                clips: vec![MidiClipSpec {
                    id: "pad-c".into(),
                    start_tick: 0,
                    length_ticks: bar * 4,
                    notes: pad_notes,
                }],
                volume_db: -10.0,
                pan: 0.0,
                mute: false,
                solo: false,
                inserts: vec![],
                sends: vec![SendSpec {
                    id: "pad-snd".into(),
                    dest_bus_id: "fx".into(),
                    level: 0.6,
                    pre: false,
                }],
                automation: vec![],
            },
        ],
        buses: vec![BusState {
            id: "fx".into(),
            name: "FX".into(),
            inserts: vec![ChainNodeSpec {
                id: "fx-rev".into(),
                kind: "insert".into(),
                plugin: PluginRef {
                    format: "builtin".into(),
                    uid: "reverb".into(),
                    name: "Reverb".into(),
                    vendor: None,
                },
                bypass: false,
                params: serde_json::Map::from_iter(vec![
                    ("roomSize".to_string(), json!(0.7)),
                    ("mix".to_string(), json!(1.0)),
                ]),
                state_blob: None,
            }],
            sends: vec![],
            volume_db: -6.0,
            pan: 0.0,
        }],
        master: MasterState::default(),
    }
}

// ── 5. Direct Graph render with builtin instrument: smoke test ───────────

#[test]
fn graph_with_builtin_supersaw_processes_block() {
    let project = make_project_with_builtin("supersaw", 60);
    let g = Graph::from_project(&project, make_builtin_instrument).unwrap();
    let mut g = g;
    let mut transport = Transport::new(120.0, 48_000);
    transport.play();
    let mut out = vec![0.0_f32; 512 * 2];
    g.process(&transport, &mut out, 512);
    // Should not panic; output buffer length is correct.
    assert_eq!(out.len(), 1024);
}

// ── 6. Direct instrument event mix: live note input through SineInstrument ──

#[test]
fn sine_instrument_processes_live_events() {
    let mut inst = make_builtin_instrument("sine").unwrap();
    inst.set_sample_rate(48_000);
    let events = [MidiEvent::note_on(0, 72, 100)];
    let mut buf = vec![0.0_f32; 512 * 2];
    inst.process(&events, &mut buf, 512);
    let r = rms(&buf);
    assert!(r > 0.01, "live sine note should be audible, rms={r}");
}
