#!/bin/bash
# =============================================================================
# vps-audit-findings-cron.sh — Findings extractor cron runner
#
# Runs every 30 minutes. Picks up .pending jobs left by vps-audit.sh,
# waits for the AI review to be posted on the PR, then extracts findings.
#
# Cron:
#   */30 * * * * bash /opt/dome-audit/vps-audit-findings-cron.sh >> /var/log/dome-audit.log 2>&1
# =============================================================================

PENDING_DIR="/var/log/dome-audit-findings/pending"
FAILED_DIR="/var/log/dome-audit-findings/failed"
FINDINGS_SCRIPT="/opt/dome-audit/vps-audit-findings.sh"
RESOLVE_SCRIPT="/opt/dome-audit/vps-audit-resolve.sh"
LOG_PREFIX="[dome-findings $(date '+%Y-%m-%d %H:%M')]"
STALE_AGE_SECONDS="${STALE_AGE_SECONDS:-86400}"  # 24h

[ -d "$PENDING_DIR" ] || exit 0
[ -f "$FINDINGS_SCRIPT" ] || exit 0
mkdir -p "$FAILED_DIR"

NOW=$(date +%s)
PROCESSED=0
for pending in "$PENDING_DIR"/*.pending; do
  [ -f "$pending" ] || continue

  read -r FOCUS PR_NUMBER REPO_SLUG PROMPT_VERSION < "$pending"
  [ -z "$PR_NUMBER" ] && { rm -f "$pending"; continue; }

  # Check if AI review has been posted yet
  REVIEW_COUNT=$(gh pr view "$PR_NUMBER" --repo "$REPO_SLUG" \
    --json reviews --jq '.reviews | length' 2>/dev/null)

  if [ "${REVIEW_COUNT:-0}" -eq 0 ]; then
    # Age-out: if ai-review.mjs never posted within STALE_AGE_SECONDS,
    # move the job to failed/ so it doesn't block the queue forever.
    FILE_MTIME=$(stat -c %Y "$pending" 2>/dev/null || echo "$NOW")
    AGE=$((NOW - FILE_MTIME))
    if [ "$AGE" -gt "$STALE_AGE_SECONDS" ]; then
      echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): stale after ${AGE}s — moving to failed/"
      mv "$pending" "$FAILED_DIR/$(basename "$pending").$(date +%Y%m%d-%H%M%S)"
      continue
    fi
    echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): AI review not posted yet (age=${AGE}s), will retry"
    continue
  fi

  echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): extracting findings (prompt=${PROMPT_VERSION:-unknown})..."
  bash "$FINDINGS_SCRIPT" "$FOCUS" "$PR_NUMBER" "$REPO_SLUG" "${PROMPT_VERSION:-}"
  rm -f "$pending"
  PROCESSED=$((PROCESSED + 1))
  echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): done"
done

# After processing any new findings, re-verify the whole set against main
# so stale findings (already fixed) get marked resolved.
if [ -f "$RESOLVE_SCRIPT" ]; then
  if [ "$PROCESSED" -gt 0 ] || [ "${FORCE_RESOLVE:-0}" = "1" ]; then
    echo "$LOG_PREFIX Running resolution pass..."
    bash "$RESOLVE_SCRIPT" || echo "$LOG_PREFIX Resolve pass failed (non-fatal)"
  fi
fi
