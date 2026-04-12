#!/usr/bin/env bash
# Build a universal (arm64 + x86_64) Cadenza Bridge .app + .dmg.
#
# Env:
#   MACOS_CODESIGN_IDENTITY   Developer ID Application: ...  (optional)
#   BRIDGE_VERSION            Override bundle version (default 0.1.0)
#   SKIP_DMG=1                Produce only the .app
#
# Without a codesign identity the script still produces an unsigned .app/.dmg;
# users will see a Gatekeeper warning on first launch but the binary will run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BRIDGE_ROOT="$ROOT/cadenza-bridge"
PKG="$BRIDGE_ROOT/packaging/mac"
BUILD="$BRIDGE_ROOT/target/release-mac"
APP="$BUILD/Cadenza Bridge.app"
VERSION="${BRIDGE_VERSION:-0.1.0}"
DMG="$BUILD/Cadenza-Bridge-${VERSION}.dmg"

echo "[build.sh] ROOT=$ROOT"
echo "[build.sh] VERSION=$VERSION"

if ! command -v cargo >/dev/null 2>&1; then
  echo "[build.sh] error: cargo not in PATH. source ~/.cargo/env first." >&2
  exit 1
fi

cd "$BRIDGE_ROOT"

echo "[build.sh] ensuring rust targets installed"
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null

echo "[build.sh] building aarch64 binaries"
cargo build --release --target aarch64-apple-darwin --bin cadenza-bridge
cargo build --release --target aarch64-apple-darwin --bin cadenza-watchdog

echo "[build.sh] building x86_64 binaries"
cargo build --release --target x86_64-apple-darwin --bin cadenza-bridge
cargo build --release --target x86_64-apple-darwin --bin cadenza-watchdog

mkdir -p "$BUILD"

echo "[build.sh] lipo universal binaries"
lipo -create \
  "$BRIDGE_ROOT/target/aarch64-apple-darwin/release/cadenza-bridge" \
  "$BRIDGE_ROOT/target/x86_64-apple-darwin/release/cadenza-bridge" \
  -output "$BUILD/cadenza-bridge"
lipo -create \
  "$BRIDGE_ROOT/target/aarch64-apple-darwin/release/cadenza-watchdog" \
  "$BRIDGE_ROOT/target/x86_64-apple-darwin/release/cadenza-watchdog" \
  -output "$BUILD/cadenza-watchdog"

echo "[build.sh] creating .app bundle"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BUILD/cadenza-bridge" "$APP/Contents/MacOS/cadenza-bridge"
cp "$BUILD/cadenza-watchdog" "$APP/Contents/MacOS/cadenza-watchdog"
cp "$PKG/Info.plist" "$APP/Contents/Info.plist"
chmod +x "$APP/Contents/MacOS/cadenza-bridge" "$APP/Contents/MacOS/cadenza-watchdog"

if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
  echo "[build.sh] codesigning with $MACOS_CODESIGN_IDENTITY"
  codesign --force --options runtime --timestamp \
    --entitlements "$PKG/entitlements.plist" \
    --sign "$MACOS_CODESIGN_IDENTITY" \
    "$APP/Contents/MacOS/cadenza-bridge"
  codesign --force --options runtime --timestamp \
    --entitlements "$PKG/entitlements.plist" \
    --sign "$MACOS_CODESIGN_IDENTITY" \
    "$APP/Contents/MacOS/cadenza-watchdog"
  codesign --force --options runtime --timestamp \
    --entitlements "$PKG/entitlements.plist" \
    --sign "$MACOS_CODESIGN_IDENTITY" \
    "$APP"
  echo "[build.sh] verifying signature"
  codesign --verify --deep --strict --verbose=2 "$APP"
else
  echo "[build.sh] MACOS_CODESIGN_IDENTITY not set — producing unsigned .app"
fi

if [[ "${SKIP_DMG:-0}" == "1" ]]; then
  echo "[build.sh] SKIP_DMG=1 — stopping after .app"
  echo "[build.sh] built $APP"
  exit 0
fi

echo "[build.sh] building .dmg"
rm -f "$DMG"
hdiutil create \
  -volname "Cadenza Bridge" \
  -srcfolder "$APP" \
  -ov \
  -format UDZO \
  "$DMG"

if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
  codesign --force --sign "$MACOS_CODESIGN_IDENTITY" "$DMG"
fi

SIZE=$(stat -f%z "$DMG" 2>/dev/null || wc -c <"$DMG")
echo "[build.sh] done: $DMG ($SIZE bytes)"
