//! Raw `extern "C"` declarations for the VST3 shim. These match
//! `cpp/vst3_shim.h` one-to-one. Callers should use `instrument.rs` or
//! `stub.rs` rather than touching these directly.

#![allow(non_camel_case_types, dead_code)]

use std::os::raw::{c_char, c_void};

/// Opaque handle returned by `vst3_load`. The Rust side never inspects
/// its internals.
#[repr(C)]
pub struct Vst3Plugin {
    _opaque: [u8; 0],
    /// Prevents the type from being `Send`/`Sync` automatically; we wrap
    /// a raw pointer in the `instrument.rs` side and hand-write the
    /// Send impl after asserting the audio thread is the sole caller.
    _marker: core::marker::PhantomData<(*mut u8, core::marker::PhantomPinned)>,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct Vst3ParamInfo {
    pub id: i32,
    pub name: [c_char; 256],
    pub unit: [c_char; 64],
    pub default_value: f64,
    pub min_value: f64,
    pub max_value: f64,
    pub step_count: i32,
}

extern "C" {
    pub fn vst3_load(
        path: *const c_char,
        sample_rate: f64,
        max_block_size: i32,
    ) -> *mut Vst3Plugin;
    pub fn vst3_free(plugin: *mut Vst3Plugin);

    pub fn vst3_process(
        plugin: *mut Vst3Plugin,
        inputs: *const *const f32,
        n_in_channels: i32,
        outputs: *const *mut f32,
        n_out_channels: i32,
        n_frames: i32,
        midi_events: *const u8,
        midi_byte_count: i32,
        playhead_samples: i64,
    ) -> i32;

    pub fn vst3_param_count(plugin: *mut Vst3Plugin) -> i32;
    pub fn vst3_param_info(
        plugin: *mut Vst3Plugin,
        idx: i32,
        out: *mut Vst3ParamInfo,
    ) -> i32;
    pub fn vst3_set_param(plugin: *mut Vst3Plugin, param_id: u32, normalized: f64) -> i32;
    pub fn vst3_get_param(plugin: *mut Vst3Plugin, param_id: u32) -> f64;

    pub fn vst3_get_state(
        plugin: *mut Vst3Plugin,
        out_buf: *mut *mut u8,
        out_len: *mut usize,
    ) -> i32;
    pub fn vst3_set_state(plugin: *mut Vst3Plugin, buf: *const u8, len: usize) -> i32;
    pub fn vst3_free_buffer(buf: *mut u8);

    pub fn vst3_show_editor(plugin: *mut Vst3Plugin, parent: *mut c_void) -> i32;
    pub fn vst3_hide_editor(plugin: *mut Vst3Plugin) -> i32;

    pub fn vst3_last_error() -> *const c_char;
}

/// Read the last-error string from the shim. Thread-local, owned by the
/// shim — the caller must copy before making another FFI call on the
/// same thread.
pub fn last_error() -> String {
    // Safety: vst3_last_error never returns null (the shim guarantees
    // a pointer to a thread-local buffer).
    unsafe {
        let ptr = vst3_last_error();
        if ptr.is_null() {
            return String::new();
        }
        std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }
}

/// Compile-time check: the shim header sets `vst3_sdk_vendored` cfg
/// when VST3_SDK_PATH was present at build time. Rust code can use
/// `cfg(vst3_sdk_vendored)` to branch on "the real SDK is linked".
#[cfg(vst3_sdk_vendored)]
pub const HAS_VST3_SDK: bool = true;
#[cfg(not(vst3_sdk_vendored))]
pub const HAS_VST3_SDK: bool = false;

