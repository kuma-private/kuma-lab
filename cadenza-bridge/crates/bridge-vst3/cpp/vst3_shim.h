// VST3 shim header — extern "C" surface exposed to Rust via bindgen-less FFI.
//
// This header intentionally avoids any Steinberg SDK headers so it can be
// included from Rust build scripts (via the `cc` crate) and by the .cpp
// implementation regardless of whether the SDK is vendored.
//
// When HAS_VST3_SDK is defined, the implementation links against the
// Steinberg VST3 SDK. When undefined, each function returns a "not built
// with SDK" error and the struct `Vst3Plugin` is purely opaque.

#ifndef CADENZA_VST3_SHIM_H
#define CADENZA_VST3_SHIM_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct Vst3Plugin Vst3Plugin;

typedef struct {
    int32_t id;
    char    name[256];
    char    unit[64];
    double  default_value;
    double  min_value;
    double  max_value;
    int32_t step_count; /* 0 = continuous */
} Vst3ParamInfo;

/* ── Lifecycle ─────────────────────────────────────────── */
Vst3Plugin* vst3_load(const char* path, double sample_rate, int32_t max_block_size);
void        vst3_free(Vst3Plugin* plugin);

/* ── Processing ────────────────────────────────────────── */
/* Returns 0 on success, non-zero on error. Outputs are interleaved stereo
 * written by the caller (n_out_channels == 2 for Phase 8). Inputs are
 * unused today but reserved for effect-chain routing in Phase 9.
 *
 * midi_events is a packed byte buffer of {sample_offset:u32, status:u8,
 * data1:u8, data2:u8, _pad:u8} records (little-endian). Empty if no MIDI.
 */
int32_t vst3_process(
    Vst3Plugin*         plugin,
    const float* const* inputs,
    int32_t             n_in_channels,
    float* const*       outputs,
    int32_t             n_out_channels,
    int32_t             n_frames,
    const uint8_t*      midi_events,
    int32_t             midi_byte_count,
    int64_t             playhead_samples
);

/* ── Parameters ────────────────────────────────────────── */
int32_t vst3_param_count(Vst3Plugin* plugin);
int32_t vst3_param_info(Vst3Plugin* plugin, int32_t idx, Vst3ParamInfo* out);
int32_t vst3_set_param(Vst3Plugin* plugin, uint32_t param_id, double normalized);
double  vst3_get_param(Vst3Plugin* plugin, uint32_t param_id);

/* ── State (used by project save/load) ─────────────────── */
int32_t vst3_get_state(Vst3Plugin* plugin, uint8_t** out_buf, size_t* out_len);
int32_t vst3_set_state(Vst3Plugin* plugin, const uint8_t* buf, size_t len);
void    vst3_free_buffer(uint8_t* buf);

/* ── Editor ────────────────────────────────────────────── */
/* Phase 8 opens a placeholder if the real SDK is not vendored.
 * parent_native_view is a NSView* on macOS / HWND on Windows.
 */
int32_t vst3_show_editor(Vst3Plugin* plugin, void* parent_native_view);
int32_t vst3_hide_editor(Vst3Plugin* plugin);

/* ── Error reporting ───────────────────────────────────── */
/* Returns a pointer to a thread-local C string owned by the shim. Valid
 * until the next shim call on this thread. Never NULL.
 */
const char* vst3_last_error(void);

#ifdef __cplusplus
}
#endif

#endif /* CADENZA_VST3_SHIM_H */
