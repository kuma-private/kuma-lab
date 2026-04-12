pub mod autostart;
pub mod bridge_state;
pub mod handlers;
pub mod session;
pub mod update_poll;
pub mod ws_server;

pub use bridge_state::{BridgeState, Status as BridgeStatus};
pub use session::SessionState;
pub use ws_server::{run_ws_server, run_ws_server_with_state};

pub const DEFAULT_BIND_ADDR: &str = "127.0.0.1:7890";

pub fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,cadenza_bridge=debug,bridge_core=debug"));
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}
