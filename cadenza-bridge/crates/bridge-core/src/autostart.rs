//! Cross-platform "register on OS login" registration.
//!
//! The public API is always `enable_autostart` / `disable_autostart` /
//! `is_autostart_enabled`. Each takes a `Target` (usually the watchdog
//! binary path) so tests can supply a temp-dir target and avoid touching
//! the real LaunchAgents / registry paths.
//!
//! macOS writes a LaunchAgent plist to `~/Library/LaunchAgents/fm.cadenza.bridge.plist`
//! pointing at the watchdog. We use plist text directly rather than a
//! library — the format is tiny and there's no need to pull in `plist`.
//!
//! Windows writes a `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
//! value named `CadenzaBridge`.

use std::path::PathBuf;

use anyhow::Result;

pub const MAC_LABEL: &str = "fm.cadenza.bridge";
pub const WIN_VALUE_NAME: &str = "CadenzaBridge";

/// Where to install the autostart entry. Tests override both the file
/// destination (mac) and the registry root (win) by constructing this
/// struct directly instead of calling `default_target()`.
#[derive(Debug, Clone)]
pub struct Target {
    /// Absolute path to the watchdog binary.
    pub exe: PathBuf,
    /// On macOS: directory to write the plist into. Defaults to
    /// `~/Library/LaunchAgents`; tests pass a tempdir instead.
    #[cfg(target_os = "macos")]
    pub launch_agents_dir: PathBuf,
    /// On Windows: registry root path under HKCU. Defaults to
    /// `Software\Microsoft\Windows\CurrentVersion\Run`; tests pass
    /// `Software\Cadenza\TestAutostart` to avoid polluting the real
    /// autostart key.
    #[cfg(target_os = "windows")]
    pub hkcu_subkey: String,
}

impl Target {
    pub fn default_for(exe: PathBuf) -> Result<Self> {
        Ok(Self {
            exe,
            #[cfg(target_os = "macos")]
            launch_agents_dir: default_launch_agents_dir()?,
            #[cfg(target_os = "windows")]
            hkcu_subkey: r"Software\Microsoft\Windows\CurrentVersion\Run".into(),
        })
    }
}

#[cfg(target_os = "macos")]
fn default_launch_agents_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("no HOME — cannot locate LaunchAgents"))?;
    Ok(home.join("Library").join("LaunchAgents"))
}

// ── macOS ────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
pub mod mac {
    use super::*;
    use std::fs;

    pub fn plist_path(target: &Target) -> PathBuf {
        target
            .launch_agents_dir
            .join(format!("{}.plist", super::MAC_LABEL))
    }

    pub fn render_plist(exe: &std::path::Path) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exe}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/{label}.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/{label}.err.log</string>
</dict>
</plist>
"#,
            label = super::MAC_LABEL,
            exe = exe.display()
        )
    }

    pub fn enable(target: &Target) -> Result<()> {
        fs::create_dir_all(&target.launch_agents_dir)
            .map_err(|e| anyhow::anyhow!("create launch agents dir: {e}"))?;
        let path = plist_path(target);
        fs::write(&path, render_plist(&target.exe))
            .map_err(|e| anyhow::anyhow!("write plist {}: {e}", path.display()))?;
        tracing::info!("autostart: wrote {}", path.display());
        Ok(())
    }

    pub fn disable(target: &Target) -> Result<()> {
        let path = plist_path(target);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| anyhow::anyhow!("remove plist {}: {e}", path.display()))?;
            tracing::info!("autostart: removed {}", path.display());
        }
        Ok(())
    }

    pub fn is_enabled(target: &Target) -> bool {
        plist_path(target).exists()
    }
}

// ── Windows ──────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub mod win {
    use super::*;

    /// Returns an explicit not-implemented error so the caller surfaces the
    /// failure to the UI. CLAUDE.md forbids fallbacks — silent Ok(()) here
    /// would let the frontend think autostart succeeded when it didn't.
    pub fn enable(_target: &Target) -> Result<()> {
        anyhow::bail!(
            "autostart::win::enable not yet implemented — registry write lands in a future phase"
        )
    }

    pub fn disable(_target: &Target) -> Result<()> {
        anyhow::bail!(
            "autostart::win::disable not yet implemented — registry write lands in a future phase"
        )
    }

    pub fn is_enabled(_target: &Target) -> bool {
        false
    }
}

// ── Public facade ────────────────────────────────────────────────────────

pub fn enable_autostart(target: &Target) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        mac::enable(target)
    }
    #[cfg(target_os = "windows")]
    {
        win::enable(target)
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = target;
        anyhow::bail!("autostart not supported on this platform")
    }
}

pub fn disable_autostart(target: &Target) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        mac::disable(target)
    }
    #[cfg(target_os = "windows")]
    {
        win::disable(target)
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = target;
        anyhow::bail!("autostart not supported on this platform")
    }
}

pub fn is_autostart_enabled(target: &Target) -> bool {
    #[cfg(target_os = "macos")]
    {
        mac::is_enabled(target)
    }
    #[cfg(target_os = "windows")]
    {
        win::is_enabled(target)
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = target;
        false
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn mac_enable_writes_plist_and_disable_removes_it() {
        let tmp = std::env::temp_dir().join(format!(
            "cadenza-autostart-test-{}-{}",
            std::process::id(),
            chrono_nanos()
        ));
        let dir = tmp.join("LaunchAgents");
        std::fs::create_dir_all(&dir).unwrap();

        let target = Target {
            exe: PathBuf::from("/usr/local/bin/cadenza-watchdog"),
            launch_agents_dir: dir.clone(),
        };
        enable_autostart(&target).unwrap();
        assert!(is_autostart_enabled(&target));
        let plist = mac::plist_path(&target);
        let body = std::fs::read_to_string(&plist).unwrap();
        assert!(body.contains(MAC_LABEL));
        assert!(body.contains("/usr/local/bin/cadenza-watchdog"));

        disable_autostart(&target).unwrap();
        assert!(!is_autostart_enabled(&target));
        assert!(!plist.exists());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn mac_plist_roundtrips_exe_path() {
        use std::path::Path;
        let body = mac::render_plist(Path::new("/Applications/Cadenza Bridge.app/Contents/MacOS/cadenza-watchdog"));
        assert!(body.contains("/Applications/Cadenza Bridge.app"));
        assert!(body.contains("<key>Label</key>"));
        assert!(body.contains("<key>RunAtLoad</key>"));
    }

    fn chrono_nanos() -> u32 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0)
    }
}
