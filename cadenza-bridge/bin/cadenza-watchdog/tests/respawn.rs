//! Integration test: spawn a fake child that exits immediately with a
//! non-zero status; verify the watchdog respawns it the configured number
//! of times, then give up cleanly when `max_restarts` is hit.

use std::path::PathBuf;
use std::time::Duration;

use cadenza_watchdog::{run_loop, Config};

fn fake_child_script() -> PathBuf {
    // `false(1)` lives at /usr/bin/false on macOS and /bin/false on most
    // Linux distros. The test is unix-gated for simplicity. The
    // watchdog's respawn loop is pure Rust with no OS-specific branches,
    // so Linux/macOS coverage is sufficient for correctness.
    for candidate in ["/usr/bin/false", "/bin/false"] {
        if std::path::Path::new(candidate).exists() {
            return PathBuf::from(candidate);
        }
    }
    panic!("no `false` binary found at /usr/bin/false or /bin/false");
}

#[test]
#[cfg(unix)]
fn respawns_failed_child_up_to_max_restarts() {
    let tmp_log = std::env::temp_dir().join(format!(
        "cadenza-watchdog-test-{}-{}.log",
        std::process::id(),
        rand_u32()
    ));
    let _ = std::fs::remove_file(&tmp_log);

    let cfg = Config {
        child_exe: fake_child_script(),
        child_args: vec![],
        log_file: tmp_log.clone(),
        max_restarts: Some(3),
        // Tight schedule so the test finishes in ~60ms total instead of
        // the production 1+2+5 = 8 second path.
        backoff_override: Some(vec![
            Duration::from_millis(10),
            Duration::from_millis(20),
            Duration::from_millis(30),
        ]),
        clean_run_reset_override: Some(Duration::from_secs(5)),
    };

    let restarts = run_loop(&cfg).expect("loop runs");
    assert_eq!(restarts, 3);

    let log = std::fs::read_to_string(&tmp_log).expect("read log");
    assert!(log.contains("[watchdog] start"));
    assert!(log.contains("child exited"));
    // Expect at least 3 restart lines.
    let restart_count = log.matches("[watchdog] restart").count();
    assert!(
        restart_count >= 3,
        "expected >=3 restart lines, got {restart_count}:\n{log}"
    );
    let _ = std::fs::remove_file(&tmp_log);
}

// Tiny non-crypto rand for unique temp-file names.
fn rand_u32() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0)
}
