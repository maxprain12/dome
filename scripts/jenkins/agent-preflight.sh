#!/usr/bin/env bash
# Jenkins agent preflight for dome-quality-loop (Linux).
# Bootstraps missing tools, validates CLI, prepares virtual display for Electron.
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

if [ -f .jenkins-tools.env ]; then
  # shellcheck disable=SC1091
  set -a
  source ./.jenkins-tools.env
  set +a
fi

ENV_FILE=".jenkins-display.env"
: > "$ENV_FILE"

echo "=== Jenkins agent preflight ==="
echo "uname: $(uname -a)"

bash scripts/jenkins/bootstrap-agent-tools.sh "$ROOT"

if [ -f .jenkins-tools.env ]; then
  # shellcheck disable=SC1091
  set -a
  source ./.jenkins-tools.env
  set +a
fi

for tool in git curl gh; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "OK: $tool → $($tool --version 2>&1 | head -1)"
  else
    echo "ERROR: required tool not found after bootstrap: $tool"
    exit 1
  fi
done

if [ -n "${GITHUB_TOKEN:-}" ]; then
  bash scripts/jenkins/gh-auth-env.sh
fi

XVFB_DISPLAY="${XVFB_DISPLAY:-:99}"

if [ -n "${DISPLAY:-}" ] && command -v xdpyinfo >/dev/null 2>&1 && xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
  echo "OK: DISPLAY=$DISPLAY (already active)"
  echo "DISPLAY=$DISPLAY" >> "$ENV_FILE"
elif command -v Xvfb >/dev/null 2>&1; then
  if ! pgrep -f "[X]vfb ${XVFB_DISPLAY}" >/dev/null 2>&1; then
    echo "Starting Xvfb on ${XVFB_DISPLAY}..."
    Xvfb "$XVFB_DISPLAY" -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
    sleep 2
  fi
  if command -v xdpyinfo >/dev/null 2>&1 && xdpyinfo -display "$XVFB_DISPLAY" >/dev/null 2>&1; then
    echo "OK: Xvfb ready on ${XVFB_DISPLAY}"
    echo "DISPLAY=${XVFB_DISPLAY}" >> "$ENV_FILE"
  else
    echo "WARN: Xvfb started but display ${XVFB_DISPLAY} not reachable"
  fi
elif command -v xvfb-run >/dev/null 2>&1; then
  echo "OK: xvfb-run available (fallback for Electron)"
  echo "XVFB_RUN=1" >> "$ENV_FILE"
else
  echo "WARN: neither Xvfb nor xvfb-run found — Electron harness may fail"
fi

echo "=== Preflight complete ==="
