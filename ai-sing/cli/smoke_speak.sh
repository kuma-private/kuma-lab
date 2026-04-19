#!/usr/bin/env bash
# Smoke test for the Seaman TTS subprocess. Verifies speak.py --interactive
# can load the model, accept a single request on stdin, and produce a WAV.
# Requires: .venv-tts installed, a reference audio file. Times out at 3min.
set -euo pipefail

AI_SING_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REF_AUDIO="${REF_AUDIO:-$AI_SING_DIR/input/source/source_clip.wav}"
PYTHON="$AI_SING_DIR/.venv-tts/bin/python"
OUT_DIR="$(mktemp -d)"
LOG="$(mktemp -t seaman_smoke.XXXX.log)"
trap 'rm -rf "$OUT_DIR"' EXIT

[ -f "$REF_AUDIO" ] || { echo "SKIP: missing ref audio: $REF_AUDIO"; exit 2; }
[ -x "$PYTHON" ]    || { echo "SKIP: missing venv: $PYTHON"; exit 2; }

mkdir -p "$AI_SING_DIR/tmp"

printf 'smoke.wav こんにちは、スモークテストです\nquit\n' | \
  timeout 180 "$PYTHON" "$AI_SING_DIR/cli/speak.py" \
    --interactive \
    --target "$REF_AUDIO" \
    --output-dir "$OUT_DIR" \
    --ref-text-cache "$AI_SING_DIR/tmp/ref_text.txt" \
  | tee "$LOG"

if [ ! -s "$OUT_DIR/smoke.wav" ]; then
  echo "FAIL: smoke.wav was not produced"
  echo "--- speak.py log ---"
  cat "$LOG"
  exit 1
fi

SIZE=$(stat -f%z "$OUT_DIR/smoke.wav")
echo "OK: $OUT_DIR/smoke.wav (${SIZE} bytes)"
