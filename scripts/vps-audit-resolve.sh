#!/bin/bash
# =============================================================================
# vps-audit-resolve.sh — Finding Lifecycle Resolver
#
# Lee todos los <focus>.findings.json en FINDINGS_DIR y, para cada finding con
# status ∈ {open, verifying}, comprueba si el pattern aún aparece en el archivo
# referenciado (rama main del repo local). Si ya no aparece, transiciona a
# status=resolved. Actualiza last_verified_at y proyecta el .findings legacy.
#
# Cron (cada hora):
#   0 * * * * bash /opt/dome-audit/vps-audit-resolve.sh >> /var/log/dome-audit.log 2>&1
#
# También lo invoca vps-audit-findings-cron.sh tras procesar los pending.
# =============================================================================

set -euo pipefail

FINDINGS_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}"
REPO_DIR="${REPO_DIR:-/opt/dome-audit/dome}"
RESOLUTIONS_LOG="$FINDINGS_DIR/resolutions.log"
LOG_PREFIX="[dome-resolve $(date '+%Y-%m-%d %H:%M')]"

mkdir -p "$FINDINGS_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "$LOG_PREFIX Repo not found at $REPO_DIR — skipping" >&2
  exit 0
fi

# Refresh main so we check against latest merged state
(cd "$REPO_DIR" && git fetch --quiet origin main 2>/dev/null && git checkout --quiet main 2>/dev/null && git pull --quiet origin main 2>/dev/null) || true

shopt -s nullglob
FILES=("$FINDINGS_DIR"/*.findings.json)
if [ ${#FILES[@]} -eq 0 ]; then
  echo "$LOG_PREFIX No findings JSON files — nothing to resolve"
  exit 0
fi

for json_path in "${FILES[@]}"; do
  [ -f "$json_path" ] || continue
  FOCUS=$(basename "$json_path" .findings.json)
  LEGACY_PATH="$FINDINGS_DIR/${FOCUS}.findings"

  export FOCUS REPO_DIR json_path RESOLUTIONS_LOG
  python3 - << 'PY'
import json
import os
import subprocess
from datetime import datetime, timezone

focus = os.environ["FOCUS"]
repo = os.environ["REPO_DIR"]
path = os.environ["json_path"]
log_path = os.environ["RESOLUTIONS_LOG"]
now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

try:
    with open(path) as f:
        findings = json.load(f)
except Exception:
    findings = []

if not isinstance(findings, list):
    findings = []

transitions = []

def file_contents(relpath):
    full = os.path.join(repo, relpath)
    if not os.path.exists(full):
        return None
    try:
        with open(full, encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception:
        return None

for f in findings:
    if not isinstance(f, dict):
        continue
    status = f.get("status")
    if status not in ("open", "verifying"):
        continue

    rel = f.get("file", "")
    pattern = f.get("pattern", "")
    if not rel or rel == "unknown" or not pattern:
        # Cannot verify without file/pattern → leave as verifying, do not resolve
        if status == "open":
            f["status"] = "verifying"
            f["verifying_since"] = now
        continue

    content = file_contents(rel)
    if content is None:
        f["status"] = "resolved"
        f["resolved_at"] = now
        f["resolved_reason"] = "file_missing"
        transitions.append((f["id"], "resolved", "file_missing"))
        continue

    if pattern in content:
        if status != "open":
            transitions.append((f["id"], "open", "pattern_present"))
        f["status"] = "open"
        f["last_verified_at"] = now
    else:
        f["status"] = "resolved"
        f["resolved_at"] = now
        f["resolved_reason"] = "pattern_absent"
        transitions.append((f["id"], "resolved", "pattern_absent"))

# Keep resolved for audit trail but never let them grow unbounded — cap at 200 per focus
resolved = [x for x in findings if x.get("status") == "resolved"]
if len(resolved) > 200:
    # Keep only the 200 most recently resolved
    resolved.sort(key=lambda x: x.get("resolved_at", ""), reverse=True)
    keep_ids = {x["id"] for x in resolved[:200]}
    findings = [x for x in findings if x.get("status") != "resolved" or x["id"] in keep_ids]

findings.sort(key=lambda x: (x.get("status"), x.get("file"), x.get("line")))
with open(path, "w") as f:
    json.dump(findings, f, indent=2)

# Append transitions log
if transitions:
    with open(log_path, "a") as logf:
        for fid, new_status, reason in transitions:
            logf.write(f"{now}\t{focus}\t{fid}\t→{new_status}\t{reason}\n")

open_count = sum(1 for x in findings if x.get("status") == "open")
verifying_count = sum(1 for x in findings if x.get("status") == "verifying")
resolved_count = sum(1 for x in findings if x.get("status") == "resolved")
print(f"{focus}: {open_count} open, {verifying_count} verifying, {resolved_count} resolved ({len(transitions)} transitions)")
PY

  # Refresh legacy projection (only open findings)
  python3 -c "
import json
try:
    d = json.load(open('$json_path'))
    for f in d:
        if f.get('status') == 'open':
            print(f.get('body', '').strip())
except Exception:
    pass
" > "$LEGACY_PATH"

done

echo "$LOG_PREFIX Resolution pass complete"
