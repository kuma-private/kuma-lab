# Cadenza Bridge Packaging

Build scripts and installer metadata for distributing the Cadenza Bridge
native companion app.

## macOS

```
cd /Users/kuma/repos/kuma/kuma-lab/cadenza-bridge
source "$HOME/.cargo/env"
./packaging/mac/build.sh
```

Produces `target/release-mac/Cadenza-Bridge-<version>.dmg` — a universal
(arm64 + x86_64) `.app` containing `cadenza-watchdog` and `cadenza-bridge`,
wrapped in a compressed disk image.

Env vars honoured by `build.sh`:

| Name                       | Default | Effect |
| -------------------------- | ------- | ------ |
| `BRIDGE_VERSION`           | `0.1.0` | Used in the DMG filename |
| `MACOS_CODESIGN_IDENTITY`  | *unset* | When set, binaries and `.app` are codesigned |
| `SKIP_DMG`                 | `0`     | Skip the `hdiutil` step when `1` |

After the `.dmg` is built, notarize it with:

```
APPLE_ID=you@example.com \
APPLE_TEAM_ID=ABCDE12345 \
APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
./packaging/mac/notarize.sh target/release-mac/Cadenza-Bridge-0.1.0.dmg
```

Without a codesign identity and notarization the binary still runs; users
will see a Gatekeeper "unidentified developer" warning on first launch and
must right-click → Open.

## Windows

```
cd \path\to\cadenza-bridge
pwsh .\packaging\win\build.ps1
```

Produces `target\release-win\Cadenza-Bridge-<version>.msi` when WiX (`candle`,
`light`) is on PATH, otherwise a `.zip` fallback of the two exes.

Env vars honoured by `build.ps1`:

| Name                       | Default | Effect |
| -------------------------- | ------- | ------ |
| `BRIDGE_VERSION`           | `0.1.0` | Used in the MSI filename and metadata |
| `WINDOWS_CODESIGN_PFX`     | *unset* | Path to signing `.pfx`; triggers `signtool` |
| `WINDOWS_CODESIGN_PASSWORD`| *unset* | Password for the `.pfx` |
| `SKIP_MSI`                 | `0`     | Produce only the staged exes when `1` |

The WiX definition (`installer.wxs`) installs to `%LOCALAPPDATA%\CadenzaBridge`,
writes `HKCU\…\Run\CadenzaBridge` to auto-start the watchdog on login, and adds
a Start Menu shortcut. No elevation needed.

## CI

`.github/workflows/bridge-release.yml` runs on `bridge-v*` tags or
`workflow_dispatch`. It checks out the repo, installs Rust, runs the two
scripts above on macOS and Windows runners, and uploads the artefacts to a
draft GitHub Release. Secrets `MACOS_CODESIGN_IDENTITY`,
`WINDOWS_CODESIGN_PFX`, and `WINDOWS_CODESIGN_PASSWORD` are read from the
repository settings when available.
