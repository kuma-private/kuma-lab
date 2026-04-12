use bridge_protocol::{handshake_result_with_update, Command, Event, Message, Outgoing};
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
        Command::Handshake { version: _ } => {
            let info = state.update_info();
            HandleResult::just(Outgoing::ok(id, handshake_result_with_update(info.as_ref())))
        }
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
        Command::ChainShowEditor { track_id, node_id } => {
            match state.chain_show_editor(&track_id, &node_id) {
                Ok(()) => HandleResult::just(Outgoing::ok(
                    id,
                    json!({ "trackId": track_id, "nodeId": node_id, "visible": true }),
                )),
                Err(e) => HandleResult::just(Outgoing::err(id, "editor_error", &e.to_string())),
            }
        }
        Command::ChainHideEditor { track_id, node_id } => {
            match state.chain_hide_editor(&track_id, &node_id) {
                Ok(()) => {
                    // Placeholder editors don't emit their own close
                    // event (no OS window to listen to). Emit one
                    // synchronously so the frontend's optimistic open
                    // state resets.
                    let closed = Outgoing::event(Event::EditorClosed {
                        track_id: track_id.clone(),
                        node_id: node_id.clone(),
                    });
                    HandleResult {
                        response: Outgoing::ok(
                            id,
                            json!({ "trackId": track_id, "nodeId": node_id, "visible": false }),
                        ),
                        events: vec![closed],
                    }
                }
                Err(e) => HandleResult::just(Outgoing::err(id, "editor_error", &e.to_string())),
            }
        }
        Command::SystemSetAutostart { enabled } => match state.system_set_autostart(enabled) {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "enabled": enabled }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "autostart_error", &e.to_string())),
        },
        Command::SystemGetAutostart => match state.system_get_autostart() {
            Ok(enabled) => HandleResult::just(Outgoing::ok(id, json!({ "enabled": enabled }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "autostart_error", &e.to_string())),
        },
        Command::UpdateCheck => match state.update_check_sync() {
            Ok(found) => {
                let info = state.update_info();
                HandleResult::just(Outgoing::ok(
                    id,
                    json!({
                        "updateAvailable": found,
                        "info": info,
                    }),
                ))
            }
            Err(e) => HandleResult::just(Outgoing::err(id, "update_error", &e.to_string())),
        },
        Command::UpdateApply => match state.update_apply() {
            Ok(()) => HandleResult::just(Outgoing::ok(id, json!({ "ok": true }))),
            Err(e) => HandleResult::just(Outgoing::err(id, "update_error", &e.to_string())),
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
    fn chain_show_hide_editor_toggles_count() {
        let state = SessionState::new();
        // Load a project with one track + one insert.
        let load = r#"{"kind":"request","id":"p","command":{"type":"project.load","project":{
            "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
            "tracks":[{"id":"t1","name":"Lead","clips":[],
                "inserts":[{"id":"n1","kind":"insert","plugin":{"format":"builtin","uid":"gain","name":"Gain"}}]
            }]
        }}}"#;
        let _ = handle_text(&state, load);

        // Show editor.
        let r = handle_text(
            &state,
            r#"{"kind":"request","id":"e1","command":{"type":"chain.showEditor","trackId":"t1","nodeId":"n1"}}"#,
        );
        let v = serde_json::to_value(&r.response).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["result"]["visible"], true);
        assert_eq!(state.editor_count(), 1);

        // Hide editor — should emit editor.closed event.
        let r = handle_text(
            &state,
            r#"{"kind":"request","id":"e2","command":{"type":"chain.hideEditor","trackId":"t1","nodeId":"n1"}}"#,
        );
        let v = serde_json::to_value(&r.response).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["result"]["visible"], false);
        assert_eq!(state.editor_count(), 0);
        assert_eq!(r.events.len(), 1);
        let ev = serde_json::to_value(&r.events[0]).unwrap();
        assert_eq!(ev["event"]["type"], "editor.closed");
    }

    #[test]
    fn chain_show_editor_unknown_node_errors() {
        let state = SessionState::new();
        let load = r#"{"kind":"request","id":"p","command":{"type":"project.load","project":{
            "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
            "tracks":[{"id":"t1","name":"Lead","clips":[]}]
        }}}"#;
        let _ = handle_text(&state, load);
        let r = handle_text(
            &state,
            r#"{"kind":"request","id":"e","command":{"type":"chain.showEditor","trackId":"t1","nodeId":"nope"}}"#,
        );
        let v = serde_json::to_value(&r.response).unwrap();
        assert_eq!(v["ok"], false);
        assert_eq!(v["error"]["code"], "editor_error");
    }

    #[test]
    fn update_check_returns_cached_state() {
        let state = SessionState::new();
        // No update → false.
        let r = handle_text(
            &state,
            r#"{"kind":"request","id":"u1","command":{"type":"update.check"}}"#,
        );
        let v = serde_json::to_value(&r.response).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["result"]["updateAvailable"], false);

        // Seed an update in the bridge state → handshake should surface it.
        let info = bridge_protocol::UpdateInfoSnapshot {
            current_version: "0.1.0".into(),
            latest_version: "0.2.0".into(),
            release_url: "https://example.test/r".into(),
            release_notes: "notes".into(),
            download_url: "https://example.test/d.zip".into(),
        };
        state.bridge_state().set_update_info(Some(info));

        let r = handle_text(
            &state,
            r#"{"kind":"request","id":"u2","command":{"type":"update.check"}}"#,
        );
        let v = serde_json::to_value(&r.response).unwrap();
        assert_eq!(v["result"]["updateAvailable"], true);

        // Handshake should now include latestVersion/releaseUrl.
        let h = handle_text(
            &state,
            r#"{"kind":"request","id":"h","command":{"type":"handshake","version":"0.1"}}"#,
        );
        let v = serde_json::to_value(&h.response).unwrap();
        assert_eq!(v["result"]["updateAvailable"], true);
        assert_eq!(v["result"]["latestVersion"], "0.2.0");
        assert_eq!(v["result"]["releaseUrl"], "https://example.test/r");
    }

    #[test]
    fn update_apply_without_info_errors() {
        let state = SessionState::new();
        let r = handle_text(
            &state,
            r#"{"kind":"request","id":"ua","command":{"type":"update.apply"}}"#,
        );
        let v = serde_json::to_value(&r.response).unwrap();
        assert_eq!(v["ok"], false);
        assert_eq!(v["error"]["code"], "update_error");
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
