use anyhow::Result;
use cadenza_watchdog::{resolve_bridge_exe, run_loop, Config};
use tracing::info;

fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,cadenza_watchdog=debug"));
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}

fn main() -> Result<()> {
    init_tracing();
    info!("cadenza-watchdog starting");

    let bridge_exe = resolve_bridge_exe()?;
    let cfg = Config::default_for(bridge_exe);
    info!(
        "cadenza-watchdog: launching {} (log={})",
        cfg.child_exe.display(),
        cfg.log_file.display()
    );

    // In production `max_restarts = None` so this never returns cleanly
    // until the user selects Quit from the tray (child exits with code
    // 0, loop bails out).
    let _ = run_loop(&cfg)?;
    Ok(())
}
