#!/bin/bash
# =============================================================================
# vps-audit-findings.sh — AI Review Findings Tracker (structured)
#
# Extrae los ❌ y ⚠️ del AI review de la última PR de cada focus y los guarda
# como JSON estructurado en /var/log/dome-audit-findings/<focus>.findings.json
# (con una proyección .findings legacy para compatibilidad).
#
# Cada finding tiene un id estable <focus>:<file>:<line>:<sha1(pattern)> que
# permite:
#   - Upsert entre corridas (no se duplican, se actualiza last_seen_at)
#   - Transición a status="verifying" cuando ya no aparecen en el último review
#   - Transición a status="resolved" por vps-audit-resolve.sh al desaparecer
#     del árbol actual de main
#
# Usage:
#   bash vps-audit-findings.sh <focus> <pr_number> [repo_slug] [prompt_version]
#   bash vps-audit-findings.sh --report
# =============================================================================

set -euo pipefail

FINDINGS_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}"
REPO_SLUG="${3:-maxprain12/dome}"
PROMPT_VERSION="${4:-}"
mkdir -p "$FINDINGS_DIR"

# ── Report mode ───────────────────────────────────────────────────────────────
if [ "${1:-}" = "--report" ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Dome Audit — Open Findings"
  echo "═══════════════════════════════════════════════════════"

  TOTAL=0
  for file in "$FINDINGS_DIR"/*.findings.json; do
    [ -f "$file" ] || continue
    FOCUS=$(basename "$file" .findings.json)
    COUNT=$(python3 -c "import sys,json; d=json.load(open('$file')); print(sum(1 for f in d if f.get('status')=='open'))" 2>/dev/null || echo 0)
    [ "$COUNT" -eq 0 ] && continue
    TOTAL=$((TOTAL + COUNT))

    echo ""
    echo "── ${FOCUS} (${COUNT} open) ──────────────────────────"
    python3 -c "
import json
d = json.load(open('$file'))
for f in d:
    if f.get('status') == 'open':
        print(f.get('body', '').strip())
" 2>/dev/null || true
  done

  if [ "$TOTAL" -eq 0 ]; then
    echo "  ✓ Sin findings abiertos"
  else
    echo ""
    echo "  Total: ${TOTAL} issues sin resolver"
  fi
  echo "═══════════════════════════════════════════════════════"
  echo ""
  exit 0
fi

# ── Extract findings from a PR ────────────────────────────────────────────────
FOCUS="${1:-}"
PR_NUMBER="${2:-}"

if [ -z "$FOCUS" ] || [ -z "$PR_NUMBER" ]; then
  echo "Usage: $0 <focus> <pr_number> [repo_slug]"
  echo "       $0 --report"
  exit 1
fi

FINDINGS_JSON="$FINDINGS_DIR/${FOCUS}.findings.json"
FINDINGS_LEGACY="$FINDINGS_DIR/${FOCUS}.findings"
PR_LOG="$FINDINGS_DIR/${FOCUS}.history"

echo "[$(date '+%Y-%m-%d %H:%M')] Extracting findings from PR #${PR_NUMBER} (focus: ${FOCUS})" >> "$PR_LOG"

# Fetch AI review body from the PR (legacy format — ai-review.mjs pre-v2
# inlined findings in the body; the new version leaves only a summary table
# there and puts findings as line-level comments on the diff).
REVIEW_BODY=$(gh pr view "$PR_NUMBER" --repo "$REPO_SLUG" --json reviews \
  --jq '[.reviews[].body] | join("\n") // ""' 2>/dev/null || echo "")

# Fetch line-level comments from the PR and reformat each into the same
# `❌/⚠️ **path:line** - body` shape the parser below already understands.
# This is how ai-review.mjs (v2+) publishes findings.
LINE_COMMENT_LINES=$(gh api "repos/${REPO_SLUG}/pulls/${PR_NUMBER}/comments" --paginate \
  --jq '
    .[]
    | select(.body | test("^(❌|⚠️)"))
    | (.body | split("\n")[0]) as $first
    | ($first | sub("^(❌|⚠️)\\s*"; "")) as $rest
    | (if ($first | test("^❌")) then "❌" else "⚠️" end) as $sev
    | $sev + " **" + .path + ":" + ((.line // .original_line // 0) | tostring) + "** - " + $rest
  ' 2>/dev/null || echo "")

# Also save the raw line-comments JSON so the python parser can look up each
# finding's commit_id and fetch the exact source line from that commit.
# Needed to populate `pattern` — without it the resolver can't auto-resolve
# findings whose body doesn't contain backticked code.
LINE_COMMENTS_JSON_FILE=$(mktemp /tmp/findings-comments-XXXXXX.json)
gh api "repos/${REPO_SLUG}/pulls/${PR_NUMBER}/comments" --paginate \
  --jq '[.[] | select(.body | test("^(❌|⚠️)")) | {path, line: (.line // .original_line // 0), commit_id, body}]' \
  > "$LINE_COMMENTS_JSON_FILE" 2>/dev/null || echo '[]' > "$LINE_COMMENTS_JSON_FILE"

# Merge body + line comments, then filter noise.
NEW_LINES=$(printf '%s\n%s\n' "$REVIEW_BODY" "$LINE_COMMENT_LINES" \
  | grep -E "^❌|^⚠️" \
  | grep -v "Review failed" \
  | grep -v "API error" \
  | grep -v "overloaded_error" \
  | grep -v "server_erro" \
  | grep -v "http_code" \
  | grep -v "request_id" \
  | grep -v '</think>' \
  | grep -v '{"type"' \
  | sed 's/<\/think>//' \
  | awk 'length($0) > 20' \
  | sort -u \
  | head -30 || true)

# ── Build the new set of findings as JSON ────────────────────────────────────
# A python parser handles the upsert logic. It reads the current JSON file
# (or []) and merges the new review lines by stable id. Findings seen in this
# run are marked status=open; previously-open findings NOT seen are marked
# status=verifying (candidates for resolution in vps-audit-resolve.sh).

NEW_LINES_FILE=$(mktemp /tmp/findings-lines-XXXXXX.txt)
printf '%s\n' "$NEW_LINES" > "$NEW_LINES_FILE"
export FOCUS PR_NUMBER FINDINGS_JSON PROMPT_VERSION NEW_LINES_FILE LINE_COMMENTS_JSON_FILE REPO_SLUG
python3 <<'PY'
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

focus = os.environ["FOCUS"]
pr_number = int(os.environ["PR_NUMBER"])
json_path = os.environ["FINDINGS_JSON"]
prompt_version = os.environ.get("PROMPT_VERSION", "").strip() or None
repo_slug = os.environ.get("REPO_SLUG", "")
now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

with open(os.environ["NEW_LINES_FILE"]) as _f:
    raw = _f.read().strip()
new_lines = [l for l in raw.splitlines() if l.strip()]

# Load line-comment JSON so we can look up commit_id per (path, line).
# Used to fetch the real source line when the finding body has no backticked
# code — the resolver needs a concrete pattern to match against main.
commit_id_by_pathline = {}
try:
    with open(os.environ["LINE_COMMENTS_JSON_FILE"]) as _f:
        for c in json.load(_f):
            key = (c.get("path", ""), int(c.get("line") or 0))
            if c.get("commit_id"):
                commit_id_by_pathline[key] = c["commit_id"]
except (FileNotFoundError, json.JSONDecodeError, KeyError):
    pass

_file_cache = {}

def fetch_file(path, commit_id):
    """Fetch a file's contents at a specific commit via gh api. Cached."""
    if not path or not commit_id or not repo_slug:
        return None
    key = (path, commit_id)
    if key in _file_cache:
        return _file_cache[key]
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/{repo_slug}/contents/{path}?ref={commit_id}",
             "--jq", ".content"],
            capture_output=True, text=True, timeout=15, check=True,
        ).stdout.strip()
        content = base64.b64decode(out).decode("utf-8", errors="replace")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
        content = None
    _file_cache[key] = content
    return content

def fetch_line(path, line_no, commit_id):
    content = fetch_file(path, commit_id)
    if not content:
        return ""
    lines = content.splitlines()
    if 1 <= line_no <= len(lines):
        snippet = lines[line_no - 1].strip()
        return snippet[:200]
    return ""

# Load existing
try:
    with open(json_path) as f:
        existing = json.load(f)
    if not isinstance(existing, list):
        existing = []
except (FileNotFoundError, json.JSONDecodeError):
    existing = []

by_id = {f["id"]: f for f in existing if isinstance(f, dict) and "id" in f}

# File/line extractor. Matches:
#   ❌ **files.cjs**: ...
#   ❌ **files.cjs line 41**: ...
#   ❌ **layout.ts:7,13** - ...
#   ❌ **NoteWorkspaceClient.tsx:139** - ...
#   ⚠️  **plugins.cjs & sync.cjs**: ...   (multi-file; take first)
FILE_RE = re.compile(
    r"\*\*([A-Za-z0-9_\-./]+\.[A-Za-z]+)"
    r"(?:\s+line\s+(\d+)|:(\d+)(?:,\d+)?)?"
    r"(?:\s*&\s*[^*]+)?\*\*"
)
PATTERN_RE = re.compile(r"`([^`]+)`")

def parse_line(line):
    severity = "error" if line.startswith("❌") else "warn"
    mfile = FILE_RE.search(line)
    if mfile:
        file = mfile.group(1)
        line_no = mfile.group(2) or mfile.group(3) or "0"
    else:
        file = "unknown"
        line_no = "0"
    # Extract the most specific pattern we can — prefer backticked code snippets.
    # If absent, leave pattern empty so the resolver won't mis-resolve based on
    # free-form prose that never matches file contents.
    mpat = PATTERN_RE.search(line)
    pattern = mpat.group(1).strip() if mpat else ""
    # Fallback: fetch the real source line at review time from the PR commit,
    # so the resolver has something concrete to grep against main.
    if not pattern and file != "unknown":
        try:
            ln_int = int(line_no)
        except ValueError:
            ln_int = 0
        commit_id = commit_id_by_pathline.get((file, ln_int))
        if commit_id and ln_int > 0:
            pattern = fetch_line(file, ln_int, commit_id)
    # Fingerprint uses pattern if available, else the whole body (stable id)
    fp_src = pattern if pattern else line
    h = hashlib.sha1(fp_src.encode("utf-8")).hexdigest()[:8]
    fid = f"{focus}:{file}:{line_no}:{h}"
    return {
        "id": fid,
        "focus": focus,
        "file": file,
        "line": int(line_no) if line_no.isdigit() else 0,
        "pattern": pattern,
        "severity": severity,
        "body": line,
    }

seen_ids = set()
for line in new_lines:
    f = parse_line(line)
    seen_ids.add(f["id"])
    if f["id"] in by_id:
        prev = by_id[f["id"]]
        prev["last_seen_at"] = now
        prev["status"] = "open"
        prev["severity"] = f["severity"]
        prev["body"] = f["body"]
        if prompt_version:
            prev["last_seen_prompt_version"] = prompt_version
    else:
        f["first_seen_pr"] = pr_number
        f["first_seen_at"] = now
        f["last_seen_at"] = now
        f["status"] = "open"
        if prompt_version:
            f["first_seen_prompt_version"] = prompt_version
            f["last_seen_prompt_version"] = prompt_version
        by_id[f["id"]] = f

# Findings not seen this run → verifying (unless already resolved)
for fid, f in by_id.items():
    if fid not in seen_ids and f.get("status") == "open":
        f["status"] = "verifying"
        f["verifying_since"] = now

# If the review body was totally empty (no lines at all), mark all open as verifying
if not new_lines:
    for f in by_id.values():
        if f.get("status") == "open":
            f["status"] = "verifying"
            f["verifying_since"] = now

out = sorted(by_id.values(), key=lambda x: (x.get("status"), x.get("file"), x.get("line")))

with open(json_path, "w") as f:
    json.dump(out, f, indent=2)

open_count = sum(1 for f in out if f.get("status") == "open")
verifying_count = sum(1 for f in out if f.get("status") == "verifying")
print(f"{open_count} {verifying_count} {len(new_lines)}")
PY
rm -f "$NEW_LINES_FILE"

# Parse python output (last line: "<open> <verifying> <new>")
STATS=$(python3 -c "
import json
try:
    d = json.load(open('$FINDINGS_JSON'))
    o = sum(1 for f in d if f.get('status') == 'open')
    v = sum(1 for f in d if f.get('status') == 'verifying')
    r = sum(1 for f in d if f.get('status') == 'resolved')
    print(o, v, r)
except Exception:
    print('0 0 0')
")
read -r OPEN_COUNT VERIFYING_COUNT RESOLVED_COUNT <<< "$STATS"

# Legacy projection — one line per open finding (for older dashboard code)
python3 -c "
import json
try:
    d = json.load(open('$FINDINGS_JSON'))
    for f in d:
        if f.get('status') == 'open':
            print(f.get('body', '').strip())
except Exception:
    pass
" > "$FINDINGS_LEGACY"

echo "[$(date '+%Y-%m-%d %H:%M')] PR #${PR_NUMBER} (${FOCUS}): ${OPEN_COUNT} open, ${VERIFYING_COUNT} verifying, ${RESOLVED_COUNT} resolved" >> "$PR_LOG"
echo "---" >> "$PR_LOG"
