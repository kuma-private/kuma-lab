// VST3 shim implementation.
//
// Two compile modes:
//   1. HAS_VST3_SDK defined → full hosting flow: dlopen the bundle, query
//      IPluginFactory, instantiate IComponent, cast to IAudioProcessor, and
//      drive process() from vst3_process.
//   2. HAS_VST3_SDK undefined → every public function returns -1 with
//      vst3_last_error() set to a clear explanation. This lets CI build
//      the crate without a ~500MB SDK checkout.
//
// License notes:
//   - This shim itself is MIT/BSD equivalent (see crates/bridge-vst3/cpp/README.md).
//   - When HAS_VST3_SDK is defined the resulting binary links against
//     Steinberg VST3 SDK headers and sources, which are GPL-3 OR
//     Proprietary per Steinberg. Users who ship a linked build assume
//     their own compliance obligations.

#include "vst3_shim.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <string>

/* ── Thread-local error slot shared by both modes ───────────── */

namespace {

thread_local char g_error_buf[512] = {0};

void set_error(const char* msg) {
    if (!msg) {
        g_error_buf[0] = 0;
        return;
    }
    std::snprintf(g_error_buf, sizeof(g_error_buf), "%s", msg);
}

} // namespace

extern "C" const char* vst3_last_error(void) {
    return g_error_buf;
}

/* ════════════════════════════════════════════════════════════
 * STUB MODE (HAS_VST3_SDK undefined)
 * ════════════════════════════════════════════════════════════
 */

#ifndef HAS_VST3_SDK

struct Vst3Plugin {
    /* Minimal placeholder so the opaque handle has a distinct type even
     * when the SDK is not vendored. Not constructed in stub mode.
     */
    int _placeholder;
};

extern "C" Vst3Plugin* vst3_load(const char* /*path*/, double /*sample_rate*/, int32_t /*max_block_size*/) {
    set_error("VST3 SDK not vendored at build time (rebuild with VST3_SDK_PATH set)");
    return nullptr;
}

extern "C" void vst3_free(Vst3Plugin* /*plugin*/) {
    /* no-op: stub returns no handles */
}

extern "C" int32_t vst3_process(
    Vst3Plugin* /*plugin*/,
    const float* const* /*inputs*/, int32_t /*n_in_channels*/,
    float* const* outputs, int32_t n_out_channels,
    int32_t n_frames,
    const uint8_t* /*midi_events*/, int32_t /*midi_byte_count*/,
    int64_t /*playhead_samples*/
) {
    /* Stub path: fill outputs with silence so the audio worker at least
     * gets valid data if it somehow reaches here (it shouldn't; the Rust
     * side checks for a null handle and routes to SilentVst3Instrument).
     */
    for (int32_t c = 0; c < n_out_channels; ++c) {
        float* out = outputs[c];
        if (!out) continue;
        for (int32_t i = 0; i < n_frames; ++i) out[i] = 0.0f;
    }
    set_error("VST3 SDK not vendored; vst3_process is a silence stub");
    return -1;
}

extern "C" int32_t vst3_param_count(Vst3Plugin* /*plugin*/) {
    set_error("VST3 SDK not vendored");
    return 0;
}

extern "C" int32_t vst3_param_info(Vst3Plugin* /*plugin*/, int32_t /*idx*/, Vst3ParamInfo* /*out*/) {
    set_error("VST3 SDK not vendored");
    return -1;
}

extern "C" int32_t vst3_set_param(Vst3Plugin* /*plugin*/, uint32_t /*param_id*/, double /*normalized*/) {
    set_error("VST3 SDK not vendored");
    return -1;
}

extern "C" double vst3_get_param(Vst3Plugin* /*plugin*/, uint32_t /*param_id*/) {
    set_error("VST3 SDK not vendored");
    return 0.0;
}

extern "C" int32_t vst3_get_state(Vst3Plugin* /*plugin*/, uint8_t** out_buf, size_t* out_len) {
    if (out_buf) *out_buf = nullptr;
    if (out_len) *out_len = 0;
    set_error("VST3 SDK not vendored");
    return -1;
}

extern "C" int32_t vst3_set_state(Vst3Plugin* /*plugin*/, const uint8_t* /*buf*/, size_t /*len*/) {
    set_error("VST3 SDK not vendored");
    return -1;
}

extern "C" void vst3_free_buffer(uint8_t* buf) {
    if (buf) std::free(buf);
}

extern "C" int32_t vst3_show_editor(Vst3Plugin* /*plugin*/, void* /*parent_native_view*/) {
    set_error("VST3 SDK not vendored");
    return -1;
}

extern "C" int32_t vst3_hide_editor(Vst3Plugin* /*plugin*/) {
    set_error("VST3 SDK not vendored");
    return -1;
}

#else /* HAS_VST3_SDK defined ─────────────────────────────── */

/* ════════════════════════════════════════════════════════════
 * REAL MODE (HAS_VST3_SDK defined)
 *
 * This path uses the Steinberg VST3 SDK. Build requires include paths
 * into the vst3sdk checkout; see build.rs for the `cc::Build::include`
 * list. The hosting flow follows Steinberg's own `hostclasses` example:
 *
 *   1. Load .vst3 bundle (module::Module::create).
 *   2. Get the IPluginFactory from the module.
 *   3. Enumerate classes, pick the audio processor class.
 *   4. createInstance(IComponent::iid) → IComponent*.
 *   5. Query IAudioProcessor* via FUnknown::queryInterface.
 *   6. component->setIoMode, setupProcessing(...), setActive(true),
 *      setProcessing(true).
 *   7. On each process call: build ProcessData, invoke process().
 *
 * For Phase 8 this path compiles but is behind the `VST3_SDK_PATH`
 * environment variable; CI without the SDK uses the stub above.
 * ════════════════════════════════════════════════════════════
 */

#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/plugprovider.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/base/funknown.h"

using namespace Steinberg;
using namespace Steinberg::Vst;

struct Vst3Plugin {
    VST3::Hosting::Module::Ptr module;
    IPtr<IComponent>           component;
    IPtr<IAudioProcessor>      processor;
    double                     sample_rate;
    int32_t                    max_block_size;
    bool                       active;
    bool                       processing;
};

extern "C" Vst3Plugin* vst3_load(const char* path, double sample_rate, int32_t max_block_size) {
    if (!path) {
        set_error("vst3_load: null path");
        return nullptr;
    }
    std::string err;
    auto module = VST3::Hosting::Module::create(path, err);
    if (!module) {
        set_error(("vst3_load: module create failed: " + err).c_str());
        return nullptr;
    }
    auto factory = module->getFactory();
    for (auto& classInfo : factory.classInfos()) {
        if (classInfo.category() == kVstAudioEffectClass) {
            auto component = factory.createInstance<IComponent>(classInfo.ID());
            if (!component) continue;
            if (component->initialize(nullptr) != kResultOk) continue;
            auto processor = FUnknownPtr<IAudioProcessor>(component.get());
            if (!processor) continue;

            ProcessSetup setup{};
            setup.processMode        = kRealtime;
            setup.symbolicSampleSize = kSample32;
            setup.maxSamplesPerBlock = max_block_size;
            setup.sampleRate         = sample_rate;
            if (processor->setupProcessing(setup) != kResultOk) {
                set_error("vst3_load: setupProcessing failed");
                continue;
            }
            if (component->setActive(true) != kResultOk) {
                set_error("vst3_load: setActive failed");
                continue;
            }
            if (processor->setProcessing(true) != kResultOk) {
                set_error("vst3_load: setProcessing failed");
                continue;
            }

            auto* p = new (std::nothrow) Vst3Plugin();
            if (!p) {
                set_error("vst3_load: OOM");
                return nullptr;
            }
            p->module         = module;
            p->component      = component;
            p->processor      = processor;
            p->sample_rate    = sample_rate;
            p->max_block_size = max_block_size;
            p->active         = true;
            p->processing     = true;
            set_error("");
            return p;
        }
    }
    set_error("vst3_load: no IAudioProcessor class found in bundle");
    return nullptr;
}

extern "C" void vst3_free(Vst3Plugin* plugin) {
    if (!plugin) return;
    if (plugin->processor && plugin->processing)  plugin->processor->setProcessing(false);
    if (plugin->component && plugin->active)      plugin->component->setActive(false);
    if (plugin->component)                        plugin->component->terminate();
    delete plugin;
}

extern "C" int32_t vst3_process(
    Vst3Plugin* plugin,
    const float* const* inputs, int32_t n_in_channels,
    float* const* outputs, int32_t n_out_channels,
    int32_t n_frames,
    const uint8_t* midi_events, int32_t midi_byte_count,
    int64_t playhead_samples
) {
    if (!plugin || !plugin->processor) {
        set_error("vst3_process: null plugin");
        return -1;
    }

    /* Build AudioBusBuffers for inputs + outputs. Phase 8 assumes mono/stereo
     * main bus — Phase 9 polish adds full bus enumeration.
     */
    AudioBusBuffers inBuses{};
    AudioBusBuffers outBuses{};
    inBuses.numChannels       = n_in_channels;
    inBuses.silenceFlags      = 0;
    inBuses.channelBuffers32  = const_cast<float**>(inputs);
    outBuses.numChannels      = n_out_channels;
    outBuses.silenceFlags     = 0;
    outBuses.channelBuffers32 = outputs;

    ProcessContext ctx{};
    ctx.state        = ProcessContext::kPlaying | ProcessContext::kProjectTimeMusicValid;
    ctx.sampleRate   = plugin->sample_rate;
    ctx.projectTimeSamples = playhead_samples;

    /* MIDI events: decode the packed buffer into IEventList. Keep it
     * minimal for Phase 8 — only note on/off are relayed. Phase 9 adds
     * CC, pitch bend, and aftertouch.
     */
    EventList eventList;
    if (midi_events && midi_byte_count >= 8) {
        const uint8_t* p = midi_events;
        const uint8_t* end = midi_events + midi_byte_count;
        while (p + 8 <= end) {
            uint32_t offset = static_cast<uint32_t>(p[0]) |
                              (static_cast<uint32_t>(p[1]) << 8) |
                              (static_cast<uint32_t>(p[2]) << 16) |
                              (static_cast<uint32_t>(p[3]) << 24);
            uint8_t status = p[4];
            uint8_t data1  = p[5];
            uint8_t data2  = p[6];
            p += 8;
            Event ev{};
            ev.busIndex     = 0;
            ev.sampleOffset = static_cast<int32>(offset);
            ev.ppqPosition  = 0.0;
            ev.flags        = 0;
            if ((status & 0xF0) == 0x90 && data2 > 0) {
                ev.type = Event::kNoteOnEvent;
                ev.noteOn.channel  = status & 0x0F;
                ev.noteOn.pitch    = data1;
                ev.noteOn.velocity = data2 / 127.0f;
                ev.noteOn.length   = 0;
                ev.noteOn.tuning   = 0.0f;
                ev.noteOn.noteId   = -1;
                eventList.addEvent(ev);
            } else if ((status & 0xF0) == 0x80 || ((status & 0xF0) == 0x90 && data2 == 0)) {
                ev.type = Event::kNoteOffEvent;
                ev.noteOff.channel  = status & 0x0F;
                ev.noteOff.pitch    = data1;
                ev.noteOff.velocity = data2 / 127.0f;
                ev.noteOff.noteId   = -1;
                ev.noteOff.tuning   = 0.0f;
                eventList.addEvent(ev);
            }
        }
    }

    ProcessData data{};
    data.processMode            = kRealtime;
    data.symbolicSampleSize     = kSample32;
    data.numSamples             = n_frames;
    data.numInputs              = n_in_channels > 0 ? 1 : 0;
    data.numOutputs             = n_out_channels > 0 ? 1 : 0;
    data.inputs                 = n_in_channels > 0 ? &inBuses : nullptr;
    data.outputs                = &outBuses;
    data.inputEvents            = &eventList;
    data.processContext         = &ctx;

    auto res = plugin->processor->process(data);
    if (res != kResultOk) {
        set_error("vst3_process: process() returned non-OK");
        return -1;
    }
    set_error("");
    return 0;
}

extern "C" int32_t vst3_param_count(Vst3Plugin* plugin) {
    if (!plugin) return 0;
    /* For Phase 8 we only expose process-side params via component; the
     * edit controller path is Phase 9 polish.
     */
    return 0;
}

extern "C" int32_t vst3_param_info(Vst3Plugin* /*plugin*/, int32_t /*idx*/, Vst3ParamInfo* /*out*/) {
    set_error("vst3_param_info: not yet implemented for real SDK");
    return -1;
}

extern "C" int32_t vst3_set_param(Vst3Plugin* /*plugin*/, uint32_t /*param_id*/, double /*normalized*/) {
    set_error("vst3_set_param: not yet implemented for real SDK");
    return -1;
}

extern "C" double vst3_get_param(Vst3Plugin* /*plugin*/, uint32_t /*param_id*/) {
    return 0.0;
}

extern "C" int32_t vst3_get_state(Vst3Plugin* plugin, uint8_t** out_buf, size_t* out_len) {
    if (out_buf) *out_buf = nullptr;
    if (out_len) *out_len = 0;
    set_error("vst3_get_state: not yet implemented for real SDK");
    return -1;
}

extern "C" int32_t vst3_set_state(Vst3Plugin* /*plugin*/, const uint8_t* /*buf*/, size_t /*len*/) {
    set_error("vst3_set_state: not yet implemented for real SDK");
    return -1;
}

extern "C" void vst3_free_buffer(uint8_t* buf) {
    if (buf) std::free(buf);
}

extern "C" int32_t vst3_show_editor(Vst3Plugin* /*plugin*/, void* /*parent_native_view*/) {
    /* Phase 9 polish: create an IPlugView via the edit controller and
     * attach it to `parent_native_view`.
     */
    set_error("vst3_show_editor: not yet implemented (Phase 9)");
    return -1;
}

extern "C" int32_t vst3_hide_editor(Vst3Plugin* /*plugin*/) {
    set_error("vst3_hide_editor: not yet implemented (Phase 9)");
    return -1;
}

#endif /* HAS_VST3_SDK */
