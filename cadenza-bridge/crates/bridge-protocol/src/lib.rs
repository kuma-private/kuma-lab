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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonPatchOp {
    pub op: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
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
    serde_json::json!({
        "bridgeVersion": BRIDGE_VERSION,
        "capabilities": ["audio", "debug", "plugins", "transport", "project"],
        "updateAvailable": false,
    })
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
}
