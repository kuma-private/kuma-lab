//! VST3 plugin directory scanner. Mirrors `bridge-clap::scanner` so the
//! frontend's plugin picker can merge entries from both formats.

use std::path::{Path, PathBuf};

use bridge_protocol::PluginDescriptor;
use tracing::{debug, warn};

/// Standard VST3 plugin install locations per platform.
pub fn default_vst3_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs_home() {
            out.push(home.join("Library/Audio/Plug-Ins/VST3"));
        }
        out.push(PathBuf::from("/Library/Audio/Plug-Ins/VST3"));
    }
    #[cfg(target_os = "windows")]
    {
        out.push(PathBuf::from("C:\\Program Files\\Common Files\\VST3"));
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            out.push(PathBuf::from(local).join("Programs/Common/VST3"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs_home() {
            out.push(home.join(".vst3"));
        }
        out.push(PathBuf::from("/usr/lib/vst3"));
        out.push(PathBuf::from("/usr/local/lib/vst3"));
    }
    out
}

#[allow(dead_code)]
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Walk all default VST3 paths and return discovered `.vst3` bundles as
/// `PluginDescriptor`s. For Phase 8 we only report the bundle path; the
/// real plugin metadata (sub-plugins, vendor name) comes from the SDK
/// in Phase 9.
pub fn scan_default_paths() -> Vec<PluginDescriptor> {
    let mut out = Vec::new();
    for root in default_vst3_paths() {
        if !root.exists() {
            continue;
        }
        debug!("scanning {}", root.display());
        if let Err(e) = scan_dir(&root, &mut out) {
            warn!("scan {} failed: {e}", root.display());
        }
    }
    out
}

fn scan_dir(dir: &Path, out: &mut Vec<PluginDescriptor>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();
        if name_str.ends_with(".vst3") {
            let id = path.to_string_lossy().to_string();
            let display = name_str.trim_end_matches(".vst3").to_string();
            out.push(PluginDescriptor {
                id: id.clone(),
                name: display,
                vendor: String::new(),
                path: id,
                format: "vst3".into(),
            });
        } else if path.is_dir() {
            // Recurse one level — vendor folders typically nest plugins.
            let _ = scan_dir(&path, out);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_empty_dir_returns_empty() {
        let tmp = std::env::temp_dir().join(format!(
            "cadenza-vst3-scan-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&tmp);
        let mut out = Vec::new();
        scan_dir(&tmp, &mut out).unwrap();
        assert!(out.is_empty());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn scan_detects_vst3_extension() {
        let tmp = std::env::temp_dir().join(format!(
            "cadenza-vst3-scan-hit-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&tmp);
        let plugin = tmp.join("TestPlugin.vst3");
        std::fs::write(&plugin, b"stub").unwrap();
        let mut out = Vec::new();
        scan_dir(&tmp, &mut out).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].format, "vst3");
        assert_eq!(out[0].name, "TestPlugin");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
