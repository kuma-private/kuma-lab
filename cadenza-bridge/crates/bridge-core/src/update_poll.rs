//! Background update-availability poller. Runs as a tokio task spawned
//! from `run_ws_server`. Every `POLL_INTERVAL` it asks bridge-updater
//! whether a newer release exists and, if so, writes the snapshot into
//! `BridgeState::update_available`. The next handshake the browser does
//! will surface the update via `handshake.ack`.

use std::time::Duration;

use tracing::{debug, info};

use crate::bridge_state::BridgeState;

/// 6 hours between checks. Picked to match the architecture doc which
/// says "Bridge polls every 6 hours via a tokio task".
pub const POLL_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// Spawn the background poll task and return a handle. The task loops
/// forever; callers hold the handle only so they can abort on shutdown.
pub fn spawn_poller(state: BridgeState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move { poll_loop(state).await })
}

async fn poll_loop(state: BridgeState) {
    let repo = bridge_updater::repo_from_env();
    if repo.is_empty() {
        debug!("update-poll: CADENZA_BRIDGE_REPO empty; poller is a no-op");
    } else {
        info!("update-poll: polling {repo} every {:?}", POLL_INTERVAL);
    }
    loop {
        match bridge_updater::check_for_update(&repo, bridge_protocol::BRIDGE_VERSION).await {
            Ok(opt) => {
                state.set_update_info(opt.clone());
                if let Some(info) = opt {
                    info!(
                        "update-poll: update available {} → {}",
                        info.current_version, info.latest_version
                    );
                }
            }
            Err(e) => {
                debug!("update-poll: check failed: {e:#}");
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn poller_runs_without_panic_when_repo_empty() {
        // Unset env var to guarantee no-op path.
        let state = BridgeState::new();
        let handle = spawn_poller(state.clone());
        // Give it a chance to hit the first `check_for_update` call.
        sleep(Duration::from_millis(50)).await;
        // Nothing should have been written.
        assert!(state.update_info().is_none());
        handle.abort();
    }
}
