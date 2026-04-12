# Cadenza Bridge

Native companion app for Cadenza.fm. Hosts audio plugins (CLAP/VST3 in later phases) and bridges them to the web DAW via a local WebSocket.

Phase 0 provides:

- A WebSocket server on `ws://localhost:7890`
- `handshake` command returning bridge version + capabilities
- `debug.sine` command that plays a 440 Hz sine wave through the default output device
- A menu bar icon on macOS / system tray icon on Windows

## Build / run

```sh
cargo build
cargo run --bin cadenza-bridge
```

## Tests

```sh
cargo test
cargo clippy -- -D warnings
```

## macOS: no Dock icon

The binary acts as a menu bar (accessory) app. Instead of shipping a `Info.plist` with `LSUIElement=true`, the app calls `NSApplication.setActivationPolicy(.accessory)` at startup via `objc2` / `objc2-app-kit`. This lets `cargo run` Just Work during development without any bundle wrapping.

When the app is later packaged as an `.app` bundle for distribution, a proper `Info.plist` with `LSUIElement=true` can be added, but the runtime call remains harmless.

## Protocol (Phase 0)

Request (browser -> bridge):

```json
{ "kind": "request", "id": "1", "command": { "type": "handshake", "version": "0.1" } }
```

Response (bridge -> browser):

```json
{ "id": "1", "kind": "response", "ok": true, "result": { "bridgeVersion": "0.1.0", "capabilities": ["audio","debug"], "updateAvailable": false } }
```

Start / stop the sine:

```json
{ "kind": "request", "id": "2", "command": { "type": "debug.sine", "on": true } }
{ "kind": "request", "id": "3", "command": { "type": "debug.sine", "on": false } }
```
