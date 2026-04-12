use bridge_protocol::{handshake_result, Command, Event, Message, Outgoing};
use serde_json::json;
use tracing::{debug, error};

use crate::session::SessionState;

/// Result of dispatching one incoming text frame: a synchronous response
/// envelope plus optional follow-up events the connection task should also
/// flush back to the client.
pub struct HandleResult {
    pub response: Outgoing,
    pub events: Vec<Outgoing>,
}

impl HandleResult {
    fn just(response: Outgoing) -> Self {
        Self {
            response,
            events: Vec::new(),
        }
    }
}

pub fn handle_text(state: &SessionState, raw: &str) -> HandleResult {
    let msg: Message = match serde_json::from_str(raw) {
        Ok(m) => m,
        Err(e) => {
            error!("parse error: {e}");
            return HandleResult::just(Outgoing::err("", "parse_error", &e.to_string()));
        }
    };

    match msg {
        Message::Request { id, command } => dispatch(state, id, command),
    }
}

fn dispatch(state: &SessionState, id: String, command: Command) -> HandleResult {
    debug!("dispatch id={id} command={command:?}");
    match command {
        Command::Handshake { version: _ } => HandleResult::just(Outgoing::ok(id, handshake_result())),
        Command::DebugSine { on } => match state.set_sine(on) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "on": on }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "audio_error", &e.to_string())),
        },
        Command::PluginsScan => {
            let count = state.plugins_scan() as u32;
            HandleResult {
                response: Outgoing::ok(id, json!({ "count": count })),
                events: vec![Outgoing::event(Event::PluginScanComplete { count })],
            }
        }
        Command::PluginsList => {
            let plugins = state.plugins_list();
            HandleResult::just(Outgoing::ok(id, json!({ "plugins": plugins })))
        }
        Command::ProjectLoad { project } => match state.project_load(&project) {
            Ok(()) => HandleResult::just(Outgoing::ok(
                id,
                json!({ "tracks": project.tracks.len() }),
            )),
            Err(e) => HandleResult::just(Outgoing::err(id, "project_error", &e.to_string())),
        },
        Command::ProjectPatch { ops } => match state.project_patch(&ops) {
            Ok(applied) => HandleResult::just(Outgoing::ok(id, json!({ "applied": applied }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "patch_error", &e.to_string())),
        },
        Command::ProjectHash => match state.project_hash() {
            Ok(h) => HandleResult::just(Outgoing::ok(id, json!({ "hash": h }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "project_error", &e.to_string())),
        },
        Command::ChainAddNode {
            track_id,
            position,
            plugin,
        } => match state.chain_add_node(&track_id, position, &plugin) {
            Ok(node_id) => HandleResult::just(Outgoing::ok(id, json!({ "nodeId": node_id }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "chain_error", &e.to_string())),
        },
        Command::ChainRemoveNode { track_id, node_id } => {
            match state.chain_remove_node(&track_id, &node_id) {
                Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
                Err(e) => HandleResult::just(Outgoing::err(id, "chain_error", &e.to_string())),
            }
        }
        Command::ChainSetParam {
            track_id,
            node_id,
            param_id,
            value,
        } => match state.chain_set_param(&track_id, &node_id, &param_id, value) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "chain_error", &e.to_string())),
        },
        Command::RenderWav {
            from_tick,
            to_tick,
            sample_rate,
            bit_depth,
            path,
        } => match state.render_wav(from_tick, to_tick, sample_rate, bit_depth, &path) {
            Ok(res) => HandleResult::just(Outgoing::ok(
                id,
                json!({
                    "path": res.path.to_string_lossy(),
                    "frames": res.frames,
                    "sampleRate": res.sample_rate,
                    "bitDepth": res.bit_depth,
                }),
            )),
            Err(e) => HandleResult::just(Outgoing::err(id, "render_error", &e.to_string())),
        },
        Command::TransportPlay { from_tick } => match state.transport_play(from_tick) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "transport_error", &e.to_string())),
        },
        Command::TransportStop => match state.transport_stop() {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "transport_error", &e.to_string())),
        },
        Command::TransportSeek { tick } => match state.transport_seek(tick) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "tick": tick }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "transport_error", &e.to_string())),
        },
        Command::MidiNoteOn {
            track_id,
            pitch,
            velocity,
        } => match state.midi_note_on(&track_id, pitch, velocity) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "midi_error", &e.to_string())),
        },
        Command::MidiNoteOff { track_id, pitch } => match state.midi_note_off(&track_id, pitch) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "midi_error", &e.to_string())),
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
        let out = handle_text(&state, raw).response;
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["id"], "h1");
        assert_eq!(json["ok"], true);
        assert_eq!(json["result"]["bridgeVersion"], "0.1.0");
        assert_eq!(json["result"]["capabilities"][0], "audio");
    }

    #[test]
    fn parse_error_returns_err() {
        let state = SessionState::new();
        let out = handle_text(&state, "not json").response;
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["ok"], false);
        assert_eq!(json["error"]["code"], "parse_error");
    }

    #[test]
    fn plugins_scan_emits_event() {
        let state = SessionState::new();
        let raw = r#"{"kind":"request","id":"s1","command":{"type":"plugins.scan"}}"#;
        let r = handle_text(&state, raw);
        let resp = serde_json::to_value(&r.response).unwrap();
        assert_eq!(resp["ok"], true);
        assert_eq!(r.events.len(), 1);
    }

    #[test]
    fn project_load_then_play_then_stop() {
        let state = SessionState::new();
        let raw = r#"{"kind":"request","id":"p","command":{"type":"project.load","project":{
            "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
            "tracks":[{"id":"t1","name":"Lead","clips":[]}]
        }}}"#;
        let _ = handle_text(&state, raw);
        let play = handle_text(
            &state,
            r#"{"kind":"request","id":"x","command":{"type":"transport.play"}}"#,
        );
        let v = serde_json::to_value(&play.response).unwrap();
        // ok=true if there is a default audio device, ok=false (transport_error)
        // if there isn't. Either way the envelope must be well-formed.
        assert!(v["ok"].is_boolean());

        let stop = handle_text(
            &state,
            r#"{"kind":"request","id":"y","command":{"type":"transport.stop"}}"#,
        );
        let v = serde_json::to_value(&stop.response).unwrap();
        assert!(v["ok"].is_boolean());
    }
}
