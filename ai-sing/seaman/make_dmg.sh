#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AI_SING_DIR="$(dirname "$SCRIPT_DIR")"
VENV="$AI_SING_DIR/.venv-tts"
DIST="$SCRIPT_DIR/dist"
APP="$DIST/Seaman.app"
DMG="$DIST/Seaman.dmg"
BG_PNG="$DIST/_bg.png"
BG_PNG2X="$DIST/_bg@2x.png"

mkdir -p "$DIST"

echo "Generating background..."
"$VENV/bin/python" "$SCRIPT_DIR/dmg_background.py" "$BG_PNG" "$BG_PNG2X"

echo "Building DMG..."
rm -f "$DMG"
"$VENV/bin/dmgbuild" \
    -s "$SCRIPT_DIR/dmg_settings.py" \
    -D "app=$APP" \
    -D "bg=$BG_PNG" \
    "Seaman" "$DMG"

rm -f "$BG_PNG" "$BG_PNG2X"
echo "=> $DMG ($(du -sh "$DMG" | cut -f1))"
