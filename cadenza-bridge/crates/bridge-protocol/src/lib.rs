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
}

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
}

pub fn handshake_result() -> serde_json::Value {
    serde_json::json!({
        "bridgeVersion": BRIDGE_VERSION,
        "capabilities": ["audio", "debug"],
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
}
