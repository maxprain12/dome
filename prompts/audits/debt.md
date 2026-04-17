---
name: audit-debt
description: Technical debt — dead code, duplicate logic, hardcoded colors, console.logs, stale TODOs.
version: 1
focus: debt
last_updated: 2026-04-17
---

## Focus: Technical Debt

Audit the codebase for technical debt:

1. Dead code: exported functions/components that are never imported anywhere
2. Duplicate logic: same pattern repeated 3+ times that could be extracted to a shared util
3. Hardcoded colors: literal hex values (e.g. `color: '#ef4444'`) in `style=` attributes that should use CSS variables
4. `console.log` statements left in production code (`console.error`/`warn` are fine)
5. TODO/FIXME comments older than 30 days

### IMPORTANT for color fixes

- Replace hardcoded hex values with the CSS variables listed in the shared project context
- Do NOT replace CSS variable usages — they are already correct
- Mapping guide:
  - `#ef4444` or red-ish errors → `var(--dome-error)` or `var(--error)`
  - `#ffffff` or `#fff` on buttons → `var(--base-text)`
  - `#0ea5e9` or blue → `var(--accent)`
  - `#111827` or dark text → `var(--primary-text)`
  - `#6b7280` or medium text → `var(--secondary-text)`
  - `#9ca3af` or muted text → `var(--tertiary-text)`
  - `#f9fafb` or light bg → `var(--bg-secondary)`
  - `#f3f4f6` → `var(--bg-tertiary)`
  - `#e5e7eb` borders → `var(--border)`

### Baseline metrics

There are currently ~468 hardcoded hex colors and ~233 `console.log` in the codebase.
Focus on the files with the most occurrences first.
Fix the hardcoded colors and console.logs. Flag the rest with a TODO comment.

### Tool use (required before proposing fixes)

- `grep -rnE "#[0-9a-fA-F]{3,6}" app/ --include='*.tsx' --include='*.ts' | grep -v "var(--" | wc -l` — baseline count
- `grep -rn "console.log" app/ --include='*.ts' --include='*.tsx' | wc -l` — baseline count
- Verify dead-code claims with `grep -rn "<FnName>" app/ electron/` — a function imported via `export *` or dynamic import is NOT dead
