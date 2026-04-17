#!/bin/bash
# =============================================================================
# vps-audit-chain.sh — Chained Audit Orchestrator
#
# Runs multiple audit focuses sequentially. After each focus runs, its
# findings are extracted into a compact context block that is fed to the
# next agent via vps-audit.sh --chain-context <path>.
#
# The downstream agent sees upstream findings and can:
#   - Avoid duplicating fixes that upstream already addressed
#   - Pick up TODOs upstream left in its own focus
#   - Cross-reference overlapping issues
#
# Usage:
#   ./scripts/vps-audit-chain.sh security,errors,types
#   ./scripts/vps-audit-chain.sh security errors types
#
# Each step's PR is created independently (one PR per focus, same chain ID
# logged so they can be correlated). The chain stops if any step fails.
#
# Cron (daily at 4am, runs security → errors → types together):
#   0 4 * * * /opt/dome-audit/scripts/vps-audit-chain.sh security,errors,types \
#     >> /var/log/dome-audit.log 2>&1
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_SCRIPT="${AUDIT_SCRIPT:-$SCRIPT_DIR/vps-audit.sh}"
FINDINGS_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}"
CHAIN_LOG="${CHAIN_LOG:-/var/log/dome-audit.log}"

# ── Parse args ────────────────────────────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "Usage: $0 <focus1,focus2,focus3>"
  echo "       $0 focus1 focus2 focus3"
  echo ""
  echo "Example: $0 security,errors,types"
  exit 1
fi

# Accept either comma-separated or space-separated
RAW_INPUT="$*"
FOCUSES=$(echo "$RAW_INPUT" | tr ',' ' ' | tr -s ' ')

CHAIN_ID="chain-$(date +%Y%m%d-%H%M%S)-$$"
TMP_DIR=$(mktemp -d /tmp/audit-chain-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

log() {
  echo "[dome-chain $CHAIN_ID $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Starting chained audit: $FOCUSES"

# ── Build compact context from a focus's findings file ───────────────────────
# Output format (markdown): each upstream focus section with top open findings.
build_chain_context() {
  local context_file="$1"
  shift
  local completed=("$@")

  : > "$context_file"

  if [ ${#completed[@]} -eq 0 ]; then
    return 0
  fi

  python3 - "$context_file" "$FINDINGS_DIR" "${completed[@]}" << 'PY'
import json
import sys
from pathlib import Path

out_path = Path(sys.argv[1])
findings_dir = Path(sys.argv[2])
focuses = sys.argv[3:]

lines = []
for focus in focuses:
    f = findings_dir / f"{focus}.findings.json"
    if not f.exists():
        continue
    try:
        data = json.loads(f.read_text())
    except Exception:
        continue
    open_items = [x for x in data if isinstance(x, dict) and x.get("status") == "open"]
    if not open_items:
        continue
    lines.append(f"#### {focus} ({len(open_items)} open)")
    lines.append("")
    # Top 10 by severity (error first) then file
    sev_rank = {"error": 0, "warn": 1}
    open_items.sort(key=lambda x: (sev_rank.get(x.get("severity"), 2), x.get("file", ""), x.get("line", 0)))
    for item in open_items[:10]:
        sev = item.get("severity", "warn")
        sev_icon = "❌" if sev == "error" else "⚠️"
        file_ref = item.get("file", "unknown")
        line_ref = item.get("line") or 0
        loc = f"{file_ref}" + (f":{line_ref}" if line_ref else "")
        body = (item.get("body") or "").strip()
        body = body.replace("\n", " ")
        if len(body) > 240:
            body = body[:237] + "..."
        lines.append(f"- {sev_icon} `{loc}` — {body}")
    remaining = len(open_items) - 10
    if remaining > 0:
        lines.append(f"- …and {remaining} more (see `{focus}.findings.json`)")
    lines.append("")

out_path.write_text("\n".join(lines) if lines else "_No open findings from upstream focuses._\n")
PY
}

# ── Run each focus, building context from upstream findings ──────────────────
COMPLETED=()
STEP=0
TOTAL=$(echo "$FOCUSES" | wc -w | tr -d ' ')

for focus in $FOCUSES; do
  STEP=$((STEP + 1))
  log "Step $STEP/$TOTAL: focus=$focus"

  CTX_FILE="$TMP_DIR/chain-context-${focus}.md"
  if [ "${#COMPLETED[@]}" -gt 0 ]; then
    build_chain_context "$CTX_FILE" "${COMPLETED[@]}"
  else
    : > "$CTX_FILE"
  fi

  AUDIT_ARGS=(--focus "$focus")
  if [ -s "$CTX_FILE" ] && [ "${#COMPLETED[@]}" -gt 0 ]; then
    AUDIT_ARGS+=(--chain-context "$CTX_FILE")
    log "  chain-context: $(wc -l < "$CTX_FILE" | tr -d ' ') lines from ${COMPLETED[*]}"
  fi

  if ! bash "$AUDIT_SCRIPT" "${AUDIT_ARGS[@]}"; then
    log "  ❌ Step failed: focus=$focus — stopping chain"
    exit 1
  fi

  COMPLETED+=("$focus")
  log "  ✓ Step complete: focus=$focus"
done

log "Chain complete — ${#COMPLETED[@]} focus(es) ran successfully"
