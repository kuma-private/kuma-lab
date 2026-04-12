//! Real CLAP plugin instrument backed by `clap-sys` FFI. Loads a `.clap`
//! bundle, instantiates the first sub-plugin, activates it at the host
//! sample rate and block size, and feeds note events + renders stereo audio
//! per block via `(*plugin).process`.
//!
//! On any load-stage failure the caller (factory) is expected to fall back
//! to `SilentInstrument`, so this module only needs to return `Result`s.

use std::ffi::{c_char, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::ptr;

use anyhow::{anyhow, Context, Result};
use bridge_plugin_host::{Instrument, MidiEvent, MidiEventKind};
use libloading::{Library, Symbol};

use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::entry::clap_plugin_entry;
use clap_sys::events::{
    clap_event_header, clap_event_note, clap_input_events, clap_output_events,
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_IS_LIVE, CLAP_EVENT_NOTE_OFF, CLAP_EVENT_NOTE_ON,
};
use clap_sys::factory::plugin_factory::{clap_plugin_factory, CLAP_PLUGIN_FACTORY_ID};
use clap_sys::host::clap_host;
use clap_sys::plugin::clap_plugin;
use clap_sys::process::{clap_process, CLAP_PROCESS_ERROR};
use clap_sys::version::CLAP_VERSION;

// Static host identity strings kept alive for the lifetime of the process.
const HOST_NAME: &[u8] = b"Cadenza Bridge\0";
const HOST_VENDOR: &[u8] = b"Cadenza\0";
const HOST_URL: &[u8] = b"https://cadenza.fm\0";
const HOST_VERSION: &[u8] = b"0.1.0\0";

fn cstatic(bytes: &'static [u8]) -> *const c_char {
    bytes.as_ptr() as *const c_char
}

/// A real CLAP-hosted instrument. Holds the dlopen'd library, the entry
/// point, a factory pointer, the plugin instance, and the host struct
/// (boxed so the pointer we hand to `create_plugin` stays valid for the
/// whole lifetime of the instance). Dropping this cleanly stops, deactivates,
/// destroys and deinits in the correct order.
pub struct ClapInstrument {
    // Kept alive so the dlopened symbols stay valid. Dropped last.
    _library: Library,
    entry: *const clap_plugin_entry,
    _factory: *const clap_plugin_factory,
    plugin: *const clap_plugin,
    // Boxed so the pointer we passed to `create_plugin` stays stable.
    _host: Box<clap_host>,
    name: String,
    id: String,
    sample_rate: f64,
    max_block: u32,
    activated: bool,
    processing: bool,
    // Scratch buffers (planar de-interleave). Grown lazily in `process`.
    left: Vec<f32>,
    right: Vec<f32>,
    // Reusable event storage. `events` owns the structs; `event_ctx` is a
    // small FFI-facing struct (kept boxed so its address is stable) that
    // points back at `events`.
    events: Vec<clap_event_note>,
    event_ctx: Box<EventListCtx>,
    in_events: clap_input_events,
    out_events: clap_output_events,
}

// SAFETY: the bridge audio graph owns the instrument on a single worker
// thread. CLAP plugins are not `Sync`, so we only need `Send`.
unsafe impl Send for ClapInstrument {}

// Context handed to the C event-list callbacks. `events_ptr` points into
// the parent `ClapInstrument::events` vector. The `Vec` is only mutated
// between process calls, and the callbacks only read during process, so
// there is no aliasing.
#[repr(C)]
struct EventListCtx {
    events_ptr: *const clap_event_note,
    events_len: u32,
}

impl ClapInstrument {
    /// Load a `.clap` bundle and instantiate the plugin at `plugin_index`.
    ///
    /// On macOS a `.clap` is a bundle directory — the actual Mach-O binary
    /// lives at `Contents/MacOS/<stem>`. On Linux / Windows the `.clap` is
    /// a single shared object.
    pub fn load(
        bundle_path: &Path,
        plugin_index: usize,
        sample_rate: f64,
        max_block: u32,
    ) -> Result<Self> {
        let lib_path = resolve_binary_path(bundle_path)?;

        // 1. dlopen the binary. On error the library handle drops and
        //    unloads automatically.
        let library = unsafe { Library::new(&lib_path) }
            .with_context(|| format!("dlopen {}", lib_path.display()))?;

        // 2. Look up the `clap_entry` symbol. This symbol is a *value* of
        //    type `clap_plugin_entry`, so `Library::get` returns a pointer
        //    to it. We read the pointer out as a raw pointer so we can drop
        //    the `Symbol` wrapper before binding `entry_ptr`.
        let entry_ptr: *const clap_plugin_entry = unsafe {
            let sym: Symbol<*const clap_plugin_entry> = library
                .get(b"clap_entry\0")
                .context("plugin has no clap_entry symbol")?;
            *sym
        };
        if entry_ptr.is_null() {
            return Err(anyhow!("clap_entry symbol is null"));
        }

        // 3. Run entry init (CLAP convention is to pass the binary path).
        let init_path = CString::new(lib_path.to_string_lossy().as_bytes())
            .context("init path contains NUL")?;
        unsafe {
            let init_fn = (*entry_ptr)
                .init
                .ok_or_else(|| anyhow!("clap_entry.init is null"))?;
            if !init_fn(init_path.as_ptr()) {
                return Err(anyhow!("clap_entry.init returned false"));
            }
        }

        // 4. Ask for the plugin factory.
        let factory_ptr: *const clap_plugin_factory = unsafe {
            let get_factory_fn = (*entry_ptr)
                .get_factory
                .ok_or_else(|| anyhow!("clap_entry.get_factory is null"))?;
            get_factory_fn(CLAP_PLUGIN_FACTORY_ID.as_ptr()) as *const clap_plugin_factory
        };
        if factory_ptr.is_null() {
            // Entry was init'd, try to deinit before we bail.
            unsafe {
                if let Some(deinit) = (*entry_ptr).deinit {
                    deinit();
                }
            }
            return Err(anyhow!("plugin has no clap.plugin-factory"));
        }

        // 5. Enumerate plugins; pick the one at `plugin_index`.
        let descriptor = unsafe {
            let get_desc_fn = (*factory_ptr)
                .get_plugin_descriptor
                .ok_or_else(|| anyhow!("factory.get_plugin_descriptor is null"))?;
            get_desc_fn(factory_ptr, plugin_index as u32)
        };
        if descriptor.is_null() {
            unsafe {
                if let Some(deinit) = (*entry_ptr).deinit {
                    deinit();
                }
            }
            return Err(anyhow!(
                "no plugin descriptor at index {}",
                plugin_index
            ));
        }
        let (id, name) = unsafe {
            (
                cstr_owned((*descriptor).id),
                cstr_owned((*descriptor).name),
            )
        };

        // 6. Build the host struct and box it so the pointer is stable.
        let host = Box::new(clap_host {
            clap_version: CLAP_VERSION,
            host_data: ptr::null_mut(),
            name: cstatic(HOST_NAME),
            vendor: cstatic(HOST_VENDOR),
            url: cstatic(HOST_URL),
            version: cstatic(HOST_VERSION),
            get_extension: Some(host_get_extension),
            request_restart: Some(host_request_restart),
            request_process: Some(host_request_process),
            request_callback: Some(host_request_callback),
        });

        // 7. Create the plugin instance.
        let plugin_id_c = CString::new(id.clone()).context("plugin id contains NUL")?;
        let plugin_ptr: *const clap_plugin = unsafe {
            let create_fn = (*factory_ptr)
                .create_plugin
                .ok_or_else(|| anyhow!("factory.create_plugin is null"))?;
            create_fn(factory_ptr, host.as_ref() as *const _, plugin_id_c.as_ptr())
        };
        if plugin_ptr.is_null() {
            unsafe {
                if let Some(deinit) = (*entry_ptr).deinit {
                    deinit();
                }
            }
            return Err(anyhow!("create_plugin returned null for {}", id));
        }

        // 8. Init the plugin.
        unsafe {
            let init_fn = (*plugin_ptr)
                .init
                .ok_or_else(|| anyhow!("plugin.init is null"))?;
            if !init_fn(plugin_ptr) {
                if let Some(destroy) = (*plugin_ptr).destroy {
                    destroy(plugin_ptr);
                }
                if let Some(deinit) = (*entry_ptr).deinit {
                    deinit();
                }
                return Err(anyhow!("plugin.init returned false"));
            }
        }

        // 9. Activate.
        unsafe {
            let activate_fn = (*plugin_ptr)
                .activate
                .ok_or_else(|| anyhow!("plugin.activate is null"))?;
            if !activate_fn(plugin_ptr, sample_rate, 1, max_block) {
                if let Some(destroy) = (*plugin_ptr).destroy {
                    destroy(plugin_ptr);
                }
                if let Some(deinit) = (*entry_ptr).deinit {
                    deinit();
                }
                return Err(anyhow!("plugin.activate returned false"));
            }
        }

        // 10. Start processing.
        unsafe {
            let start_fn = (*plugin_ptr)
                .start_processing
                .ok_or_else(|| anyhow!("plugin.start_processing is null"))?;
            if !start_fn(plugin_ptr) {
                if let Some(deactivate) = (*plugin_ptr).deactivate {
                    deactivate(plugin_ptr);
                }
                if let Some(destroy) = (*plugin_ptr).destroy {
                    destroy(plugin_ptr);
                }
                if let Some(deinit) = (*entry_ptr).deinit {
                    deinit();
                }
                return Err(anyhow!("plugin.start_processing returned false"));
            }
        }

        // 11. Pre-allocate the scratch buffers + event ctx.
        let left = vec![0.0f32; max_block as usize];
        let right = vec![0.0f32; max_block as usize];

        let event_ctx = Box::new(EventListCtx {
            events_ptr: ptr::null(),
            events_len: 0,
        });
        let ctx_ptr = event_ctx.as_ref() as *const EventListCtx as *mut c_void;
        let in_events = clap_input_events {
            ctx: ctx_ptr,
            size: Some(event_list_size),
            get: Some(event_list_get),
        };
        let out_events = clap_output_events {
            ctx: ptr::null_mut(),
            try_push: Some(out_events_try_push),
        };

        Ok(Self {
            _library: library,
            entry: entry_ptr,
            _factory: factory_ptr,
            plugin: plugin_ptr,
            _host: host,
            name,
            id,
            sample_rate,
            max_block,
            activated: true,
            processing: true,
            left,
            right,
            events: Vec::with_capacity(32),
            event_ctx,
            in_events,
            out_events,
        })
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn display_name(&self) -> &str {
        &self.name
    }

    fn ensure_scratch(&mut self, n_frames: usize) {
        if self.left.len() < n_frames {
            self.left.resize(n_frames, 0.0);
        }
        if self.right.len() < n_frames {
            self.right.resize(n_frames, 0.0);
        }
    }

    fn fill_events(&mut self, midi: &[MidiEvent]) {
        self.events.clear();
        for ev in midi {
            match ev.kind {
                MidiEventKind::NoteOn { pitch, velocity } => {
                    self.events.push(make_note_event(
                        CLAP_EVENT_NOTE_ON,
                        ev.sample_offset,
                        pitch,
                        velocity,
                    ));
                }
                MidiEventKind::NoteOff { pitch } => {
                    self.events.push(make_note_event(
                        CLAP_EVENT_NOTE_OFF,
                        ev.sample_offset,
                        pitch,
                        0,
                    ));
                }
                MidiEventKind::AllOff => {
                    // Emit note-off for all 128 keys at sample 0. CLAP has no
                    // single "all notes off" event in the core space, so we
                    // synthesize it. Plugins that support MIDI CC 123 would
                    // need a different path, but this keeps the stub working.
                    for pitch in 0u8..128 {
                        self.events.push(make_note_event(
                            CLAP_EVENT_NOTE_OFF,
                            ev.sample_offset,
                            pitch,
                            0,
                        ));
                    }
                }
            }
        }
        // Sort by time so the plugin sees in-order events.
        self.events.sort_by_key(|e| e.header.time);
        // Refresh the ctx. Pointers into the Vec are valid until the next
        // mutation of `self.events`.
        self.event_ctx.events_ptr = self.events.as_ptr();
        self.event_ctx.events_len = self.events.len() as u32;
    }
}

impl Instrument for ClapInstrument {
    fn process(&mut self, midi: &[MidiEvent], audio_out: &mut [f32], n_frames: usize) {
        debug_assert_eq!(audio_out.len(), n_frames * 2);

        // Safety net: if the plugin isn't live (load failed partway),
        // just zero out the output. The factory is expected to avoid
        // constructing a half-dead instrument, but belt-and-braces.
        if self.plugin.is_null() || !self.processing {
            for s in audio_out.iter_mut() {
                *s = 0.0;
            }
            return;
        }

        self.ensure_scratch(n_frames);
        for s in self.left[..n_frames].iter_mut() {
            *s = 0.0;
        }
        for s in self.right[..n_frames].iter_mut() {
            *s = 0.0;
        }

        self.fill_events(midi);

        // Assemble planar channel pointers. CLAP takes `**f32`; we feed it
        // a stack-allocated array of two pointers that live for the process
        // call only.
        let mut channels: [*mut f32; 2] =
            [self.left.as_mut_ptr(), self.right.as_mut_ptr()];
        let mut audio_buf = clap_audio_buffer {
            data32: channels.as_mut_ptr(),
            data64: ptr::null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };

        let process = clap_process {
            steady_time: -1,
            frames_count: n_frames as u32,
            transport: ptr::null(),
            audio_inputs: ptr::null(),
            audio_outputs: &mut audio_buf as *mut _,
            audio_inputs_count: 0,
            audio_outputs_count: 1,
            in_events: &self.in_events as *const _,
            out_events: &self.out_events as *const _,
        };

        let status = unsafe {
            if let Some(process_fn) = (*self.plugin).process {
                process_fn(self.plugin, &process)
            } else {
                CLAP_PROCESS_ERROR
            }
        };

        if status == CLAP_PROCESS_ERROR {
            // Plugin bailed — zero output and leave state alone.
            for s in audio_out.iter_mut() {
                *s = 0.0;
            }
            return;
        }

        // Interleave planar → stereo.
        for i in 0..n_frames {
            audio_out[i * 2] = self.left[i];
            audio_out[i * 2 + 1] = self.right[i];
        }
    }

    fn set_sample_rate(&mut self, _sr: u32) {
        // CLAP requires a deactivate/activate cycle to change sample rate.
        // The graph rebuilds on project change, so we treat this as a no-op
        // for now — load() is the canonical place to set it.
    }

    fn set_block_size(&mut self, _max: usize) {
        // Similar: max block size is fixed at activate() time. The audio
        // callback never exceeds `self.max_block` because the graph clamps.
    }
}

impl Drop for ClapInstrument {
    fn drop(&mut self) {
        unsafe {
            if !self.plugin.is_null() {
                if self.processing {
                    if let Some(stop) = (*self.plugin).stop_processing {
                        stop(self.plugin);
                    }
                }
                if self.activated {
                    if let Some(deactivate) = (*self.plugin).deactivate {
                        deactivate(self.plugin);
                    }
                }
                if let Some(destroy) = (*self.plugin).destroy {
                    destroy(self.plugin);
                }
            }
            if !self.entry.is_null() {
                if let Some(deinit) = (*self.entry).deinit {
                    deinit();
                }
            }
        }
        // _library drops last and unloads the dylib.
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

fn resolve_binary_path(bundle_path: &Path) -> Result<PathBuf> {
    if bundle_path.is_dir() {
        // macOS `.clap` bundle. The binary name matches the stem of the
        // bundle directory.
        let stem = bundle_path
            .file_stem()
            .ok_or_else(|| anyhow!("bundle has no file stem: {}", bundle_path.display()))?
            .to_string_lossy()
            .to_string();
        Ok(bundle_path.join("Contents/MacOS").join(stem))
    } else if bundle_path.exists() {
        Ok(bundle_path.to_path_buf())
    } else {
        Err(anyhow!("plugin path does not exist: {}", bundle_path.display()))
    }
}

fn cstr_owned(ptr: *const c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() }
}

fn make_note_event(
    event_type: u16,
    sample_offset: u32,
    pitch: u8,
    velocity: u8,
) -> clap_event_note {
    clap_event_note {
        header: clap_event_header {
            size: std::mem::size_of::<clap_event_note>() as u32,
            time: sample_offset,
            space_id: CLAP_CORE_EVENT_SPACE_ID,
            type_: event_type,
            flags: CLAP_EVENT_IS_LIVE,
        },
        note_id: -1,
        port_index: 0,
        channel: 0,
        key: pitch as i16,
        velocity: (velocity as f64) / 127.0,
    }
}

// ── C callbacks ───────────────────────────────────────────────────────────

unsafe extern "C" fn event_list_size(list: *const clap_input_events) -> u32 {
    let ctx = (*list).ctx as *const EventListCtx;
    if ctx.is_null() {
        return 0;
    }
    (*ctx).events_len
}

unsafe extern "C" fn event_list_get(
    list: *const clap_input_events,
    index: u32,
) -> *const clap_event_header {
    let ctx = (*list).ctx as *const EventListCtx;
    if ctx.is_null() || index >= (*ctx).events_len {
        return ptr::null();
    }
    let base = (*ctx).events_ptr;
    let event = base.add(index as usize);
    &(*event).header as *const _
}

unsafe extern "C" fn out_events_try_push(
    _list: *const clap_output_events,
    _event: *const clap_event_header,
) -> bool {
    // We discard all events emitted by the plugin for now. Phase 9 can
    // hook param-value / note-end events back into the graph if needed.
    true
}

unsafe extern "C" fn host_get_extension(
    _host: *const clap_host,
    _id: *const c_char,
) -> *const c_void {
    ptr::null()
}

unsafe extern "C" fn host_request_restart(_host: *const clap_host) {}
unsafe extern "C" fn host_request_process(_host: *const clap_host) {}
unsafe extern "C" fn host_request_callback(_host: *const clap_host) {}

// Silence the "field is never read" lint for fields we keep purely for
// lifetime ownership purposes.
#[allow(dead_code)]
impl ClapInstrument {
    pub(crate) fn sample_rate(&self) -> f64 {
        self.sample_rate
    }
    pub(crate) fn max_block(&self) -> u32 {
        self.max_block
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Real-plugin smoke test. Requires Surge XT (or similar) installed in
    /// the standard macOS CLAP directory. Ignored by default; run with:
    ///
    ///     cargo test -p bridge-clap loads_surge_xt -- --ignored
    #[test]
    #[ignore]
    fn loads_surge_xt_and_produces_sound() {
        let candidates = [
            PathBuf::from("/Library/Audio/Plug-Ins/CLAP/Surge XT.clap"),
            PathBuf::from(
                std::env::var("HOME").unwrap_or_default() + "/Library/Audio/Plug-Ins/CLAP/Surge XT.clap",
            ),
        ];
        let path = match candidates.iter().find(|p| p.exists()) {
            Some(p) => p.clone(),
            None => {
                eprintln!("Surge XT not found in standard paths; skipping");
                return;
            }
        };

        let mut inst = ClapInstrument::load(&path, 0, 48_000.0, 512)
            .expect("ClapInstrument::load failed");

        // Warmup: a few silent blocks so the plugin settles.
        let mut buf = vec![0.0f32; 512 * 2];
        for _ in 0..2 {
            inst.process(&[], &mut buf, 512);
        }

        // Trigger middle C.
        let midi = vec![MidiEvent::note_on(0, 60, 100)];
        inst.process(&midi, &mut buf, 512);

        // Render several more blocks so the voice is fully open.
        let mut peak = 0.0f32;
        for _ in 0..10 {
            inst.process(&[], &mut buf, 512);
            for s in buf.iter() {
                peak = peak.max(s.abs());
            }
        }

        assert!(
            peak > 0.001,
            "expected non-silent output after noteOn, got peak {peak}"
        );

        // Note off + tail.
        inst.process(&[MidiEvent::note_off(0, 60)], &mut buf, 512);
    }

    #[test]
    fn rejects_missing_path() {
        let result = ClapInstrument::load(
            Path::new("/nonexistent/Missing.clap"),
            0,
            48_000.0,
            512,
        );
        let err = match result {
            Err(e) => e,
            Ok(_) => panic!("load should fail for missing path"),
        };
        let msg = format!("{err}");
        assert!(
            msg.contains("does not exist") || msg.contains("dlopen"),
            "unexpected error: {msg}"
        );
    }
}
