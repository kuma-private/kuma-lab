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

#[tokio::test]
async fn phase0_handshake_and_debug_sine() {
    let child = Command::new(bin_path())
        .env("CADENZA_BRIDGE_HEADLESS", "1")
        .env("RUST_LOG", "info")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn cadenza-bridge");
    let _guard = ChildGuard(child);

    wait_for_port("127.0.0.1:7890").await;

    let (mut ws, _) = connect_async("ws://127.0.0.1:7890")
        .await
        .expect("connect ws");

    // --- handshake ---
    let req = r#"{"kind":"request","id":"1","command":{"type":"handshake","version":"0.1"}}"#;
    ws.send(WsMessage::Text(req.into())).await.unwrap();

    let resp = ws.next().await.expect("resp").expect("ws ok");
    let text = match resp {
        WsMessage::Text(t) => t,
        other => panic!("unexpected frame: {other:?}"),
    };
    let v: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(v["id"], "1");
    assert_eq!(v["ok"], true);
    assert_eq!(v["result"]["bridgeVersion"], "0.1.0");
    assert!(v["result"]["capabilities"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c == "audio"));

    // --- debug.sine on ---
    // Note: the CI runner may have no audio device; we still expect a
    // well-formed response. If the device is unavailable the server will
    // return ok:false with an audio_error, which is still a valid envelope.
    let on_req = r#"{"kind":"request","id":"2","command":{"type":"debug.sine","on":true}}"#;
    ws.send(WsMessage::Text(on_req.into())).await.unwrap();
    let resp = ws.next().await.expect("resp").expect("ws ok");
    let text = match resp {
        WsMessage::Text(t) => t,
        other => panic!("unexpected frame: {other:?}"),
    };
    let v: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(v["id"], "2");
    assert!(v["ok"].is_boolean());

    // --- debug.sine off ---
    let off_req = r#"{"kind":"request","id":"3","command":{"type":"debug.sine","on":false}}"#;
    ws.send(WsMessage::Text(off_req.into())).await.unwrap();
    let resp = ws.next().await.expect("resp").expect("ws ok");
    let text = match resp {
        WsMessage::Text(t) => t,
        other => panic!("unexpected frame: {other:?}"),
    };
    let v: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(v["id"], "3");

    let _ = ws.close(None).await;
}
