//! Phase 8 integration test: premium entitlement gating.
//!
//! Spawns the `cadenza-bridge` binary with a controlled
//! `CADENZA_BACKEND_URL` pointing at a tiny in-process HTTP server
//! that fakes the `/api/bridge/verify-ticket` endpoint. Drives the
//! binary over WebSocket to verify:
//!
//! 1. Without a session.verify call, chain.addNode for format=vst3
//!    returns `premium_required`.
//! 2. After session.verify succeeds with a "premium" ticket,
//!    chain.addNode for format=vst3 is accepted (the graph may fall
//!    back to SilentVst3Instrument, which is fine — the point is the
//!    handler no longer rejects the command).
//! 3. render.wav is also gated without verification.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

// ── ChildGuard for bridge process ───────────────────────────────

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

// ── Tiny mock HTTP server ───────────────────────────────────────
//
// Serves a single endpoint: POST /api/bridge/verify-ticket. The reply
// depends on the contents of the ticket field:
//   - ticket == "premium" → returns valid=true with premium entitlements
//   - ticket == "free"    → returns valid=true with free entitlements
//   - anything else       → returns valid=false

struct MockBackend {
    addr: String,
    _handle: thread::JoinHandle<()>,
}

fn spawn_mock_backend() -> MockBackend {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock backend");
    let addr = listener.local_addr().unwrap().to_string();
    let handle = thread::spawn(move || {
        // Accept a bounded number of connections so the thread exits
        // when the test is done (the bridge closes on drop).
        for _ in 0..32 {
            let (mut stream, _) = match listener.accept() {
                Ok(s) => s,
                Err(_) => break,
            };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            handle_one_request(&mut stream);
        }
    });
    MockBackend {
        addr,
        _handle: handle,
    }
}

fn handle_one_request(stream: &mut TcpStream) {
    let mut buf = vec![0u8; 8192];
    let mut total = 0;
    // Read until we see the end of headers (CRLF CRLF), then the body
    // of whatever Content-Length says.
    let body_start;
    loop {
        let n = match stream.read(&mut buf[total..]) {
            Ok(n) if n > 0 => n,
            _ => return,
        };
        total += n;
        if let Some(idx) = find_crlfcrlf(&buf[..total]) {
            body_start = idx + 4;
            break;
        }
        if total >= buf.len() {
            return;
        }
    }
    let headers = std::str::from_utf8(&buf[..body_start]).unwrap_or("");
    let content_length = parse_content_length(headers).unwrap_or(0);
    // Read rest of body if needed.
    while total - body_start < content_length {
        let n = match stream.read(&mut buf[total..]) {
            Ok(n) if n > 0 => n,
            _ => break,
        };
        total += n;
        if total >= buf.len() {
            break;
        }
    }
    let body_end = (body_start + content_length).min(total);
    let body = std::str::from_utf8(&buf[body_start..body_end]).unwrap_or("");
    // Dispatch on ticket field in the JSON body.
    let response_json = if body.contains("\"ticket\":\"premium\"") {
        r#"{"valid":true,"userId":"u1","tier":"premium","entitlements":{"bridgeAccess":true,"vstHosting":true,"clapHosting":true,"wavHighQualityExport":true,"automation":true,"mixerNlEdit":true,"builtinSynths":true}}"#
    } else if body.contains("\"ticket\":\"free\"") {
        r#"{"valid":true,"userId":"u1","tier":"free","entitlements":{"bridgeAccess":false,"vstHosting":false,"clapHosting":false,"wavHighQualityExport":false,"automation":false,"mixerNlEdit":false,"builtinSynths":true}}"#
    } else {
        r#"{"valid":false,"reason":"invalid ticket"}"#
    };
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response_json.len(),
        response_json
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn find_crlfcrlf(buf: &[u8]) -> Option<usize> {
    for i in 0..buf.len().saturating_sub(3) {
        if &buf[i..i + 4] == b"\r\n\r\n" {
            return Some(i);
        }
    }
    None
}

fn parse_content_length(headers: &str) -> Option<usize> {
    for line in headers.lines() {
        if let Some(rest) = line
            .strip_prefix("Content-Length: ")
            .or_else(|| line.strip_prefix("content-length: "))
        {
            return rest.trim().parse().ok();
        }
    }
    None
}

// ── WS helpers ────────────────────────────────────────────────

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

async fn next_text(ws: &mut Ws) -> serde_json::Value {
    let msg = ws.next().await.expect("resp").expect("ws ok");
    let text = match msg {
        WsMessage::Text(t) => t,
        other => panic!("unexpected frame: {other:?}"),
    };
    serde_json::from_str(&text).unwrap()
}

async fn read_response(ws: &mut Ws, id: &str) -> serde_json::Value {
    for _ in 0..30 {
        let v = next_text(ws).await;
        if v.get("id").and_then(|s| s.as_str()) == Some(id) {
            return v;
        }
    }
    panic!("never received response for id={id}");
}

async fn send_text(ws: &mut Ws, raw: &str) {
    ws.send(WsMessage::Text(raw.into())).await.unwrap();
}

// ── The test ─────────────────────────────────────────────────

#[tokio::test]
async fn phase8_premium_gating_and_session_verify() {
    let mock = spawn_mock_backend();
    let backend_url = format!("http://{}", mock.addr);

    let bind = "127.0.0.1:7898";
    let child = Command::new(bin_path())
        .env("CADENZA_BRIDGE_HEADLESS", "1")
        .env("CADENZA_BRIDGE_BIND", bind)
        .env("CADENZA_BACKEND_URL", &backend_url)
        .env("RUST_LOG", "info")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn cadenza-bridge");
    let _guard = ChildGuard(child);

    wait_for_port(bind).await;

    let (mut ws, _) = connect_async(format!("ws://{bind}"))
        .await
        .expect("connect ws");

    // ── handshake ──
    send_text(
        &mut ws,
        r#"{"kind":"request","id":"h","command":{"type":"handshake","version":"0.1"}}"#,
    )
    .await;
    let v = read_response(&mut ws, "h").await;
    assert_eq!(v["ok"], true);

    // ── project.load (minimal) ──
    let load = r#"{"kind":"request","id":"p","command":{"type":"project.load","project":{
        "version":"1","bpm":120,"timeSignature":[4,4],"sampleRate":48000,
        "tracks":[{"id":"t1","name":"Lead","clips":[]}]
    }}}"#;
    send_text(&mut ws, load).await;
    let v = read_response(&mut ws, "p").await;
    assert_eq!(v["ok"], true);

    // ── 1. chain.addNode with format=vst3 BEFORE verify → premium_required ──
    let add_vst3 = r#"{"kind":"request","id":"a1","command":{"type":"chain.addNode",
        "trackId":"t1","position":0,
        "plugin":{"format":"vst3","uid":"/some/plugin.vst3","name":"X"}}}"#;
    send_text(&mut ws, add_vst3).await;
    let v = read_response(&mut ws, "a1").await;
    assert_eq!(v["ok"], false, "expected premium_required, got {v}");
    assert_eq!(v["error"]["code"], "premium_required");

    // ── 2. chain.addNode with format=builtin BEFORE verify → ok ──
    let add_builtin = r#"{"kind":"request","id":"a2","command":{"type":"chain.addNode",
        "trackId":"t1","position":0,
        "plugin":{"format":"builtin","uid":"gain","name":"Gain"}}}"#;
    send_text(&mut ws, add_builtin).await;
    let v = read_response(&mut ws, "a2").await;
    assert_eq!(v["ok"], true, "builtin must be allowed for free users");

    // ── 3. render.wav BEFORE verify → premium_required ──
    let render = r#"{"kind":"request","id":"r1","command":{"type":"render.wav",
        "fromTick":0,"toTick":480,"path":"/tmp/cadenza-phase8-gate.wav"}}"#;
    send_text(&mut ws, render).await;
    let v = read_response(&mut ws, "r1").await;
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "premium_required");

    // ── 4. session.verify with premium ticket ──
    let verify = r#"{"kind":"request","id":"v1","command":{"type":"session.verify","ticket":"premium"}}"#;
    send_text(&mut ws, verify).await;
    let v = read_response(&mut ws, "v1").await;
    assert_eq!(v["ok"], true, "verify should succeed, got {v}");
    assert_eq!(v["result"]["valid"], true);
    assert_eq!(v["result"]["tier"], "premium");
    assert_eq!(v["result"]["entitlements"]["vstHosting"], true);

    // ── 5. chain.addNode with format=vst3 AFTER verify → ok ──
    let add_vst3_ok = r#"{"kind":"request","id":"a3","command":{"type":"chain.addNode",
        "trackId":"t1","position":0,
        "plugin":{"format":"vst3","uid":"/some/plugin.vst3","name":"X"}}}"#;
    send_text(&mut ws, add_vst3_ok).await;
    let v = read_response(&mut ws, "a3").await;
    assert_eq!(v["ok"], true, "vst3 add should be allowed after verify, got {v}");

    // ── 6. session.verify with "free" ticket demotes the session ──
    let verify_free = r#"{"kind":"request","id":"v2","command":{"type":"session.verify","ticket":"free"}}"#;
    send_text(&mut ws, verify_free).await;
    let v = read_response(&mut ws, "v2").await;
    assert_eq!(v["ok"], true);
    assert_eq!(v["result"]["tier"], "free");

    // ── 7. chain.addNode vst3 is blocked again ──
    let add_blocked = r#"{"kind":"request","id":"a4","command":{"type":"chain.addNode",
        "trackId":"t1","position":0,
        "plugin":{"format":"vst3","uid":"/other.vst3","name":"Y"}}}"#;
    send_text(&mut ws, add_blocked).await;
    let v = read_response(&mut ws, "a4").await;
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "premium_required");

    // ── 8. session.verify with invalid ticket → verify_failed ──
    let verify_bad = r#"{"kind":"request","id":"v3","command":{"type":"session.verify","ticket":"bogus"}}"#;
    send_text(&mut ws, verify_bad).await;
    let v = read_response(&mut ws, "v3").await;
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "verify_failed");

    let _ = ws.close(None).await;
}
