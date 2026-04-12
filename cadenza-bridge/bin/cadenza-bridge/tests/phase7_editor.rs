//! Phase 7 integration test: drive chain.showEditor / chain.hideEditor
//! over a real WS connection against a spawned cadenza-bridge binary.
//! Also verifies that the handshake surfaces the capabilities list with
//! the new "editor" / "autostart" / "update" capabilities.

use std::process::{Command, Stdio};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

struct ChildGuard(std::process::Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn bin_path() -> &'static str {
    env!("CARGO_BIN_EXE_cadenza-bridge")
}

async fn wait_for_port(addr: &str) {
    for _ in 0..50 {
        if tokio::net::TcpStream::connect(addr).await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("bridge did not open {addr} in time");
}

async fn next_text<S>(ws: &mut S) -> serde_json::Value
where
    S: StreamExt<Item = Result<WsMessage, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let msg = ws.next().await.expect("resp").expect("ws ok");
    let text = match msg {
        WsMessage::Text(t) => t,
        other => panic!("unexpected frame: {other:?}"),
    };
    serde_json::from_str(&text).unwrap()
}

/// Skip the telemetry events that fire on transport state changes, etc.
/// Returns the first response/event whose `id` matches (for responses) or
/// whose `event.type` matches (for events).
async fn read_response<S>(ws: &mut S, id: &str) -> serde_json::Value
where
    S: StreamExt<Item = Result<WsMessage, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    for _ in 0..10 {
        let v = next_text(ws).await;
        if v["id"] == id {
            return v;
        }
    }
    panic!("never received response for id={id}");
}

#[tokio::test]
async fn phase7_handshake_capabilities_and_editor_flow() {
    let child = Command::new(bin_path())
        .env("CADENZA_BRIDGE_HEADLESS", "1")
        .env("RUST_LOG", "info")
        .env("CADENZA_BRIDGE_BIND", "127.0.0.1:7897")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn cadenza-bridge");
    let _guard = ChildGuard(child);

    wait_for_port("127.0.0.1:7897").await;

    let (mut ws, _) = connect_async("ws://127.0.0.1:7897")
        .await
        .expect("connect ws");

    // --- handshake: verify new capabilities ---
    let req = r#"{"kind":"request","id":"h","command":{"type":"handshake","version":"0.1"}}"#;
    ws.send(WsMessage::Text(req.into())).await.unwrap();
    let v = read_response(&mut ws, "h").await;
    assert_eq!(v["ok"], true);
    let caps: Vec<String> = v["result"]["capabilities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c.as_str().unwrap().to_string())
        .collect();
    assert!(caps.contains(&"editor".to_string()), "caps: {caps:?}");
    assert!(caps.contains(&"autostart".to_string()), "caps: {caps:?}");
    assert!(caps.contains(&"update".to_string()), "caps: {caps:?}");
    // No update in test env.
    assert_eq!(v["result"]["updateAvailable"], false);

    // --- project.load with one insert ---
    let load = r#"{"kind":"request","id":"p","command":{"type":"project.load","project":{
        "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
        "tracks":[{"id":"t1","name":"Lead","clips":[],
            "inserts":[{"id":"n1","kind":"insert","plugin":{"format":"builtin","uid":"gain","name":"Gain"}}]
        }]
    }}}"#;
    ws.send(WsMessage::Text(load.into())).await.unwrap();
    let v = read_response(&mut ws, "p").await;
    assert_eq!(v["ok"], true);

    // --- chain.showEditor ---
    let show = r#"{"kind":"request","id":"e1","command":{"type":"chain.showEditor","trackId":"t1","nodeId":"n1"}}"#;
    ws.send(WsMessage::Text(show.into())).await.unwrap();
    let v = read_response(&mut ws, "e1").await;
    assert_eq!(v["ok"], true);
    assert_eq!(v["result"]["visible"], true);

    // --- chain.hideEditor ---
    let hide = r#"{"kind":"request","id":"e2","command":{"type":"chain.hideEditor","trackId":"t1","nodeId":"n1"}}"#;
    ws.send(WsMessage::Text(hide.into())).await.unwrap();
    let v = read_response(&mut ws, "e2").await;
    assert_eq!(v["ok"], true);
    assert_eq!(v["result"]["visible"], false);

    // --- update.check returns ok with updateAvailable=false ---
    let check = r#"{"kind":"request","id":"u","command":{"type":"update.check"}}"#;
    ws.send(WsMessage::Text(check.into())).await.unwrap();
    let v = read_response(&mut ws, "u").await;
    assert_eq!(v["ok"], true);
    assert_eq!(v["result"]["updateAvailable"], false);

    let _ = ws.close(None).await;
}
