# bridge-vst3

VST3 plugin hosting for Cadenza Bridge via a thin C++ shim and Rust FFI.

## Build modes

### Default (no SDK vendored)

```bash
cargo build -p bridge-vst3
```

This compiles `cpp/vst3_shim.cpp` as a **stub**: every exported
function returns an error and `Vst3Instrument::load` fails with
"SDK not vendored". The `Vst3Factory` serves `SilentVst3Instrument` so
the audio graph still plays silence where a VST3 track would have been.

CI builds take this path.

### Real hosting (SDK vendored)

```bash
# Clone the Steinberg VST3 SDK somewhere outside the repo to avoid
# bloating kuma-lab with ~500 MB.
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git /opt/vst3sdk

# Point the build at it
export VST3_SDK_PATH=/opt/vst3sdk
cargo build -p bridge-vst3
```

`build.rs` detects the environment variable, sets `HAS_VST3_SDK` for
the C++ shim, adds the SDK include paths, and links the minimal SDK
source set needed for hosting (`module.cpp`, `hostclasses.cpp`,
`plugprovider.cpp`, `fstring.cpp`, `funknown.cpp`, and platform
`module_mac.mm`/`module_linux.cpp`/`module_win32.cpp`).

## Modules

- `ffi` — raw `extern "C"` declarations mirroring `cpp/vst3_shim.h`
- `instrument` — `Vst3Instrument : Instrument` (real SDK path)
- `stub` — `SilentVst3Instrument : Instrument` (no-SDK fallback)
- `factory` — `Vst3Factory` resolving plugin ids to boxed instruments
- `scanner` — directory walker for `.vst3` bundles
- `effect` — placeholder `Vst3Effect` for Phase 9

## License

This crate is MIT OR Apache-2.0, matching the rest of the workspace.

When built with `VST3_SDK_PATH` set, the resulting binary links
against the Steinberg VST3 SDK. The SDK is dual-licensed GPL-3 OR
Proprietary Steinberg VST 3 License. Users who enable VST3 hosting
must comply with one of those licenses. Cadenza does not redistribute
the SDK. See `cpp/README.md` for details.

## Status (Phase 8)

- Stub path: complete, tested
- Real path: the C++ hosting skeleton compiles against VST3 SDK
  v3.7.x headers but has not been exercised against a real plugin.
  Parameter changes (`vst3_set_param`), state save/load, and the
  editor window are stubs even in real mode — those complete in
  Phase 9 polish.
