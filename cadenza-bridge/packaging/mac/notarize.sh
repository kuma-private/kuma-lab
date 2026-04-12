#!/usr/bin/env bash
# Notarize an already-built, already-codesigned Cadenza Bridge .dmg.
#
# Requires env:
#   APPLE_ID              Apple ID email used for notarytool
#   APPLE_TEAM_ID         10-char team id
#   APPLE_APP_PASSWORD    App-specific password from appleid.apple.com
#
# Usage:
#   ./notarize.sh path/to/Cadenza-Bridge-0.1.0.dmg

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <dmg>" >&2
  exit 1
fi

DMG="$1"

if [[ ! -f "$DMG" ]]; then
  echo "error: $DMG not found" >&2
  exit 1
fi

: "${APPLE_ID:?APPLE_ID not set}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID not set}"
: "${APPLE_APP_PASSWORD:?APPLE_APP_PASSWORD not set}"

echo "[notarize.sh] submitting $DMG"
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --wait

echo "[notarize.sh] stapling"
xcrun stapler staple "$DMG"

echo "[notarize.sh] verifying"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG" || true

echo "[notarize.sh] done"
