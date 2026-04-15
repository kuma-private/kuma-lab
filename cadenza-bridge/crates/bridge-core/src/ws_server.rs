use std::time::Duration;

use anyhow::{Context, Result};
use bridge_audio::TelemetryEvent;
use bridge_protocol::{Event, Outgoing};
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tracing::{error, info, warn};

use crate::bridge_state::{BridgeState, Status};
use crate::handlers::handle_text;
use crate::session::SessionState;
use crate::update_poll;

const TELEMETRY_TICK: Duration = Duration::from_millis(33); // ~30 Hz

pub async fn run_ws_server(bind_addr: &str) -> Result<()> {
    let bridge_state = BridgeState::new();
    run_ws_server_with_state(bind_addr, bridge_state).await
}

pub async fn run_ws_server_with_state(
    bind_addr: &str,
    bridge_state: BridgeState,
) -> Result<()> {
    bridge_state.set_status(Status::Starting);
    let listener = TcpListener::bind(bind_addr).await.with_context(|| {
        bridge_state.set_status(Status::Error);
        format!("bind {bind_addr}")
    })?;
    info!("bridge WS listening on {bind_addr}");
    bridge_state.set_status(Status::Listening);

    // Fire-and-forget background poll task. Held on to via the join
    // handle so tests that shut down the listener can abort it.
    let _poll = update_poll::spawn_poller(bridge_state.clone());

    let state = SessionState::with_bridge_state(bridge_state.clone());

    loop {
        let (stream, peer) = listener.accept().await.context("accept")?;
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(state, stream, peer.to_string()).await {
                warn!("connection {peer} ended: {e}");
            }
        });
    }
}

async fn handle_connection(state: SessionState, stream: TcpStream, peer: String) -> Result<()> {
    // Cap inbound frame / message size so a hostile or buggy client cannot
    // OOM the bridge with a multi-GB project.patch payload. 16 MB is well
    // above any realistic Cadenza song state and matches the default ASP.NET
    // request limit on the F# side.
    let mut config = WebSocketConfig::default();
    config.max_message_size = Some(16 * 1024 * 1024);
    config.max_frame_size = Some(16 * 1024 * 1024);
    let ws = tokio_tungstenite::accept_async_with_config(stream, Some(config))
        .await
        .context("ws handshake")?;
    info!("ws client connected: {peer}");

    let (mut ws_tx, mut ws_rx) = ws.split();

    // Single mpsc for everything the connection task wants to flush back
    // to the client (responses, events from handlers, telemetry events).
    let (out_tx, mut out_rx) = mpsc::channel::<Outgoing>(256);

    // Telemetry drain task: poll the rtrb consumer at ~30 Hz and forward
    // each TelemetryEvent as a protocol Event into out_tx.
    let telemetry = state.telemetry();
    let tel_tx = out_tx.clone();
    let telemetry_task = tokio::spawn(async move {
        let mut buf: Vec<TelemetryEvent> = Vec::with_capacity(64);
        loop {
            tokio::time::sleep(TELEMETRY_TICK).await;
            buf.clear();
            telemetry.try_recv_batch(64, &mut buf);
            for ev in buf.drain(..) {
                let outgoing = match ev {
                    TelemetryEvent::Position { tick, seconds } => {
                        Outgoing::event(Event::TransportPosition { tick, seconds })
                    }
                    TelemetryEvent::StateChange { playing } => {
                        Outgoing::event(Event::TransportState {
                            state: if playing { "playing".into() } else { "stopped".into() },
                        })
                    }
                    TelemetryEvent::Xrun => continue,
                };
                if tel_tx.send(outgoing).await.is_err() {
                    return;
                }
            }
        }
    });

    // Reader task: pull WS frames, dispatch to handlers, forward response +
    // any extra events into out_tx.
    let reader_state = state.clone();
    let reader_tx = out_tx.clone();
    let reader_peer = peer.clone();
    let reader_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(e) => {
                    error!("recv error from {reader_peer}: {e}");
                    break;
                }
            };
            match msg {
                WsMessage::Text(text) => {
                    let res = handle_text(&reader_state, &text);
                    if reader_tx.send(res.response).await.is_err() {
                        break;
                    }
                    for ev in res.events {
                        if reader_tx.send(ev).await.is_err() {
                            return;
                        }
                    }
                }
                WsMessage::Close(_) => {
                    info!("ws client closed: {reader_peer}");
                    break;
                }
                WsMessage::Ping(_) => {
                    // Pings are auto-handled by tungstenite when using
                    // `accept_async` with default config; nothing to do.
                }
                _ => {}
            }
        }
    });

    // Writer loop: drain out_rx and write to the WS sink.
    while let Some(out) = out_rx.recv().await {
        let body = serde_json::to_string(&out).context("serialize outgoing")?;
        if ws_tx.send(WsMessage::Text(body)).await.is_err() {
            break;
        }
    }

    telemetry_task.abort();
    reader_task.abort();
    Ok(())
}
