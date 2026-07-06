#!/usr/bin/env bash
# Exit 0 when triage left issues for the fixer (fixCount > 0).
# Missing triage-applied.json → 0 (backward compat / pre-triage runs).
set -euo pipefail

ROOT="${1:-.}"
APPLIED="$ROOT/.quality-loop/triage-applied.json"

if [[ ! -f "$APPLIED" ]]; then
  exit 0
fi

node -e "
const j = require(process.argv[1]);
const n = Number(j.fixCount || 0);
process.exit(n > 0 ? 0 : 1);
" "$APPLIED"
