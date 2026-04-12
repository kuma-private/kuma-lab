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

async fn next_text(
    ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> serde_json::Value {
    let resp = ws.next().await.expect("resp").expect("ws ok");
    let text = match resp {
        WsMessage::Text(t) => t,
        other => panic!("unexpected frame: {other:?}"),
    };
    serde_json::from_str(&text).expect("json")
}

async fn next_response_with_id(
    ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    id: &str,
) -> serde_json::Value {
    // Skip events with no `id` field; return the first response matching id.
    for _ in 0..20 {
        let v = next_text(ws).await;
        if v.get("id").and_then(|s| s.as_str()) == Some(id) {
            return v;
        }
        // otherwise it's an event — keep draining
    }
    panic!("no response with id={id}");
}

#[tokio::test]
async fn phase2_plugins_project_transport() {
    let bind = "127.0.0.1:7891";
    let child = Command::new(bin_path())
        .env("CADENZA_BRIDGE_HEADLESS", "1")
        .env("CADENZA_BRIDGE_BIND", bind)
        .env("RUST_LOG", "info")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn cadenza-bridge");
    let _guard = ChildGuard(child);

    wait_for_port(bind).await;

    let url = format!("ws://{bind}");
    let (mut ws, _) = connect_async(url).await.expect("connect ws");

    // handshake
    ws.send(WsMessage::Text(
        r#"{"kind":"request","id":"1","command":{"type":"handshake","version":"0.1"}}"#.into(),
    ))
    .await
    .unwrap();
    let v = next_response_with_id(&mut ws, "1").await;
    assert_eq!(v["ok"], true);
    assert_eq!(v["result"]["bridgeVersion"], "0.1.0");

    // plugins.scan → expect ok response and a plugin.scan.complete event
    ws.send(WsMessage::Text(
        r#"{"kind":"request","id":"2","command":{"type":"plugins.scan"}}"#.into(),
    ))
    .await
    .unwrap();
    // Drain frames until we see both the response and an event of type plugin.scan.complete
    let mut saw_resp = false;
    let mut saw_event = false;
    for _ in 0..20 {
        let v = next_text(&mut ws).await;
        if v.get("id").and_then(|s| s.as_str()) == Some("2") {
            assert_eq!(v["ok"], true);
            saw_resp = true;
        }
        if v.get("kind").and_then(|s| s.as_str()) == Some("event")
            && v["event"]["type"] == "plugin.scan.complete"
        {
            saw_event = true;
        }
        if saw_resp && saw_event {
            break;
        }
    }
    assert!(saw_resp, "expected plugins.scan response");
    assert!(saw_event, "expected plugin.scan.complete event");

    // plugins.list — empty list is fine
    ws.send(WsMessage::Text(
        r#"{"kind":"request","id":"3","command":{"type":"plugins.list"}}"#.into(),
    ))
    .await
    .unwrap();
    let v = next_response_with_id(&mut ws, "3").await;
    assert_eq!(v["ok"], true);
    assert!(v["result"]["plugins"].is_array());

    // project.load with one track, no instrument
    let project = r#"{"kind":"request","id":"4","command":{"type":"project.load","project":{
        "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
        "tracks":[{"id":"t1","name":"Lead","clips":[{"id":"c1","startTick":0,"lengthTick":1920,"lengthTicks":1920,"notes":[{"pitch":60,"velocity":100,"startTick":0,"lengthTicks":480}]}]}]
    }}}"#;
    ws.send(WsMessage::Text(project.into())).await.unwrap();
    let v = next_response_with_id(&mut ws, "4").await;
    // Either ok=true (audio device available) or ok=false (no device on CI).
    // Both are well-formed envelopes.
    assert!(v["ok"].is_boolean());

    // transport.play — accept ok or transport_error
    ws.send(WsMessage::Text(
        r#"{"kind":"request","id":"5","command":{"type":"transport.play"}}"#.into(),
    ))
    .await
    .unwrap();
    let v = next_response_with_id(&mut ws, "5").await;
    assert!(v["ok"].is_boolean());

    // Wait briefly so transport.position events have a chance to flow.
    // We don't assert on their presence (CI may not have audio).
    tokio::time::sleep(Duration::from_millis(200)).await;

    // transport.stop
    ws.send(WsMessage::Text(
        r#"{"kind":"request","id":"6","command":{"type":"transport.stop"}}"#.into(),
    ))
    .await
    .unwrap();
    let v = next_response_with_id(&mut ws, "6").await;
    assert!(v["ok"].is_boolean());

    let _ = ws.close(None).await;
}
