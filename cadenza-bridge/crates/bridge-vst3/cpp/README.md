# bridge-vst3 C++ shim

This directory contains a small (~300 LOC) C++ shim that wraps the
Steinberg VST3 SDK's hosting interfaces behind a flat `extern "C"`
surface the Rust side can FFI into.

## Files

- `vst3_shim.h` — extern "C" header. Opaque `Vst3Plugin*` plus a handful
  of functions (`vst3_load`, `vst3_process`, `vst3_set_param`, …). No
  Steinberg symbols leak through.
- `vst3_shim.cpp` — implementation with two compile modes:
  - `HAS_VST3_SDK` undefined: every function returns -1 with a clear
    error from `vst3_last_error()`. Used by CI and any build without a
    vendored SDK.
  - `HAS_VST3_SDK` defined: real VST3 hosting via `module::Module`,
    `IComponent`, `IAudioProcessor`.

The decision of which mode to compile is made in the crate's `build.rs`
based on the `VST3_SDK_PATH` environment variable.

## License

- **The shim code itself (this directory)** is MIT/Apache-2.0, matching
  the rest of the cadenza-bridge workspace.
- **The Steinberg VST3 SDK** is dual-licensed under GPL-3 OR a
  proprietary Steinberg VST 3 License. See
  <https://www.steinberg.net/developers/> for the current agreement.

A binary built with `VST3_SDK_PATH` set links against the SDK and
therefore inherits one of those two license obligations. Cadenza does
not redistribute the SDK; users who enable VST3 hosting must either:

1. Accept the proprietary Steinberg license and sign Steinberg's VST
   developer agreement, or
2. Rebuild under GPL-3 terms and distribute their own binary accordingly.

CI builds in this repository **do not vendor the SDK** and therefore do
not trigger either obligation. The default `cargo build` path compiles
only the stub functions in this file, which are pure MIT/Apache-2.0.

## Vendoring the SDK locally

```bash
# Anywhere outside the repo (to keep the 500 MB out of git)
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git /opt/vst3sdk

# Then build cadenza-bridge with the env var set
export VST3_SDK_PATH=/opt/vst3sdk
cargo build -p bridge-vst3
```

`build.rs` sets `HAS_VST3_SDK` and adds the needed include paths
automatically. If the directory doesn't contain a `pluginterfaces/`
subtree the build panics with a clear error.

## Notes for Phase 8 reviewers

The real-mode hosting code in `vst3_shim.cpp` is **not** exercised by
the test suite (CI has no SDK). It is written defensively and compiles
against the v3.7.x SDK API, but the first time you run it against an
actual plugin you will probably find at least one mismatch. The stub
mode is what Phase 8 ships; the real mode is "ready to enable" once a
developer opts in to the SDK license.
