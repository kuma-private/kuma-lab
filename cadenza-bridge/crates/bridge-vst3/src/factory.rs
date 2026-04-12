//! Factory that resolves a plugin id (the bundle path) into a boxed
//! `Instrument`. Mirrors `bridge-clap::ClapFactory`. When the VST3 SDK
//! is vendored at build time we try the real shim first and fall back
//! to `SilentVst3Instrument` on load failure so missing or corrupt
//! plugins don't hard-error the entire graph rebuild.

use bridge_plugin_host::Instrument;
use bridge_protocol::PluginDescriptor;

use crate::ffi;
use crate::instrument::Vst3Instrument;
use crate::stub::SilentVst3Instrument;

#[derive(Clone, Default)]
pub struct Vst3Catalog {
    pub plugins: Vec<PluginDescriptor>,
}

impl Vst3Catalog {
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn rescan(&mut self) -> usize {
        self.plugins = crate::scanner::scan_default_paths();
        self.plugins.len()
    }

    pub fn find(&self, id: &str) -> Option<&PluginDescriptor> {
        self.plugins.iter().find(|p| p.id == id)
    }
}

#[derive(Clone)]
pub struct Vst3Factory {
    catalog: Vst3Catalog,
    sample_rate: u32,
    max_block_size: usize,
}

impl Vst3Factory {
    pub fn new(catalog: Vst3Catalog, sample_rate: u32, max_block_size: usize) -> Self {
        Self {
            catalog,
            sample_rate,
            max_block_size,
        }
    }

    pub fn catalog(&self) -> &Vst3Catalog {
        &self.catalog
    }

    /// Look up a plugin by id and return a boxed instrument. If the SDK
    /// is not vendored or the load fails, returns a `SilentVst3Instrument`
    /// so the rest of the graph still plays. Returns `None` only if the
    /// id isn't in the catalog — callers should propagate that as an
    /// "unknown plugin" error to the frontend.
    pub fn make_instrument(&self, plugin_id: &str) -> Option<Box<dyn Instrument>> {
        let desc = self.catalog.find(plugin_id)?;
        if ffi::HAS_VST3_SDK {
            match Vst3Instrument::load(
                desc.id.clone(),
                desc.path.clone(),
                self.sample_rate,
                self.max_block_size,
            ) {
                Ok(real) => Some(Box::new(real)),
                Err(e) => {
                    tracing::warn!(
                        "vst3 load failed for {}, using silent stub: {e}",
                        desc.path
                    );
                    Some(Box::new(SilentVst3Instrument::new(
                        desc.id.clone(),
                        desc.path.clone(),
                    )))
                }
            }
        } else {
            Some(Box::new(SilentVst3Instrument::new(
                desc.id.clone(),
                desc.path.clone(),
            )))
        }
    }
}
