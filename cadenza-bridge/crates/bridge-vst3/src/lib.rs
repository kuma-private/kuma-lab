//! VST3 plugin support for the Cadenza Bridge.
//!
//! Two build modes:
//! - **Stub** (default): the FFI surface exists but every call returns
//!   an error and `Vst3Instrument::load` always fails with "SDK not
//!   vendored". The `Vst3Factory` serves `SilentVst3Instrument` so the
//!   audio graph still plays silence where a VST3 would have rendered.
//! - **Real** (env `VST3_SDK_PATH` set): `build.rs` compiles the C++
//!   shim in `cpp/vst3_shim.cpp` against the Steinberg VST3 SDK and
//!   links a real hosting backend.
//!
//! See `README.md` and `cpp/README.md` for license notes.

pub mod effect;
pub mod factory;
pub mod ffi;
pub mod instrument;
pub mod scanner;
pub mod stub;

pub use effect::Vst3Effect;
pub use factory::{Vst3Catalog, Vst3Factory};
pub use instrument::Vst3Instrument;
pub use scanner::{scan_default_paths, default_vst3_paths};
pub use stub::SilentVst3Instrument;

/// True when the crate was built with `VST3_SDK_PATH` pointing at a
/// vendored SDK. Exposed so the session layer can log the active
/// hosting mode at startup.
pub const HAS_VST3_SDK: bool = ffi::HAS_VST3_SDK;
