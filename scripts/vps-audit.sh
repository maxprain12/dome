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
#   ./scripts/vps-audit.sh [--focus security|types|i18n|debt]
#
# Cron (daily at 3am):
#   0 3 * * * /opt/dome-audit/scripts/vps-audit.sh >> /var/log/dome-audit.log 2>&1
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-/opt/dome-audit/dome}"
REPO_URL="${REPO_URL:-https://github.com/maxprain12/dome.git}"
REPO_SLUG=$(echo "$REPO_URL" | sed 's|https://github.com/||; s|\.git$||')
BRANCH_PREFIX="audit"
FOCUS="${1:-all}"  # security | types | i18n | debt | all
TIMESTAMP=$(date +%Y%m%d-%H%M)
BRANCH="${BRANCH_PREFIX}/${FOCUS}-${TIMESTAMP}"
LOG_PREFIX="[dome-audit $(date '+%Y-%m-%d %H:%M')]"

echo "$LOG_PREFIX Starting audit (focus: $FOCUS)"

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

# ── Build the audit prompt ────────────────────────────────────────────────────
PROMPT_FILE=$(mktemp /tmp/audit-prompt-XXXXXX.md)
cat > "$PROMPT_FILE" << PROMPT
You are performing a periodic code audit of Dome, an Electron + React desktop app.

Read AGENTS.md first to understand the codebase architecture.

$(if [ -n "$PREVIOUS_FINDINGS" ]; then
  echo "## Unresolved findings from the previous audit run"
  echo "The AI reviewer flagged these issues in the last PR for this focus."
  echo "Address these FIRST before looking for new issues:"
  echo ""
  echo "$PREVIOUS_FINDINGS"
  echo ""
fi)

$(case "$FOCUS" in
  security)
    echo "## Focus: Security Audit
Audit the codebase for security issues:
1. IPC handlers in electron/ipc/ that don't validate sender or sanitize inputs
2. SQL injection risks (string concatenation in queries instead of prepared statements)
3. Path traversal vulnerabilities (user-provided paths used without sanitizePath())
4. Hardcoded secrets, API keys, or credentials in source files
5. electron/preload.cjs exposing APIs that shouldn't be exposed to renderer
6. Missing input validation on IPC channels

CRITICAL path traversal rules:
- ALWAYS use sanitizePath(filePath, true) — never use .replace(/\.\.\//g, '')
- The replace() approach is bypassable with ....// and does not handle Windows paths
- After sanitization, always validate containment with:
    const resolved = path.resolve(baseDir, userInput);
    if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) throw new Error('Path traversal');
- Check BOTH source and destination paths in copy/move operations

For each issue found: create a fix. If the fix is straightforward, implement it.
If the fix is complex, create a TODO comment with the specific issue described."
    ;;
  types)
    echo "## Focus: TypeScript Quality
Audit the codebase for TypeScript issues:
1. Files using 'any' type where a proper type can be inferred
2. Missing 'import type' for type-only imports (verbatimModuleSyntax is ON)
3. Non-null assertions (!) that could be replaced with proper null checks
4. Inconsistent return types on functions
5. Missing types on exported functions/components

Scan ALL of: app/lib/, app/components/, electron/ipc/.
Fix what you can. Focus on files with the most 'any' types first.
Run: grep -rn ': any' app/ --include='*.ts' --include='*.tsx' | wc -l
to see the total count before and after."
    ;;
  i18n)
    echo "## Focus: i18n Completeness
Audit the codebase for i18n issues:
1. User-visible strings hardcoded in components instead of using t()
2. Translation keys that exist in 'en' but are missing in 'es', 'fr', or 'pt' in app/lib/i18n.ts
3. Components using useTranslation() inconsistently

Fix all missing translation keys in app/lib/i18n.ts.
For hardcoded strings: wrap them with t() and add the key to all 4 languages.

IMPORTANT: Do NOT reformat or reindent existing keys in i18n.ts.
Only add missing keys or change actual string values. Indentation-only changes
create noise without value and will be reverted."
    ;;
  debt)
    echo "## Focus: Technical Debt
Audit the codebase for technical debt:
1. Dead code: exported functions/components that are never imported
2. Duplicate logic: same pattern repeated 3+ times that could be extracted
3. Hardcoded colors (hex values) instead of CSS variables — use CSS variables from AGENTS.md
4. Console.log statements left in production code (not console.error/warn)
5. TODO/FIXME comments older than 30 days

There are currently ~468 hardcoded hex colors and ~233 console.logs in the codebase.
Focus on the files with the most occurrences first.
Fix the hardcoded colors and console.logs. Flag the rest with a comment."
    ;;
  vulns)
    echo "## Focus: Dependency Vulnerabilities
Audit npm dependencies for security vulnerabilities and outdated packages.

Step 1 — Run npm audit and read the output:
  npm audit --json

Step 2 — For each HIGH or CRITICAL vulnerability:
  - Read the advisory to understand the attack vector
  - Check if Dome actually uses the vulnerable code path
  - If a safe fix exists (npm audit fix --dry-run shows it): apply it
  - If it requires a major version bump: add a TODO comment in package.json with the issue

Step 3 — Check for packages with known safer alternatives:
  - Any 'request' package → should be 'node-fetch' or native fetch
  - Any 'node-uuid' → should be 'crypto.randomUUID()'

IMPORTANT:
- Run 'npm install --ignore-scripts' after any package.json change
- Do NOT bump major versions of electron, better-sqlite3, or @langchain/* — these have breaking changes
- Do NOT run 'npm audit fix --force' — apply fixes selectively"
    ;;
  react)
    echo "## Focus: React Patterns & Performance
Audit the codebase for React anti-patterns that cause bugs and performance issues.

1. useEffect with addEventListener/setTimeout/setInterval that has NO cleanup return:
   Bad:  useEffect(() => { window.addEventListener('x', fn) }, [])
   Good: useEffect(() => { window.addEventListener('x', fn); return () => window.removeEventListener('x', fn) }, [])

2. Direct state mutations in Zustand stores or React state:
   Bad:  state.items.push(item)
   Good: set(s => ({ items: [...s.items, item] }))

3. useEffect with missing dependency array (runs on every render):
   Bad:  useEffect(() => { fetchData() })
   Good: useEffect(() => { fetchData() }, [id])

4. Components that re-render unnecessarily because they receive new object/array literals as props:
   Bad:  <Component options={{ key: val }} />
   Good: const options = useMemo(() => ({ key: val }), [val]); <Component options={options} />

5. Large components over 400 lines that mix data fetching + business logic + rendering.
   These are the biggest ones — split them if the split is clean:
   $(find app/components -name '*.tsx' -exec wc -l {} \; 2>/dev/null | awk '$1 > 400 {print "   " $1 " lines: " $2}' | sort -rn | head -8)

Fix the useEffect cleanup issues first (they cause memory leaks).
For large components: only split if you can identify a clear sub-component boundary.
Do NOT refactor working logic just to reduce line count."
    ;;
  errors)
    echo "## Focus: Error Handling & Resilience
Audit the codebase for missing error handling that causes silent failures or crashes.

1. React Error Boundaries — there are currently ZERO in the codebase.
   Add an ErrorBoundary component at app/components/ErrorBoundary.tsx:
   - Wrap each major tab/view in AppShell with it
   - Show a friendly fallback UI instead of crashing the whole app
   - Log the error to console.error (and PostHog if available)

2. IPC handlers that throw instead of returning { success: false, error }:
   Bad:  ipcMain.handle('x', () => { throw new Error('...') })
   Good: ipcMain.handle('x', () => { try {...} catch(e) { return { success: false, error: e.message } } })
   Scan electron/ipc/*.cjs for handlers missing try/catch.

3. window.electron.invoke() calls in the renderer with no .catch() or try/catch:
   Bad:  const result = await window.electron.invoke('x', data)
   Good: const result = await window.electron.invoke('x', data).catch(e => ({ success: false, error: e.message }))

4. Zustand store actions that call IPC without error handling — the store should never crash
   silently; log errors and optionally show a toast.

Priority: ErrorBoundary first (highest impact), then IPC try/catch, then renderer catch."
    ;;
  *)
    echo "## Focus: Full Audit (all areas)
Perform a comprehensive audit covering:
1. Security: IPC validation, SQL injection, path traversal
2. TypeScript: 'any' types, missing import type, null safety
3. i18n: missing translations in app/lib/i18n.ts
4. Code quality: hardcoded colors, dead code, console.logs
5. React: useEffect cleanup, direct state mutations
6. Errors: missing Error Boundaries, IPC try/catch

Prioritize by severity: Security > Errors > TypeScript > React > Code quality > i18n.
Fix the top 5-10 most impactful issues. Do not try to fix everything at once."
    ;;
esac)

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
PROMPT

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

VALIDATION_FAILED=0
npm run typecheck 2>&1 || VALIDATION_FAILED=1
npm run lint 2>&1 || VALIDATION_FAILED=1
npm run build 2>&1 || VALIDATION_FAILED=1

if [ $VALIDATION_FAILED -eq 1 ]; then
  echo "$LOG_PREFIX Validation failed — discarding changes and aborting PR creation"
  git checkout main
  git branch -D "$ACTUAL_BRANCH" 2>/dev/null || true
  exit 1
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
echo "${FOCUS} ${PR_NUMBER} ${REPO_SLUG}" > "${PENDING_DIR}/${FOCUS}-${PR_NUMBER}.pending"
echo "$LOG_PREFIX Findings job queued for PR #${PR_NUMBER} (will run within 30 min)"
