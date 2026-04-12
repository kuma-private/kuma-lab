# bridge-clap

CLAP plugin support for the Cadenza Bridge.

## What this crate does

- Scans the OS's standard CLAP install directories (`scanner.rs`)
- Loads `.clap` bundles via raw `clap-sys` FFI (`plugin.rs`)
- Exposes a `ClapFactory` used by the audio graph to instantiate real
  CLAP plugins on project load (`factory.rs`)

On load failure the factory falls back to `SilentInstrument` and logs a
warning, so a missing or broken plugin never crashes the bridge — the
affected track just goes silent.

## CLAP install paths

| OS      | Location                                               |
|---------|--------------------------------------------------------|
| macOS   | `~/Library/Audio/Plug-Ins/CLAP`, `/Library/Audio/Plug-Ins/CLAP` |
| Linux   | `~/.clap`, `/usr/lib/clap`, `/usr/local/lib/clap`      |
| Windows | `%COMMONPROGRAMFILES%/CLAP`, `%LOCALAPPDATA%/Programs/Common/CLAP` |

## Testing with a real plugin

The smoke test `loads_surge_xt_and_produces_sound` exercises the full
load-activate-process path against a real plugin. It is `#[ignore]`'d by
default because it requires the plugin to be installed locally. To run it:

1. Install [Surge XT](https://surge-synthesizer.github.io/) — it's free,
   CLAP-compliant, and exists in standard install paths on all three OSes.
2. From the workspace root:

   ```sh
   cd cadenza-bridge
   cargo test -p bridge-clap loads_surge_xt_and_produces_sound -- --ignored --nocapture
   ```

   The test triggers middle C, renders ~11 blocks of stereo audio, and
   asserts the peak sample is > 0.001. If you hear "expected non-silent
   output, got peak 0" the plugin either didn't activate or is waiting
   for parameter init that the stub host doesn't provide.

Any CLAP-compliant synth will work — just point the test at a different
path if you prefer Vital, Dexed CLAP, etc.

## Limitations (Phase 8.5)

- Only the **first sub-plugin** (`plugin_index = 0`) in a multi-plugin
  `.clap` is instantiated. Multi-plugin bundles (rare outside Surge's
  effects) need enumeration work in the scanner.
- Host extensions return `null` for every query. Plugins that hard-depend
  on log / thread-check / audio-ports-config extensions may fail to init.
  This is a deliberate minimum-viable implementation.
- No parameter automation: CLAP param events are not forwarded yet. The
  frontend's automation lanes still drive built-in inserts, but a CLAP
  filter sweep won't wire through until Phase 9.
- No plugin editor: `chain.showEditor` still produces the placeholder.

## Premium gating (production)

Hosting real CLAP plugins is a **Premium** feature in shipping Cadenza.fm
builds — the bridge's network command handlers check
`state.entitlements().is_premium()` before loading user-supplied bundles
on non-dev builds. Dev / test builds bypass this check.
