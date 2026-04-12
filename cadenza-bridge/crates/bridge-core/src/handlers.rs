use bridge_protocol::{handshake_result, Command, Message, Outgoing};
use tracing::{debug, error};

use crate::session::SessionState;

pub fn handle_text(state: &SessionState, raw: &str) -> Outgoing {
    let msg: Message = match serde_json::from_str(raw) {
        Ok(m) => m,
        Err(e) => {
            error!("parse error: {e}");
            return Outgoing::err("", "parse_error", &e.to_string());
        }
    };

    match msg {
        Message::Request { id, command } => dispatch(state, id, command),
    }
}

fn dispatch(state: &SessionState, id: String, command: Command) -> Outgoing {
    debug!("dispatch id={id} command={command:?}");
    match command {
        Command::Handshake { version: _ } => Outgoing::ok(id, handshake_result()),
        Command::DebugSine { on } => match state.set_sine(on) {
            Ok(()) => Outgoing::ok(id, serde_json::json!({ "on": on })),
            Err(e) => Outgoing::err(id, "audio_error", &e.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_returns_ok() {
        let state = SessionState::new();
        let raw = r#"{"kind":"request","id":"h1","command":{"type":"handshake","version":"0.1"}}"#;
        let out = handle_text(&state, raw);
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["id"], "h1");
        assert_eq!(json["ok"], true);
        assert_eq!(json["result"]["bridgeVersion"], "0.1.0");
        assert_eq!(json["result"]["capabilities"][0], "audio");
    }

    #[test]
    fn parse_error_returns_err() {
        let state = SessionState::new();
        let out = handle_text(&state, "not json");
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["ok"], false);
        assert_eq!(json["error"]["code"], "parse_error");
    }
}
