use std::path::PathBuf;

use bridge_plugin_host::{Instrument, SilentInstrument};
use tracing::{info, warn};

use crate::plugin::ClapInstrument;
use crate::scanner::PluginCatalog;

/// Factory wired into the audio graph at project-load time.
///
/// `make_instrument(plugin_id)` resolves a plugin id (currently the absolute
/// path of the `.clap` bundle as discovered by the scanner) into a boxed
/// `Instrument`. When the path is known and load succeeds, we return a real
/// `ClapInstrument`. When load fails (missing symbol, init returned false,
/// plugin-path mismatch, etc.) we log a warning and fall back to
/// `SilentInstrument` so the graph still plays — the user will hear silence
/// from that track instead of crashing the bridge.
#[derive(Clone)]
pub struct ClapFactory {
    catalog: PluginCatalog,
    sample_rate: f64,
    max_block: u32,
}

impl ClapFactory {
    pub fn new(catalog: PluginCatalog) -> Self {
        Self {
            catalog,
            sample_rate: 48_000.0,
            max_block: 512,
        }
    }

    pub fn with_audio_settings(mut self, sample_rate: u32, max_block: usize) -> Self {
        self.sample_rate = sample_rate as f64;
        self.max_block = max_block as u32;
        self
    }

    pub fn catalog(&self) -> &PluginCatalog {
        &self.catalog
    }

    pub fn make_instrument(&self, plugin_id: &str) -> Option<Box<dyn Instrument>> {
        let desc = self.catalog.find(plugin_id)?;
        let path = PathBuf::from(&desc.path);
        match ClapInstrument::load(&path, 0, self.sample_rate, self.max_block) {
            Ok(inst) => {
                info!(
                    "loaded CLAP plugin {} ({})",
                    inst.display_name(),
                    inst.id()
                );
                Some(Box::new(inst))
            }
            Err(e) => {
                warn!(
                    "failed to load CLAP plugin {} at {}: {e:#}. Falling back to silence.",
                    desc.name,
                    path.display()
                );
                Some(Box::new(SilentInstrument))
            }
        }
    }
}
