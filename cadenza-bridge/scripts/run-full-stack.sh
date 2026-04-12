#!/usr/bin/env bash
# Runs Cadenza Bridge + F# backend + Svelte frontend together for local manual
# testing. Each process is launched in the background; the script blocks until
# any one of them exits (or the user hits Ctrl-C), at which point all three
# are torn down.
#
# Usage:
#   ./cadenza-bridge/scripts/run-full-stack.sh
#
# Env overrides:
#   CADENZA_BRIDGE_BIND      Bridge WS bind address (default 127.0.0.1:7890)
#   CADENZA_BACKEND_URL      ASPNETCORE_URLS for the backend (default http://localhost:52731)
#   CADENZA_DEV_PREMIUM_UIDS Comma-separated uids treated as premium (default dev-user)
#   JWT_SIGNING_KEY          JWT key (default matches backend DEV_MODE fallback)
#   SKIP_FRONTEND=1          Skip launching `npm run dev`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

BRIDGE_BIND="${CADENZA_BRIDGE_BIND:-127.0.0.1:7890}"
BACKEND_URL="${CADENZA_BACKEND_URL:-http://localhost:52731}"
DEV_PREMIUM_UIDS="${CADENZA_DEV_PREMIUM_UIDS:-dev-user}"
JWT_KEY="${JWT_SIGNING_KEY:-dev-signing-key-at-least-32-chars-long!}"

echo "[run-full-stack] bridge bind = $BRIDGE_BIND"
echo "[run-full-stack] backend url = $BACKEND_URL"

cleanup() {
  echo ""
  echo "[run-full-stack] shutting down..."
  for pid in "${BRIDGE_PID:-}" "${BACKEND_PID:-}" "${FRONTEND_PID:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[run-full-stack] starting cadenza-bridge (headless)"
(
  cd "$ROOT/cadenza-bridge"
  CADENZA_BRIDGE_HEADLESS=1 \
  CADENZA_BRIDGE_BIND="$BRIDGE_BIND" \
  cargo run --quiet --bin cadenza-bridge
) &
BRIDGE_PID=$!

echo "[run-full-stack] starting F# backend (DEV_MODE)"
(
  cd "$ROOT/tamekoma-night/backend/src/TamekomaNight.Api"
  DEV_MODE=true \
  JWT_SIGNING_KEY="$JWT_KEY" \
  CADENZA_DEV_PREMIUM_UIDS="$DEV_PREMIUM_UIDS" \
  ASPNETCORE_URLS="$BACKEND_URL" \
  dotnet run
) &
BACKEND_PID=$!

if [ "${SKIP_FRONTEND:-0}" != "1" ]; then
  echo "[run-full-stack] starting Vite dev server"
  (
    cd "$ROOT/tamekoma-night/frontend"
    npm run dev
  ) &
  FRONTEND_PID=$!
fi

echo "[run-full-stack] all processes launched. Ctrl-C to stop."
wait
