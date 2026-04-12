//! Placeholder for the VST3 insert-effect implementation. Phase 9 will
//! add a `Vst3Effect : InsertEffect` that wraps the same C++ shim as
//! `Vst3Instrument` but through the `process` path that reads input
//! buffers as well as writing output. Phase 8 ships just this stub so
//! the module tree is stable for future work.

use bridge_plugin_host::{automation::AutomationFrame, effects::InsertEffect};

pub struct Vst3Effect {
    pub id: String,
    pub path: String,
}

impl Vst3Effect {
    pub fn new(id: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            path: path.into(),
        }
    }
}

impl InsertEffect for Vst3Effect {
    fn process(&mut self, _audio: &mut [f32], _n_frames: usize, _automation: &AutomationFrame) {
        // Phase 8 stub: pass-through. Phase 9 wires this to the shim.
    }
    fn set_param(&mut self, _id: &str, _value: f64) {}
    fn get_param(&self, _id: &str) -> f64 {
        0.0
    }
    fn param_ids(&self) -> &'static [&'static str] {
        &[]
    }
    fn type_id(&self) -> &'static str {
        "vst3"
    }
}
