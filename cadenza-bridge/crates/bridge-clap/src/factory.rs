use bridge_plugin_host::Instrument;

use crate::plugin::ClapInstrument;
use crate::scanner::PluginCatalog;

/// Factory wired into the audio graph at project-load time.
///
/// `make_instrument(plugin_id)` resolves a plugin id (currently the absolute
/// path of the `.clap` bundle as discovered by the scanner) into a boxed
/// `Instrument`. Returns `None` if the id is unknown — `Graph::from_project`
/// will fall back to `SilentInstrument` so the rest of the graph still works.
#[derive(Clone)]
pub struct ClapFactory {
    catalog: PluginCatalog,
}

impl ClapFactory {
    pub fn new(catalog: PluginCatalog) -> Self {
        Self { catalog }
    }

    pub fn catalog(&self) -> &PluginCatalog {
        &self.catalog
    }

    pub fn make_instrument(&self, plugin_id: &str) -> Option<Box<dyn Instrument>> {
        let desc = self.catalog.find(plugin_id)?;
        Some(Box::new(ClapInstrument::new(
            desc.id.clone(),
            desc.path.clone(),
        )))
    }
}
