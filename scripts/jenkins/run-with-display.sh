#!/usr/bin/env bash
# Source .jenkins-display.env and run a command (optionally via xvfb-run).
set -euo pipefail

if [ -f .jenkins-display.env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.jenkins-display.env
  set +a
fi

if [ "${XVFB_RUN:-}" = "1" ] && command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a "$@"
fi

exec "$@"
