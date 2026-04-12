use std::thread;

use bridge_core::{init_tracing, run_ws_server, DEFAULT_BIND_ADDR};
use bridge_ui_tray::run_tray_event_loop;
use tracing::{error, info};

fn main() -> anyhow::Result<()> {
    init_tracing();
    info!("cadenza-bridge starting");

    thread::Builder::new()
        .name("bridge-tokio".into())
        .spawn(|| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("build tokio runtime");
            rt.block_on(async {
                if let Err(e) = run_ws_server(DEFAULT_BIND_ADDR).await {
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

    run_tray_event_loop()?;
    Ok(())
}
