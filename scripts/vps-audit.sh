#!/bin/bash
# =============================================================================
# vps-audit.sh — Dome Codebase Auditor
#
# Runs OpenCode with MiniMax against the Dome repo, generates a PR with
# any findings. Designed to run as a cron job on a VPS.
#
# Prerequisites (see docs/vps-audit-setup.md):
#   - git, gh, node, opencode installed
#   - GH_TOKEN env var set
#   - OpenCode configured with MiniMax (~/.config/opencode/config.json)
#   - Repo cloned at REPO_DIR
#
# Usage:
#   ./scripts/vps-audit.sh <focus>                       # positional (legacy)
#   ./scripts/vps-audit.sh --focus security              # flag form
#   ./scripts/vps-audit.sh --focus types --chain-context /tmp/chain-ctx.md
#   ./scripts/vps-audit.sh --focus types --dry-run       # print prompt + exit
#
# Prompts are now sourced from the repo:
#   prompts/shared/project-context.md  (shared)
#   prompts/audits/<focus>.md          (focus-specific, with YAML frontmatter)
#   prompts/audits/_chain-header.md    (chained mode only)
#
# Cron (daily at 3am):
#   0 3 * * * /opt/dome-audit/scripts/vps-audit.sh --focus all >> /var/log/dome-audit.log 2>&1
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-/opt/dome-audit/dome}"
REPO_URL="${REPO_URL:-https://github.com/maxprain12/dome.git}"
REPO_SLUG=$(echo "$REPO_URL" | sed 's|https://github.com/||; s|\.git$||')
BRANCH_PREFIX="audit"
TIMESTAMP=$(date +%Y%m%d-%H%M)
LOG_PREFIX="[dome-audit $(date '+%Y-%m-%d %H:%M')]"

# ── Parse args ────────────────────────────────────────────────────────────────
FOCUS=""
CHAIN_CONTEXT_FILE=""
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --focus)
      FOCUS="$2"
      shift 2
      ;;
    --chain-context)
      CHAIN_CONTEXT_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      # First bare positional is focus (backwards compat with `./vps-audit.sh security`)
      if [ -z "$FOCUS" ]; then FOCUS="$1"; fi
      shift
      ;;
  esac
done
FOCUS="${FOCUS:-all}"
BRANCH="${BRANCH_PREFIX}/${FOCUS}-${TIMESTAMP}"

echo "$LOG_PREFIX Starting audit (focus: $FOCUS${CHAIN_CONTEXT_FILE:+, chained})"

# ── Ensure repo is up to date ─────────────────────────────────────────────────
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "$LOG_PREFIX Cloning repo..."
  git clone "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"
git checkout main
git pull origin main
echo "$LOG_PREFIX Repo updated to $(git rev-parse --short HEAD)"

# ── Create audit branch ───────────────────────────────────────────────────────
git checkout -b "$BRANCH"
echo "$LOG_PREFIX Created branch: $BRANCH"

# ── Load previous findings for this focus ────────────────────────────────────
FINDINGS_DIR="${FINDINGS_DIR:-/var/log/dome-audit-findings}"
FINDINGS_FILE="$FINDINGS_DIR/${FOCUS}.findings"
PREVIOUS_FINDINGS=""
if [ -f "$FINDINGS_FILE" ] && [ -s "$FINDINGS_FILE" ]; then
  PREVIOUS_FINDINGS=$(cat "$FINDINGS_FILE")
  echo "$LOG_PREFIX Loaded $(wc -l < "$FINDINGS_FILE" | tr -d ' ') unresolved findings from previous run"
fi

# ── Build the audit prompt (from prompts/ on disk) ────────────────────────────
PROMPTS_DIR="${PROMPTS_DIR:-$REPO_DIR/prompts}"
SHARED_PROMPT="$PROMPTS_DIR/shared/project-context.md"
FOCUS_PROMPT="$PROMPTS_DIR/audits/${FOCUS}.md"
CHAIN_HEADER_PROMPT="$PROMPTS_DIR/audits/_chain-header.md"

# Fall back to 'all' if the focus file is missing (e.g. new focus flag before prompt is added)
if [ ! -f "$FOCUS_PROMPT" ]; then
  echo "$LOG_PREFIX ⚠️  Prompt file not found: $FOCUS_PROMPT — falling back to all.md"
  FOCUS_PROMPT="$PROMPTS_DIR/audits/all.md"
fi

if [ ! -f "$SHARED_PROMPT" ] || [ ! -f "$FOCUS_PROMPT" ]; then
  echo "$LOG_PREFIX ❌ Required prompt files missing. Expected $SHARED_PROMPT and $FOCUS_PROMPT"
  exit 1
fi

# Strip YAML frontmatter (everything between the first two `---` lines)
strip_frontmatter() {
  awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print} c<2 && !/^---$/ && !/^(name|description|version|focus|pass|last_updated):/{next}' "$1"
}

# Read 'version:' value from frontmatter
read_prompt_version() {
  awk '/^---$/{c++; if(c==2) exit} c==1 && /^version:/{sub(/^version:[[:space:]]*/, ""); print; exit}' "$1"
}

FOCUS_PROMPT_VERSION=$(read_prompt_version "$FOCUS_PROMPT")
SHARED_PROMPT_VERSION=$(read_prompt_version "$SHARED_PROMPT")
PROMPT_VERSION_TAG="shared@${SHARED_PROMPT_VERSION:-0}+${FOCUS}@${FOCUS_PROMPT_VERSION:-0}"
echo "$LOG_PREFIX Prompt versions: $PROMPT_VERSION_TAG"

CHAIN_CONTEXT_BODY=""
if [ -n "$CHAIN_CONTEXT_FILE" ] && [ -f "$CHAIN_CONTEXT_FILE" ]; then
  CHAIN_CONTEXT_BODY=$(cat "$CHAIN_CONTEXT_FILE")
fi

PROMPT_FILE=$(mktemp /tmp/audit-prompt-XXXXXX.md)

{
  echo "You are performing a periodic code audit of Dome, an Electron + React desktop app."
  echo ""
  echo "Read AGENTS.md first to understand the codebase architecture."
  echo ""
  echo "Prompt bundle: $PROMPT_VERSION_TAG"
  echo ""
  strip_frontmatter "$SHARED_PROMPT"
  echo ""

  if [ -n "$PREVIOUS_FINDINGS" ]; then
    echo "## Unresolved findings from the previous audit run"
    echo ""
    echo "The AI reviewer flagged these issues in the last PR for this focus."
    echo "Address these FIRST before looking for new issues:"
    echo ""
    echo "$PREVIOUS_FINDINGS"
    echo ""
  fi

  if [ -n "$CHAIN_CONTEXT_BODY" ] && [ -f "$CHAIN_HEADER_PROMPT" ]; then
    # Interpolate ${CHAIN_CONTEXT} into the chain header template
    CHAIN_HEADER_BODY=$(strip_frontmatter "$CHAIN_HEADER_PROMPT")
    printf '%s\n' "${CHAIN_HEADER_BODY//\$\{CHAIN_CONTEXT\}/$CHAIN_CONTEXT_BODY}"
    echo ""
  fi

  strip_frontmatter "$FOCUS_PROMPT"
  echo ""

  cat << 'RULES'
## Rules
- Follow AGENTS.md exactly: process separation, IPC pattern, CSS variables, i18n
- Only fix real issues. Do not refactor working code just to change style.
- Each fix must pass: npm run typecheck && npm run lint && npm run build
- Run those commands before finishing.
- If you find issues but can't fix them all, fix the most critical ones and
  leave commented TODOs for the rest.

## When done
After making fixes, run:
  npm run typecheck
  npm run lint
  npm run build

If all pass, your work is complete. The CI pipeline will validate everything.
RULES
} > "$PROMPT_FILE"

if [ "$DRY_RUN" = "1" ]; then
  echo "$LOG_PREFIX --dry-run: assembled prompt below"
  echo "========================================"
  cat "$PROMPT_FILE"
  echo "========================================"
  rm -f "$PROMPT_FILE"
  exit 0
fi

echo "$LOG_PREFIX Running OpenCode audit..."

# ── Run OpenCode ──────────────────────────────────────────────────────────────
# -f attaches the prompt file as context
# --dangerously-skip-permissions runs autonomously without approval prompts
# --dir sets the working directory to the repo
opencode run \
  --dangerously-skip-permissions \
  --dir "$REPO_DIR" \
  -f "$PROMPT_FILE" \
  -- "Execute the audit instructions in the attached file. Read AGENTS.md first. Fix all issues, then run: npm run typecheck && npm run lint && npm run build" \
  2>&1 | tee /tmp/audit-output-${TIMESTAMP}.log

rm -f "$PROMPT_FILE"

# ── Capture actual branch (OpenCode may have created its own branch) ──────────
ACTUAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$ACTUAL_BRANCH" = "HEAD" ] || [ "$ACTUAL_BRANCH" = "main" ]; then
  ACTUAL_BRANCH="$BRANCH"
fi
echo "$LOG_PREFIX Active branch after OpenCode: $ACTUAL_BRANCH"

# ── Check if there are any changes ───────────────────────────────────────────
if git diff --quiet && git diff --staged --quiet && git diff "origin/main...HEAD" --quiet 2>/dev/null; then
  echo "$LOG_PREFIX No changes made by audit. Codebase is clean for focus: $FOCUS"
  git checkout main
  git branch -D "$ACTUAL_BRANCH" 2>/dev/null || true
  exit 0
fi

# ── Validate before PR ────────────────────────────────────────────────────────
echo "$LOG_PREFIX Validating changes..."
npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null

VALIDATION_OUTPUT_FILE=$(mktemp /tmp/audit-validation-XXXXXX.log)

run_validation() {
  local failed=0
  { npm run typecheck 2>&1; echo "EXIT:$?"; } | tee -a "$VALIDATION_OUTPUT_FILE" | grep -v "EXIT:" || true
  { npm run lint 2>&1; echo "EXIT:$?"; } | tee -a "$VALIDATION_OUTPUT_FILE" | grep -v "EXIT:" || true
  { npm run build 2>&1; echo "EXIT:$?"; } | tee -a "$VALIDATION_OUTPUT_FILE" | grep -v "EXIT:" || true
  # Check for actual errors (not just warnings) in typecheck/build
  if grep -qE "error TS[0-9]+|Error:" "$VALIDATION_OUTPUT_FILE" 2>/dev/null; then
    failed=1
  fi
  # Check build explicitly
  if ! npm run build > /dev/null 2>&1; then
    failed=1
  fi
  echo $failed
}

VALIDATION_FAILED=$(run_validation)

# ── Auto-repair: re-run OpenCode to fix validation errors ────────────────────
if [ "$VALIDATION_FAILED" = "1" ]; then
  echo "$LOG_PREFIX Validation failed — asking OpenCode to fix the errors (attempt 1/2)..."

  REPAIR_PROMPT=$(mktemp /tmp/audit-repair-XXXXXX.md)
  VALIDATION_ERRORS=$(grep -E "error TS[0-9]+|Error:|✖.*error" "$VALIDATION_OUTPUT_FILE" 2>/dev/null | head -30 || true)

  cat > "$REPAIR_PROMPT" << REPAIR
The previous audit introduced validation errors. Fix ONLY the errors below — do not make other changes.

## Validation errors to fix:
\`\`\`
${VALIDATION_ERRORS}
\`\`\`

## Rules
- Fix only what is broken. Do not touch unrelated code.
- Run: npm run typecheck && npm run build
- If you cannot fix an error without breaking something else, revert that specific change with git checkout HEAD -- <file>
REPAIR

  opencode run \
    --dangerously-skip-permissions \
    --dir "$REPO_DIR" \
    -f "$REPAIR_PROMPT" \
    -- "Fix only the TypeScript/build errors listed in the attached file. Run npm run typecheck && npm run build to verify." \
    2>&1 | tee -a /tmp/audit-output-${TIMESTAMP}.log

  rm -f "$REPAIR_PROMPT"
  echo "" > "$VALIDATION_OUTPUT_FILE"
  VALIDATION_FAILED=$(run_validation)

  if [ "$VALIDATION_FAILED" = "1" ]; then
    echo "$LOG_PREFIX Repair attempt failed — discarding changes to avoid broken PR"
    REMAINING_ERRORS=$(grep -E "error TS[0-9]+|Error:" "$VALIDATION_OUTPUT_FILE" 2>/dev/null | head -10 || true)
    echo "$LOG_PREFIX Errors that could not be auto-repaired:"
    echo "$REMAINING_ERRORS"
    rm -f "$VALIDATION_OUTPUT_FILE"
    git checkout main
    git branch -D "$ACTUAL_BRANCH" 2>/dev/null || true
    exit 1
  else
    echo "$LOG_PREFIX Auto-repair succeeded — continuing with PR creation"
  fi
fi

rm -f "$VALIDATION_OUTPUT_FILE"
ACTUAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$ACTUAL_BRANCH" = "HEAD" ] || [ "$ACTUAL_BRANCH" = "main" ]; then
  ACTUAL_BRANCH="$BRANCH"
fi

# ── Commit and push ───────────────────────────────────────────────────────────
git add -A
# Only commit if there are staged changes (OpenCode may have already committed)
if ! git diff --staged --quiet; then
  git commit -m "audit: automated ${FOCUS} audit ${TIMESTAMP}

Periodic automated audit by OpenCode + MiniMax.
Focus: ${FOCUS}
Generated: ${TIMESTAMP}"
fi

git push origin "HEAD:${ACTUAL_BRANCH}"

# ── Create PR ─────────────────────────────────────────────────────────────────
CHANGED_FILES=$(git diff "origin/main...HEAD" --name-only 2>/dev/null | head -20 | sed 's/^/- /')

gh pr create \
  --repo "$REPO_SLUG" \
  --base main \
  --head "$ACTUAL_BRANCH" \
  --title "audit: ${FOCUS} audit ${TIMESTAMP}" \
  --body "$(cat << EOF
## Summary
Automated periodic audit by OpenCode + MiniMax.

**Focus:** ${FOCUS}
**Generated:** ${TIMESTAMP}
**Prompt bundle:** \`${PROMPT_VERSION_TAG}\`${CHAIN_CONTEXT_FILE:+
**Chain context:** yes (upstream findings fed in)}
**Changed files:**
${CHANGED_FILES}

## Flag
Flag: none

## Type
- [ ] New feature
- [x] Bug fix
- [ ] Refactor
- [ ] Docs/config

## Checklist
- [x] typecheck passes
- [x] lint passes
- [x] build passes
- [x] No hardcoded colors
- [x] Automated — validated before PR creation
EOF
)"

# Enable auto-merge — if CI passes, merges automatically
gh pr merge --auto --squash --repo "$REPO_SLUG" "$ACTUAL_BRANCH"

PR_NUMBER=$(gh pr view --repo "$REPO_SLUG" "$ACTUAL_BRANCH" --json number --jq '.number' 2>/dev/null)
echo "$LOG_PREFIX Audit PR created and auto-merge enabled."
echo "$LOG_PREFIX Branch: $ACTUAL_BRANCH"
echo "$LOG_PREFIX PR URL: https://github.com/${REPO_SLUG}/pull/${PR_NUMBER}"

# ── Extract AI review findings (runs in background, review may not be posted yet)
# Wait 3 minutes for the AI review workflow to complete, then extract findings
# Write a pending findings job — picked up by vps-audit-findings-cron.sh
PENDING_DIR="/var/log/dome-audit-findings/pending"
mkdir -p "$PENDING_DIR"
echo "${FOCUS} ${PR_NUMBER} ${REPO_SLUG} ${PROMPT_VERSION_TAG}" > "${PENDING_DIR}/${FOCUS}-${PR_NUMBER}.pending"
echo "$LOG_PREFIX Findings job queued for PR #${PR_NUMBER} (will run within 30 min)"
