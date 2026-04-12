use serde::{Deserialize, Serialize};

pub const BRIDGE_VERSION: &str = "0.1.0";

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "kind")]
pub enum Message {
    #[serde(rename = "request")]
    Request { id: String, command: Command },
}

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum Command {
    #[serde(rename = "handshake")]
    Handshake { version: String },
    #[serde(rename = "debug.sine")]
    DebugSine { on: bool },
    #[serde(rename = "plugins.scan")]
    PluginsScan,
    #[serde(rename = "plugins.list")]
    PluginsList,
    #[serde(rename = "project.load")]
    ProjectLoad { project: Project },
    #[serde(rename = "project.patch")]
    ProjectPatch { ops: Vec<JsonPatchOp> },
    #[serde(rename = "project.hash")]
    ProjectHash,
    #[serde(rename = "transport.play")]
    TransportPlay {
        #[serde(default, rename = "fromTick")]
        from_tick: Option<i64>,
    },
    #[serde(rename = "transport.stop")]
    TransportStop,
    #[serde(rename = "transport.seek")]
    TransportSeek { tick: i64 },
    #[serde(rename = "midi.noteOn")]
    MidiNoteOn {
        #[serde(rename = "trackId")]
        track_id: String,
        pitch: u8,
        velocity: u8,
    },
    #[serde(rename = "midi.noteOff")]
    MidiNoteOff {
        #[serde(rename = "trackId")]
        track_id: String,
        pitch: u8,
    },
    #[serde(rename = "chain.addNode")]
    ChainAddNode {
        #[serde(rename = "trackId")]
        track_id: String,
        position: usize,
        plugin: PluginRef,
    },
    #[serde(rename = "chain.removeNode")]
    ChainRemoveNode {
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    #[serde(rename = "chain.setParam")]
    ChainSetParam {
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "paramId")]
        param_id: String,
        value: f64,
    },
    #[serde(rename = "render.wav")]
    RenderWav {
        #[serde(rename = "fromTick")]
        from_tick: i64,
        #[serde(rename = "toTick")]
        to_tick: i64,
        #[serde(default = "default_sample_rate", rename = "sampleRate")]
        sample_rate: u32,
        #[serde(default = "default_bit_depth", rename = "bitDepth")]
        bit_depth: u8,
        path: String,
    },
    #[serde(rename = "chain.showEditor")]
    ChainShowEditor {
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    #[serde(rename = "chain.hideEditor")]
    ChainHideEditor {
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    #[serde(rename = "system.setAutostart")]
    SystemSetAutostart { enabled: bool },
    #[serde(rename = "system.getAutostart")]
    SystemGetAutostart,
    #[serde(rename = "update.check")]
    UpdateCheck,
    #[serde(rename = "update.apply")]
    UpdateApply,
    /// Phase 8: premium ticket verification. The browser sends the
    /// short-lived JWT it obtained from `POST /api/bridge/ticket`;
    /// the Bridge calls `/api/bridge/verify-ticket` and caches the
    /// resulting entitlements for subsequent commands.
    #[serde(rename = "session.verify")]
    SessionVerify { ticket: String },
}

fn default_sample_rate() -> u32 {
    48_000
}

fn default_bit_depth() -> u8 {
    24
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonPatchOp {
    pub op: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginRef {
    pub format: String,
    pub uid: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
}

// ── Project model ─────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub version: String,
    pub bpm: f64,
    pub time_signature: [u8; 2],
    pub sample_rate: u32,
    pub tracks: Vec<TrackState>,
    #[serde(default)]
    pub buses: Vec<BusState>,
    #[serde(default)]
    pub master: MasterState,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackState {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub instrument: Option<InstrumentRef>,
    #[serde(default)]
    pub clips: Vec<MidiClipSpec>,
    #[serde(default)]
    pub volume_db: f64,
    #[serde(default)]
    pub pan: f64,
    #[serde(default)]
    pub mute: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default)]
    pub inserts: Vec<ChainNodeSpec>,
    #[serde(default)]
    pub sends: Vec<SendSpec>,
    #[serde(default)]
    pub automation: Vec<AutomationSpec>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentRef {
    pub plugin_format: String,
    pub plugin_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MidiClipSpec {
    pub id: String,
    pub start_tick: i64,
    pub length_ticks: i64,
    pub notes: Vec<MidiNoteSpec>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MidiNoteSpec {
    pub pitch: u8,
    pub velocity: u8,
    pub start_tick: i64,
    pub length_ticks: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginDescriptor {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub path: String,
    pub format: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChainNodeSpec {
    pub id: String,
    #[serde(default = "default_chain_kind")]
    pub kind: String,
    pub plugin: PluginRef,
    #[serde(default)]
    pub bypass: bool,
    #[serde(default)]
    pub params: serde_json::Map<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_blob: Option<String>,
}

fn default_chain_kind() -> String {
    "insert".to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SendSpec {
    pub id: String,
    pub dest_bus_id: String,
    pub level: f32,
    #[serde(default)]
    pub pre: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BusState {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub inserts: Vec<ChainNodeSpec>,
    #[serde(default)]
    pub sends: Vec<SendSpec>,
    #[serde(default)]
    pub volume_db: f64,
    #[serde(default)]
    pub pan: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MasterState {
    #[serde(default)]
    pub inserts: Vec<ChainNodeSpec>,
    #[serde(default)]
    pub volume_db: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSpec {
    /// Empty string targets the track itself (e.g. volumeDb / pan).
    #[serde(default)]
    pub node_id: String,
    pub param_id: String,
    pub points: Vec<AutomationPointSpec>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutomationPointSpec {
    pub tick: i64,
    pub value: f64,
    #[serde(default = "default_curve")]
    pub curve: String,
}

fn default_curve() -> String {
    "linear".to_string()
}

// ── Outgoing ─────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(untagged)]
pub enum Outgoing {
    Response {
        id: String,
        kind: &'static str,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<ErrorBody>,
    },
    Event {
        kind: &'static str,
        event: Event,
    },
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum Event {
    #[serde(rename = "handshake.ack")]
    HandshakeAck {
        #[serde(rename = "bridgeVersion")]
        bridge_version: String,
        capabilities: Vec<String>,
        #[serde(rename = "updateAvailable")]
        update_available: bool,
    },
    #[serde(rename = "transport.position")]
    TransportPosition { tick: i64, seconds: f64 },
    #[serde(rename = "transport.state")]
    TransportState { state: String },
    #[serde(rename = "plugin.scan.complete")]
    PluginScanComplete { count: u32 },
    #[serde(rename = "editor.closed")]
    EditorClosed {
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    #[serde(rename = "update.progress")]
    UpdateProgress { phase: String, percent: u32 },
}

/// Snapshot of update-availability info surfaced through `handshake.ack` and
/// `update.check`. All fields are optional because the updater may be in a
/// "not yet checked" state on first connect.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfoSnapshot {
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: String,
    pub download_url: String,
}

impl Outgoing {
    pub fn ok(id: impl Into<String>, result: serde_json::Value) -> Self {
        Outgoing::Response {
            id: id.into(),
            kind: "response",
            ok: true,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: impl Into<String>, code: &str, message: &str) -> Self {
        Outgoing::Response {
            id: id.into(),
            kind: "response",
            ok: false,
            result: None,
            error: Some(ErrorBody {
                code: code.to_string(),
                message: message.to_string(),
            }),
        }
    }

    pub fn event(event: Event) -> Self {
        Outgoing::Event {
            kind: "event",
            event,
        }
    }
}

pub fn handshake_result() -> serde_json::Value {
    handshake_result_with_update(None)
}

pub fn handshake_result_with_update(update: Option<&UpdateInfoSnapshot>) -> serde_json::Value {
    let mut obj = serde_json::json!({
        "bridgeVersion": BRIDGE_VERSION,
        "capabilities": [
            "audio",
            "debug",
            "plugins",
            "transport",
            "project",
            "render",
            "editor",
            "autostart",
            "update",
        ],
        "updateAvailable": update.is_some(),
    });
    if let Some(info) = update {
        let map = obj.as_object_mut().expect("json object");
        map.insert("latestVersion".into(), info.latest_version.clone().into());
        map.insert("releaseNotes".into(), info.release_notes.clone().into());
        map.insert("releaseUrl".into(), info.release_url.clone().into());
    }
    obj
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_handshake_request() {
        let raw = r#"{"kind":"request","id":"1","command":{"type":"handshake","version":"0.1"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        match msg {
            Message::Request { id, command } => {
                assert_eq!(id, "1");
                match command {
                    Command::Handshake { version } => assert_eq!(version, "0.1"),
                    _ => panic!("expected handshake"),
                }
            }
        }
    }

    #[test]
    fn parses_debug_sine_request() {
        let raw = r#"{"kind":"request","id":"2","command":{"type":"debug.sine","on":true}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::DebugSine { on } => assert!(on),
            _ => panic!("expected debug.sine"),
        }
    }

    #[test]
    fn serializes_ok_response() {
        let out = Outgoing::ok("42", handshake_result());
        let s = serde_json::to_string(&out).unwrap();
        assert!(s.contains("\"id\":\"42\""));
        assert!(s.contains("\"ok\":true"));
        assert!(s.contains("\"bridgeVersion\":\"0.1.0\""));
        assert!(s.contains("\"capabilities\""));
    }

    #[test]
    fn parses_project_load() {
        let raw = r#"{"kind":"request","id":"p1","command":{"type":"project.load","project":{
            "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
            "tracks":[{"id":"t1","name":"Lead","clips":[]}]
        }}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::ProjectLoad { project } => {
                assert_eq!(project.bpm, 120.0);
                assert_eq!(project.tracks.len(), 1);
                assert_eq!(project.tracks[0].id, "t1");
            }
            _ => panic!("expected project.load"),
        }
    }

    #[test]
    fn parses_transport_play_with_default() {
        let raw = r#"{"kind":"request","id":"x","command":{"type":"transport.play"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::TransportPlay { from_tick } => assert!(from_tick.is_none()),
            _ => panic!("expected transport.play"),
        }
    }

    #[test]
    fn parses_midi_note_on() {
        let raw = r#"{"kind":"request","id":"n","command":{"type":"midi.noteOn","trackId":"t1","pitch":60,"velocity":100}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::MidiNoteOn {
                track_id,
                pitch,
                velocity,
            } => {
                assert_eq!(track_id, "t1");
                assert_eq!(pitch, 60);
                assert_eq!(velocity, 100);
            }
            _ => panic!("expected midi.noteOn"),
        }
    }

    #[test]
    fn parses_chain_add_node() {
        let raw = r#"{"kind":"request","id":"c","command":{"type":"chain.addNode","trackId":"t1","position":0,"plugin":{"format":"builtin","uid":"gain","name":"Gain"}}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::ChainAddNode {
                track_id,
                position,
                plugin,
            } => {
                assert_eq!(track_id, "t1");
                assert_eq!(position, 0);
                assert_eq!(plugin.format, "builtin");
                assert_eq!(plugin.uid, "gain");
            }
            _ => panic!("expected chain.addNode"),
        }
    }

    #[test]
    fn parses_render_wav() {
        let raw = r#"{"kind":"request","id":"r","command":{"type":"render.wav","fromTick":0,"toTick":1920,"sampleRate":48000,"bitDepth":24,"path":"out.wav"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::RenderWav {
                from_tick,
                to_tick,
                sample_rate,
                bit_depth,
                path,
            } => {
                assert_eq!(from_tick, 0);
                assert_eq!(to_tick, 1920);
                assert_eq!(sample_rate, 48000);
                assert_eq!(bit_depth, 24);
                assert_eq!(path, "out.wav");
            }
            _ => panic!("expected render.wav"),
        }
    }

    #[test]
    fn parses_project_hash() {
        let raw = r#"{"kind":"request","id":"h","command":{"type":"project.hash"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        assert!(matches!(command, Command::ProjectHash));
    }

    #[test]
    fn parses_chain_show_editor() {
        let raw = r#"{"kind":"request","id":"e","command":{"type":"chain.showEditor","trackId":"t1","nodeId":"n1"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::ChainShowEditor { track_id, node_id } => {
                assert_eq!(track_id, "t1");
                assert_eq!(node_id, "n1");
            }
            _ => panic!("expected chain.showEditor"),
        }
    }

    #[test]
    fn parses_system_set_autostart() {
        let raw = r#"{"kind":"request","id":"a","command":{"type":"system.setAutostart","enabled":true}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::SystemSetAutostart { enabled } => assert!(enabled),
            _ => panic!("expected system.setAutostart"),
        }
    }

    #[test]
    fn parses_session_verify() {
        let raw = r#"{"kind":"request","id":"sv","command":{"type":"session.verify","ticket":"abc.def.ghi"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        match command {
            Command::SessionVerify { ticket } => assert_eq!(ticket, "abc.def.ghi"),
            _ => panic!("expected session.verify"),
        }
    }

    #[test]
    fn parses_update_check_and_apply() {
        let raw = r#"{"kind":"request","id":"u","command":{"type":"update.check"}}"#;
        let msg: Message = serde_json::from_str(raw).unwrap();
        let Message::Request { command, .. } = msg;
        assert!(matches!(command, Command::UpdateCheck));

        let raw2 = r#"{"kind":"request","id":"u2","command":{"type":"update.apply"}}"#;
        let msg2: Message = serde_json::from_str(raw2).unwrap();
        let Message::Request { command, .. } = msg2;
        assert!(matches!(command, Command::UpdateApply));
    }

    #[test]
    fn handshake_result_with_update_includes_fields() {
        let info = UpdateInfoSnapshot {
            current_version: "0.1.0".into(),
            latest_version: "0.2.0".into(),
            release_url: "https://example.test/v0.2.0".into(),
            release_notes: "what's new".into(),
            download_url: "https://example.test/d.zip".into(),
        };
        let v = handshake_result_with_update(Some(&info));
        assert_eq!(v["updateAvailable"], true);
        assert_eq!(v["latestVersion"], "0.2.0");
        assert_eq!(v["releaseUrl"], "https://example.test/v0.2.0");
        assert_eq!(v["releaseNotes"], "what's new");
        let none = handshake_result_with_update(None);
        assert_eq!(none["updateAvailable"], false);
        assert!(none.get("latestVersion").is_none());
    }

    #[test]
    fn parses_project_with_buses_and_master() {
        let raw = r#"{
            "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
            "tracks":[
                {"id":"t1","name":"Lead","clips":[],
                 "inserts":[{"id":"i1","kind":"insert","plugin":{"format":"builtin","uid":"gain","name":"Gain"},"params":{"gainDb":-6.0}}],
                 "sends":[{"id":"s1","destBusId":"bus1","level":0.5,"pre":false}]
                }
            ],
            "buses":[
                {"id":"bus1","name":"Reverb","inserts":[],"sends":[],"volumeDb":0.0,"pan":0.0}
            ],
            "master":{"inserts":[],"volumeDb":-3.0}
        }"#;
        let p: Project = serde_json::from_str(raw).unwrap();
        assert_eq!(p.tracks[0].inserts.len(), 1);
        assert_eq!(p.tracks[0].sends.len(), 1);
        assert_eq!(p.buses.len(), 1);
        assert_eq!(p.master.volume_db, -3.0);
    }
}
