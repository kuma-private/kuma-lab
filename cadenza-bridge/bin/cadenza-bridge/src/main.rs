use std::sync::Arc;
use std::thread;

use bridge_core::bridge_state::BridgeState;
use bridge_core::{init_tracing, run_ws_server_with_state, DEFAULT_BIND_ADDR};
use bridge_ui_tray::{run_tray_event_loop_with, DefaultTrayActions};
use tracing::{error, info};

fn main() -> anyhow::Result<()> {
    init_tracing();
    info!("cadenza-bridge starting");

    let bind = std::env::var("CADENZA_BRIDGE_BIND")
        .unwrap_or_else(|_| DEFAULT_BIND_ADDR.to_string());

    // Shared cross-thread state visible to both the WS server and the
    // tray's menu refresh loop.
    let bridge_state = BridgeState::new();
    let ws_state = bridge_state.clone();
    thread::Builder::new()
        .name("bridge-tokio".into())
        .spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("build tokio runtime");
            rt.block_on(async move {
                if let Err(e) = run_ws_server_with_state(&bind, ws_state).await {
                    error!("ws server error: {e}");
                }
            });
        })?;

    // Headless mode for CI / tests: skip the tray event loop (which requires
    // a GUI session) and just park the main thread so the process keeps
    // running while the tokio thread serves connections.
    if std::env::var_os("CADENZA_BRIDGE_HEADLESS").is_some() {
        info!("headless mode: parking main thread");
        loop {
            thread::park();
        }
    }

    run_tray_event_loop_with(bridge_state, Arc::new(DefaultTrayActions))?;
    Ok(())
}
