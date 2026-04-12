//! CLAP plugin support for the Cadenza Bridge.
//!
//! Phase 2 deviation: the upstream `clack-host` crate referenced by the
//! design doc is not currently published on crates.io. Rather than vendor a
//! git dependency at this stage we ship the *plumbing* — directory scanning,
//! plugin descriptor catalog, and an `Instrument` factory hook — backed by
//! a stub instrument that emits silence. Phase 2.5 will swap the stub for a
//! real clack-host (or alternative clap-sys-based) backend without touching
//! the rest of the bridge code.

pub mod factory;
pub mod plugin;
pub mod scanner;

pub use factory::ClapFactory;
pub use plugin::ClapInstrument;
pub use scanner::{scan_default_paths, PluginCatalog};
