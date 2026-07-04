#!/usr/bin/env bash
# Verify Electron binary and Linux shared libraries (after pnpm rebuild electron).
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

if [ ! -d node_modules/electron ]; then
  echo "ERROR: node_modules/electron missing — run pnpm rebuild electron first"
  exit 1
fi

ELECTRON="$(node -p "require('electron')")"
echo "Electron binary: ${ELECTRON}"

if [ "$(uname -s)" = "Linux" ] && command -v ldd >/dev/null 2>&1; then
  missing="$(ldd "$ELECTRON" 2>&1 | grep 'not found' || true)"
  if [ -n "$missing" ]; then
    echo "ERROR: Electron missing shared libraries (install via bootstrap-agent-tools.sh / apt):"
    echo "$missing"
    exit 1
  fi
fi

"$ELECTRON" --version
echo "OK: Electron runtime ready"
