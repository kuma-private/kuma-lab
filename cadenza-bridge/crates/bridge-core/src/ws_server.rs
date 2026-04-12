use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{error, info, warn};

use crate::handlers::handle_text;
use crate::session::SessionState;

pub async fn run_ws_server(bind_addr: &str) -> Result<()> {
    let listener = TcpListener::bind(bind_addr)
        .await
        .with_context(|| format!("bind {bind_addr}"))?;
    info!("bridge WS listening on {bind_addr}");

    let state = SessionState::new();

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
    let ws = tokio_tungstenite::accept_async(stream)
        .await
        .context("ws handshake")?;
    info!("ws client connected: {peer}");

    let (mut tx, mut rx) = ws.split();

    while let Some(msg) = rx.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                error!("recv error from {peer}: {e}");
                break;
            }
        };

        match msg {
            WsMessage::Text(text) => {
                let out = handle_text(&state, &text);
                let body = serde_json::to_string(&out).context("serialize outgoing")?;
                tx.send(WsMessage::Text(body)).await.context("ws send")?;
            }
            WsMessage::Close(_) => {
                info!("ws client closed: {peer}");
                break;
            }
            WsMessage::Ping(p) => {
                tx.send(WsMessage::Pong(p)).await.ok();
            }
            _ => {}
        }
    }

    Ok(())
}
