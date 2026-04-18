#!/bin/bash
# =============================================================================
# vps-pr-review.sh — VPS-hosted AI PR review
#
# Replaces the GitHub Actions workflow `.github/workflows/ai-review.yml`.
# Runs periodically from cron, polls open PRs, and invokes
# `scripts/ai-review.mjs` for each PR that has not yet been reviewed at its
# current HEAD SHA.
#
# Why this exists (not just CI):
#   - GitHub Actions has a strict job timeout; large PRs (PR #68: 53 files,
#     420 KB diff) blew through the 3-pass × 52-file window.
#   - GitHub's secondary rate limit fired when auto-merge + project-sync +
#     the review POST all created content in the same minute. Posting a
#     single review body hit a 403 with no visible error to the user.
#   - Running on the VPS lets us (a) share the OpenCode/MiniMax credentials
#     already provisioned for audits, (b) retry on rate limits with proper
#     Retry-After backoff, (c) dedupe per-SHA so we don't double-review.
#
# State:
#   /var/log/dome-audit-findings/pr-reviews/<pr>-<sha>.done — dedupe marker
#   /var/run/dome-pr-review.lock                              — flock
#
# Env:
#   REPO_DIR        default: /opt/dome-audit/dome
#   REPO_SLUG       default: maxprain12/dome
#   MINIMAX_API_KEY (required) — pulled from opencode auth.json by default
#   GH_TOKEN        (required) — or gh CLI already authenticated
#
# Exit codes: always 0 unless wrapper is broken. Per-PR failures are logged
# but do not abort the whole run; the next cron tick retries (marker is only
# written on success).
# =============================================================================

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/dome-audit/dome}"
REPO_SLUG="${REPO_SLUG:-maxprain12/dome}"
STATE_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}/pr-reviews"
LOCK_FILE="${LOCK_FILE:-/var/run/dome-pr-review.lock}"
LOG_PREFIX="[dome-pr-review $(date '+%Y-%m-%d %H:%M')]"

# Skip these PR authors (don't review our own bot's PRs — would be circular)
SKIP_AUTHORS_RE='^(dome-audit-bot|dependabot|github-actions)$'

# Per-PR per-call wall-clock cap (seconds). OpenCode/MiniMax reviews for a
# 50-file PR take 3-5 minutes; 20 min gives headroom for retries.
PER_PR_TIMEOUT="${PER_PR_TIMEOUT:-1200}"

mkdir -p "$STATE_DIR"

# Single instance via flock
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$LOG_PREFIX Another instance is running — exiting"
  exit 0
fi

# ── Load API credentials ─────────────────────────────────────────────────────
# Credentials live in /opt/dome-audit/.minimax-api.env (root-only, not in git).
# Format: KEY=value per line. Override by exporting AI_REVIEW_* before calling.
ENV_FILE="${AI_REVIEW_ENV_FILE:-/opt/dome-audit/.minimax-api.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

if [ -z "${AI_REVIEW_API_KEY:-}" ]; then
  echo "$LOG_PREFIX AI_REVIEW_API_KEY not set and $ENV_FILE missing — aborting" >&2
  exit 1
fi
export AI_REVIEW_BASE_URL="${AI_REVIEW_BASE_URL:-https://api.minimax.io/v1}"
export AI_REVIEW_MODEL="${AI_REVIEW_MODEL:-MiniMax-M2.7}"

# GitHub token: prefer existing GH_TOKEN, else ask gh CLI
if [ -z "${GH_TOKEN:-}" ]; then
  GH_TOKEN=$(gh auth token 2>/dev/null || true)
fi
if [ -z "$GH_TOKEN" ]; then
  echo "$LOG_PREFIX Cannot obtain GitHub token — aborting" >&2
  exit 1
fi
export GITHUB_TOKEN="$GH_TOKEN"

# ── Sync repo (force to origin/main to avoid divergence wedging us) ──────────
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "$LOG_PREFIX Repo not found at $REPO_DIR — aborting" >&2
  exit 1
fi
cd "$REPO_DIR"
git fetch --quiet origin main 2>/dev/null || true
git checkout --quiet main 2>/dev/null || true
git reset --hard --quiet origin/main 2>/dev/null || true

# ── List open PRs ────────────────────────────────────────────────────────────
PR_LIST_JSON=$(gh pr list --repo "$REPO_SLUG" --state open --limit 50 \
  --json number,headRefName,headRefOid,author,title 2>/dev/null || echo '[]')

TOTAL=$(echo "$PR_LIST_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
echo "$LOG_PREFIX Found $TOTAL open PRs"

REVIEWED=0
SKIPPED=0
FAILED=0

# Loop PRs
while IFS=$'\t' read -r PR SHA AUTHOR BRANCH TITLE; do
  [ -n "$PR" ] || continue

  if echo "$AUTHOR" | grep -qE "$SKIP_AUTHORS_RE"; then
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  MARKER="$STATE_DIR/${PR}-${SHA}.done"
  if [ -f "$MARKER" ]; then
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  echo "$LOG_PREFIX Reviewing PR #$PR ($AUTHOR) — ${TITLE:0:80}"

  # Fetch PR HEAD
  PR_REF="refs/pull/$PR/head"
  if ! git fetch --quiet origin "+$PR_REF:refs/remotes/pr/$PR" 2>/dev/null; then
    echo "$LOG_PREFIX Failed to fetch PR #$PR — skipping" >&2
    FAILED=$((FAILED+1))
    continue
  fi

  # Generate diff against merge-base with main
  DIFF_FILE=$(mktemp /tmp/pr-${PR}-XXXXXX.diff)
  git diff "origin/main...refs/remotes/pr/$PR" > "$DIFF_FILE" 2>/dev/null || true

  DIFF_SIZE=$(wc -c < "$DIFF_FILE")
  if [ "$DIFF_SIZE" -lt 100 ]; then
    echo "$LOG_PREFIX PR #$PR has a trivial diff ($DIFF_SIZE bytes) — marking done without review"
    touch "$MARKER"
    rm -f "$DIFF_FILE"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  # Run the review. timeout guards against a hung AI call.
  PR_LOG=$(mktemp /tmp/pr-${PR}-review-XXXXXX.log)
  if timeout "$PER_PR_TIMEOUT" env \
      PR_NUMBER="$PR" \
      REPO="$REPO_SLUG" \
      node "$REPO_DIR/scripts/ai-review.mjs" \
      < "$DIFF_FILE" > "$PR_LOG" 2>&1; then
    # Success — record marker
    touch "$MARKER"
    REVIEWED=$((REVIEWED+1))
    # Surface last few log lines for operator visibility
    tail -n 6 "$PR_LOG" | sed "s|^|$LOG_PREFIX  |"
  else
    EXIT=$?
    echo "$LOG_PREFIX PR #$PR review failed (exit $EXIT) — will retry next cron tick" >&2
    # Keep a bounded tail of the log for debugging
    tail -n 30 "$PR_LOG" | sed "s|^|$LOG_PREFIX  |" >&2
    FAILED=$((FAILED+1))
  fi

  rm -f "$DIFF_FILE" "$PR_LOG"

  # Polite pacing between PRs — avoid clustering GitHub API writes
  sleep 10
done < <(echo "$PR_LIST_JSON" | python3 -c "
import json, sys
for pr in json.load(sys.stdin):
    print(f\"{pr['number']}\t{pr['headRefOid']}\t{pr['author']['login']}\t{pr['headRefName']}\t{pr['title']}\")
")

# ── GC old markers (older than 30d) so STATE_DIR doesn't grow unbounded ─────
find "$STATE_DIR" -maxdepth 1 -name '*.done' -mtime +30 -delete 2>/dev/null || true

echo "$LOG_PREFIX Done — reviewed:$REVIEWED skipped:$SKIPPED failed:$FAILED"
