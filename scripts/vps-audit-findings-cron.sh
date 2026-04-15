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
FINDINGS_SCRIPT="/opt/dome-audit/vps-audit-findings.sh"
LOG_PREFIX="[dome-findings $(date '+%Y-%m-%d %H:%M')]"

[ -d "$PENDING_DIR" ] || exit 0
[ -f "$FINDINGS_SCRIPT" ] || exit 0

for pending in "$PENDING_DIR"/*.pending; do
  [ -f "$pending" ] || continue

  read -r FOCUS PR_NUMBER REPO_SLUG < "$pending"
  [ -z "$PR_NUMBER" ] && { rm -f "$pending"; continue; }

  # Check if AI review has been posted yet
  REVIEW_COUNT=$(gh pr view "$PR_NUMBER" --repo "$REPO_SLUG" \
    --json reviews --jq '.reviews | length' 2>/dev/null)

  if [ "${REVIEW_COUNT:-0}" -eq 0 ]; then
    echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): AI review not posted yet, will retry"
    continue
  fi

  echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): extracting findings..."
  bash "$FINDINGS_SCRIPT" "$FOCUS" "$PR_NUMBER" "$REPO_SLUG"
  rm -f "$pending"
  echo "$LOG_PREFIX PR #${PR_NUMBER} (${FOCUS}): done"
done
