#!/bin/bash
# =============================================================================
# vps-audit-findings.sh — AI Review Findings Tracker
#
# Extrae los ❌ y ⚠️ del AI review de la última PR de cada focus,
# los guarda en /var/log/dome-audit-findings/ y los inyecta como contexto
# en la siguiente ejecución del mismo focus.
#
# Llamado automáticamente por vps-audit.sh después de crear la PR.
#
# Usage:
#   bash vps-audit-findings.sh <focus> <pr_number> <repo_slug>
#
# También útil para inspección manual:
#   bash vps-audit-findings.sh --report
# =============================================================================

set -euo pipefail

FINDINGS_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}"
REPO_SLUG="${3:-maxprain12/dome}"
mkdir -p "$FINDINGS_DIR"

# ── Report mode ───────────────────────────────────────────────────────────────
if [ "${1:-}" = "--report" ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Dome Audit — Open Findings"
  echo "═══════════════════════════════════════════════════════"

  TOTAL=0
  for file in "$FINDINGS_DIR"/*.findings; do
    [ -f "$file" ] || continue
    FOCUS=$(basename "$file" .findings)
    COUNT=$(wc -l < "$file" | tr -d ' ')
    [ "$COUNT" -eq 0 ] && continue
    TOTAL=$((TOTAL + COUNT))

    echo ""
    echo "── ${FOCUS} (${COUNT} issues) ──────────────────────────"
    cat "$file"
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

FINDINGS_FILE="$FINDINGS_DIR/${FOCUS}.findings"
PR_LOG="$FINDINGS_DIR/${FOCUS}.history"

echo "[$(date '+%Y-%m-%d %H:%M')] Extracting findings from PR #${PR_NUMBER} (focus: ${FOCUS})" >> "$PR_LOG"

# Fetch AI review body from the PR
REVIEW_BODY=$(gh pr view "$PR_NUMBER" --repo "$REPO_SLUG" --json reviews \
  --jq '.reviews[0].body // ""' 2>/dev/null)

if [ -z "$REVIEW_BODY" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M')] No AI review found for PR #${PR_NUMBER}" >> "$PR_LOG"
  # Clear findings if no review (clean PR)
  > "$FINDINGS_FILE"
  exit 0
fi

# Extract ❌ and ⚠️ lines — skip API errors, truncated lines, think artifacts
NEW_FINDINGS=$(echo "$REVIEW_BODY" \
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
  | head -15)

if [ -z "$NEW_FINDINGS" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M')] No findings (❌/⚠️) in AI review — focus ${FOCUS} is clean" >> "$PR_LOG"
  > "$FINDINGS_FILE"
  exit 0
fi

# Save findings (overwrite — latest run wins)
echo "$NEW_FINDINGS" > "$FINDINGS_FILE"
COUNT=$(echo "$NEW_FINDINGS" | wc -l | tr -d ' ')
echo "[$(date '+%Y-%m-%d %H:%M')] Saved ${COUNT} findings for focus ${FOCUS}" >> "$PR_LOG"
echo "$NEW_FINDINGS" >> "$PR_LOG"
echo "---" >> "$PR_LOG"
