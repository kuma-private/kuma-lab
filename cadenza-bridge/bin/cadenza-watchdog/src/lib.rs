//! Library half of cadenza-watchdog. Exposes the restart-with-backoff loop
//! as a pure function so integration tests can drive it against a fake
//! child binary without reaching into a `main`.

use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

/// Exponential-backoff schedule in seconds between restarts. The loop
/// advances one step for every failure and resets to the first step after
/// a clean-run threshold.
pub const BACKOFF_SECS: &[u64] = &[1, 2, 5, 10, 30];

/// After the child has been up for this many seconds with no crash, the
/// backoff index resets to zero.
pub const CLEAN_RUN_RESET_SECS: u64 = 60;

/// Configurable surface for the watchdog loop. Tests swap these out to
/// bound the test case; production uses `Config::default_for(bridge_exe)`.
pub struct Config {
    pub child_exe: PathBuf,
    pub child_args: Vec<String>,
    pub log_file: PathBuf,
    /// Stop after this many total restarts. `None` means "run forever".
    pub max_restarts: Option<u32>,
    /// If `Some`, substitute this for the live backoff schedule. Tests use
    /// a much tighter schedule so integration tests finish in seconds.
    pub backoff_override: Option<Vec<Duration>>,
    /// If `Some`, substitute this for the clean-run reset window.
    pub clean_run_reset_override: Option<Duration>,
}

impl Config {
    pub fn default_for(child_exe: PathBuf) -> Self {
        Self {
            child_exe,
            child_args: Vec::new(),
            log_file: default_log_path(),
            max_restarts: None,
            backoff_override: None,
            clean_run_reset_override: None,
        }
    }
}

/// Default on-disk log location per-OS. macOS / Linux put it under
/// `~/Library/Application Support/Cadenza Bridge/` via the `dirs` crate;
/// Windows uses the roaming data dir. Falls back to `./watchdog.log` if
/// the dir cannot be resolved.
pub fn default_log_path() -> PathBuf {
    if let Some(base) = cadenza_support_dir() {
        base.join("watchdog.log")
    } else {
        PathBuf::from("watchdog.log")
    }
}

/// Cross-platform "Cadenza Bridge" support directory. Exposed publicly
/// because the autostart code paths want the same location.
pub fn cadenza_support_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::data_dir().map(|d| d.join("Cadenza Bridge"))
    }
    #[cfg(target_os = "windows")]
    {
        dirs::data_dir().map(|d| d.join("Cadenza Bridge"))
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        dirs::data_dir().map(|d| d.join("cadenza-bridge"))
    }
}

/// Append a single line to the watchdog log file, creating parents on the
/// fly. Swallows errors from log-file IO: failing to log is not fatal.
pub fn log_line(path: &Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{line}");
    }
}

fn backoff_schedule(cfg: &Config) -> Vec<Duration> {
    if let Some(v) = &cfg.backoff_override {
        return v.clone();
    }
    BACKOFF_SECS.iter().map(|s| Duration::from_secs(*s)).collect()
}

fn clean_run_reset(cfg: &Config) -> Duration {
    cfg.clean_run_reset_override
        .unwrap_or_else(|| Duration::from_secs(CLEAN_RUN_RESET_SECS))
}

/// Spawn the configured child once, returning the handle.
fn spawn_child(cfg: &Config) -> Result<Child> {
    Command::new(&cfg.child_exe)
        .args(&cfg.child_args)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .with_context(|| format!("spawn {}", cfg.child_exe.display()))
}

fn status_label(status: &ExitStatus) -> String {
    if let Some(code) = status.code() {
        format!("exit={code}")
    } else {
        "signal-terminated".to_string()
    }
}

/// Run the watchdog loop: spawn the child, wait, log any unclean exit, and
/// restart with exponential backoff. Returns `Ok(restart_count)` only
/// after `cfg.max_restarts` is hit — callers using `max_restarts = None`
/// will never see this function return under normal operation, which
/// matches production usage where the watchdog runs forever.
pub fn run_loop(cfg: &Config) -> Result<u32> {
    let schedule = backoff_schedule(cfg);
    let reset_after = clean_run_reset(cfg);

    log_line(
        &cfg.log_file,
        &format!(
            "[watchdog] start exe={} args={:?}",
            cfg.child_exe.display(),
            cfg.child_args
        ),
    );

    let mut restarts: u32 = 0;
    let mut backoff_idx: usize = 0;

    loop {
        let spawn_ts = Instant::now();
        let mut child = match spawn_child(cfg) {
            Ok(c) => c,
            Err(e) => {
                log_line(&cfg.log_file, &format!("[watchdog] spawn failed: {e:#}"));
                // If we can't even spawn the child, use the current backoff
                // step and retry. This is the same contract as "child
                // exited immediately".
                let delay = schedule[backoff_idx.min(schedule.len() - 1)];
                backoff_idx = (backoff_idx + 1).min(schedule.len() - 1);
                std::thread::sleep(delay);
                restarts += 1;
                if let Some(max) = cfg.max_restarts {
                    if restarts >= max {
                        return Ok(restarts);
                    }
                }
                continue;
            }
        };
        let pid = child.id();
        log_line(&cfg.log_file, &format!("[watchdog] spawned pid={pid}"));

        let status = child.wait().context("wait for child")?;
        let run_duration = spawn_ts.elapsed();

        log_line(
            &cfg.log_file,
            &format!(
                "[watchdog] child exited pid={pid} {} after {:.1}s",
                status_label(&status),
                run_duration.as_secs_f64()
            ),
        );

        if status.success() {
            // Clean exit — watchdog mission accomplished, bail out. In
            // production this matches a user-initiated "Quit" from the
            // tray, which cascades into the watchdog exiting cleanly too.
            log_line(&cfg.log_file, "[watchdog] clean exit, terminating watchdog");
            return Ok(restarts);
        }

        // Reset backoff if the child managed to stay alive long enough.
        if run_duration >= reset_after {
            log_line(
                &cfg.log_file,
                &format!(
                    "[watchdog] clean run >= {}s, resetting backoff",
                    reset_after.as_secs()
                ),
            );
            backoff_idx = 0;
        }

        let delay = schedule[backoff_idx.min(schedule.len() - 1)];
        log_line(
            &cfg.log_file,
            &format!(
                "[watchdog] restart #{} in {}s",
                restarts + 1,
                delay.as_secs_f64()
            ),
        );
        std::thread::sleep(delay);
        backoff_idx = (backoff_idx + 1).min(schedule.len() - 1);
        restarts += 1;

        if let Some(max) = cfg.max_restarts {
            if restarts >= max {
                return Ok(restarts);
            }
        }
    }
}

/// Locate the `cadenza-bridge` binary next to the running watchdog. Used
/// by `main.rs`; exposed publicly so tests can do the same lookup.
pub fn resolve_bridge_exe() -> Result<PathBuf> {
    let exe = std::env::current_exe().context("current_exe")?;
    let parent = exe
        .parent()
        .ok_or_else(|| anyhow::anyhow!("current_exe has no parent"))?;
    let candidate = parent.join(bridge_exe_name());
    if candidate.exists() {
        return Ok(candidate);
    }
    // Fallback: sibling in the same cargo target dir. During `cargo run`
    // both binaries live in target/debug and target/release alongside.
    Ok(candidate)
}

fn bridge_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "cadenza-bridge.exe"
    } else {
        "cadenza-bridge"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_schedule_default_matches_constants() {
        let cfg = Config::default_for(PathBuf::from("/tmp/noop"));
        let sch = backoff_schedule(&cfg);
        assert_eq!(sch.len(), BACKOFF_SECS.len());
        assert_eq!(sch[0], Duration::from_secs(1));
    }

    #[test]
    fn backoff_override_is_respected() {
        let mut cfg = Config::default_for(PathBuf::from("/tmp/noop"));
        cfg.backoff_override = Some(vec![
            Duration::from_millis(5),
            Duration::from_millis(10),
        ]);
        let sch = backoff_schedule(&cfg);
        assert_eq!(sch.len(), 2);
        assert_eq!(sch[1], Duration::from_millis(10));
    }

    #[test]
    fn log_line_appends_without_panic() {
        let tmp = std::env::temp_dir().join(format!(
            "cadenza-watchdog-test-{}.log",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&tmp);
        log_line(&tmp, "hello");
        log_line(&tmp, "world");
        let contents = std::fs::read_to_string(&tmp).unwrap();
        assert!(contents.contains("hello"));
        assert!(contents.contains("world"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn bridge_exe_name_has_correct_extension() {
        let n = bridge_exe_name();
        if cfg!(target_os = "windows") {
            assert!(n.ends_with(".exe"));
        } else {
            assert!(!n.ends_with(".exe"));
        }
    }
}
