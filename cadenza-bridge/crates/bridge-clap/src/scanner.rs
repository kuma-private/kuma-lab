use std::path::{Path, PathBuf};

use bridge_protocol::PluginDescriptor;
use tracing::{debug, warn};

/// Standard CLAP plugin install locations per platform.
pub fn default_clap_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs_home() {
            out.push(home.join("Library/Audio/Plug-Ins/CLAP"));
        }
        out.push(PathBuf::from("/Library/Audio/Plug-Ins/CLAP"));
    }
    #[cfg(target_os = "windows")]
    {
        out.push(PathBuf::from("C:\\Program Files\\Common Files\\CLAP"));
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            out.push(PathBuf::from(local).join("Programs/Common/CLAP"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs_home() {
            out.push(home.join(".clap"));
        }
        out.push(PathBuf::from("/usr/lib/clap"));
        out.push(PathBuf::from("/usr/local/lib/clap"));
    }
    out
}

#[allow(dead_code)]
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Walk all default CLAP paths and return discovered `.clap` bundles as
/// `PluginDescriptor`s. Each `.clap` is reported as a single descriptor
/// (sub-plugin enumeration is Phase 2.5+).
pub fn scan_default_paths() -> Vec<PluginDescriptor> {
    let mut out = Vec::new();
    for root in default_clap_paths() {
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
        if name_str.ends_with(".clap") {
            let id = path.to_string_lossy().to_string();
            let display = name_str.trim_end_matches(".clap").to_string();
            out.push(PluginDescriptor {
                id: id.clone(),
                name: display,
                vendor: String::new(),
                path: id,
                format: "clap".into(),
            });
        } else if path.is_dir() {
            // Recurse one level — vendor folders typically nest plugins.
            let _ = scan_dir(&path, out);
        }
    }
    Ok(())
}

/// In-memory catalog used by the session.
#[derive(Default, Clone)]
pub struct PluginCatalog {
    pub plugins: Vec<PluginDescriptor>,
}

impl PluginCatalog {
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn rescan(&mut self) -> usize {
        self.plugins = scan_default_paths();
        self.plugins.len()
    }

    pub fn find(&self, id: &str) -> Option<&PluginDescriptor> {
        self.plugins.iter().find(|p| p.id == id)
    }
}
