//! CLAP plugin support for the Cadenza Bridge.
//!
//! Phase 8.5: this crate hosts real CLAP plugins via `clap-sys` FFI. The
//! audio graph sees CLAP plugins through the shared `Instrument` trait —
//! `ClapInstrument::load` opens a `.clap` bundle, activates the plugin, and
//! routes MIDI + audio through `clap_plugin.process`. If a plugin fails to
//! load the factory logs a warning and falls back to `SilentInstrument` so
//! the rest of the bridge keeps playing.

pub mod factory;
pub mod plugin;
pub mod scanner;

pub use factory::ClapFactory;
pub use plugin::ClapInstrument;
pub use scanner::{scan_default_paths, PluginCatalog};
