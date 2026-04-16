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

## Project-specific context (read before auditing)

### Valid CSS variables (defined in app/globals.css)
The following CSS custom properties ARE defined and valid. NEVER flag them as "unknown", "undocumented",
or "should be replaced". They are real variables used throughout the codebase:

Text colors:
  --primary-text, --secondary-text, --tertiary-text
  --dome-text (→ --primary-text), --dome-text-secondary (→ --secondary-text), --dome-text-muted (→ --tertiary-text)
  --base-text  ← text on accent-colored buttons (#FFFFFF light / #121212 dark — intentionally hardcoded in globals.css)

Backgrounds:
  --bg, --bg-secondary, --bg-tertiary, --bg-hover
  --dome-bg (→ --bg), --dome-bg-hover (→ --bg-hover), --dome-accent-bg (translucent accent)

Interactive:
  --accent, --accent-hover
  --dome-accent (→ --accent), --dome-accent-hover (→ --accent-hover)

Semantic:
  --error, --warning, --success
  --dome-error (→ --error)

Borders:
  --border, --border-hover, --dome-border (→ --border)

Only flag LITERAL hex values (e.g. color: '#ef4444') that appear in style= attributes or TSX WITHOUT
being wrapped in a CSS var(). Fallback values inside var(--x, fallback) are acceptable.

### Stack clarification
- Runtime: Bun for dev/build; Electron uses Node.js (better-sqlite3, NOT bun:sqlite)
- Frontend: Vite + React 18 (NOT Next.js — ignore any Next.js references in style guides)
- Routes: React Router v7 (client-side SPA), entry: app/main.tsx
- i18n: react-i18next, all translations inline in app/lib/i18n.ts (en/es/fr/pt), default language: es
- verbatimModuleSyntax: true → ALL type-only imports MUST use \`import type { }\`

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
3. Components that import useTranslation but don't use t() for user-facing strings

Fix all missing translation keys in app/lib/i18n.ts.
For hardcoded strings: wrap them with t() and add the key to all 4 languages.

IMPORTANT rules for i18n.ts edits:
- Do NOT reformat, reindent, or reorder existing keys — only add/change values
- The default language is Spanish (es) — Spanish strings should be natural, not machine-translated
- French (fr) and Portuguese (pt) translations should be grammatically correct
- Use the same key nesting structure as existing keys for consistency
- Never add a key in one language without adding it in all 4 (en/es/fr/pt)"
    ;;
  debt)
    echo "## Focus: Technical Debt
Audit the codebase for technical debt:
1. Dead code: exported functions/components that are never imported anywhere
2. Duplicate logic: same pattern repeated 3+ times that could be extracted to a shared util
3. Hardcoded colors: literal hex values (e.g. color: '#ef4444') in style= attributes that should use CSS variables
4. Console.log statements left in production code (console.error/warn are fine)
5. TODO/FIXME comments older than 30 days

IMPORTANT for color fixes:
- Replace hardcoded hex values with the CSS variables listed in the 'Valid CSS variables' section above
- Do NOT replace CSS variable usages — they are already correct
- Mapping guide:
    '#ef4444' or red-ish errors → var(--dome-error) or var(--error)
    '#ffffff' or '#fff' on buttons → var(--base-text)
    '#0ea5e9' or blue → var(--accent)
    '#111827' or dark text → var(--primary-text)
    '#6b7280' or medium text → var(--secondary-text)
    '#9ca3af' or muted text → var(--tertiary-text)
    '#f9fafb' or light bg → var(--bg-secondary)
    '#f3f4f6' → var(--bg-tertiary)
    '#e5e7eb' borders → var(--border)

There are currently ~468 hardcoded hex colors and ~233 console.logs in the codebase.
Focus on the files with the most occurrences first.
Fix the hardcoded colors and console.logs. Flag the rest with a TODO comment."
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
