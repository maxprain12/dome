---
name: project-context
description: Shared project context injected into all audit and review prompts. Defines valid CSS variables, stack specifics, i18n rules, severity criteria, and finding-quality requirements so agents don't produce false positives.
version: 2
last_updated: 2026-04-18
---

## Project-specific context

### Valid CSS variables (defined in app/globals.css)

The following CSS custom properties ARE defined and valid. NEVER flag them as "unknown", "undocumented",
or "should be replaced". They are real variables used throughout the codebase:

Text colors:
  `--primary-text`, `--secondary-text`, `--tertiary-text`
  `--dome-text` (→ `--primary-text`), `--dome-text-secondary` (→ `--secondary-text`), `--dome-text-muted` (→ `--tertiary-text`)
  `--base-text` ← text on accent-colored buttons (#FFFFFF light / #121212 dark — intentionally hardcoded in globals.css)

Backgrounds:
  `--bg`, `--bg-secondary`, `--bg-tertiary`, `--bg-hover`
  `--dome-bg` (→ `--bg`), `--dome-bg-hover` (→ `--bg-hover`), `--dome-accent-bg` (translucent accent)

Interactive:
  `--accent`, `--accent-hover`
  `--dome-accent` (→ `--accent`), `--dome-accent-hover` (→ `--accent-hover`)

Semantic:
  `--error`, `--warning`, `--success`
  `--dome-error` (→ `--error`)

Borders:
  `--border`, `--border-hover`, `--dome-border` (→ `--border`)

Only flag LITERAL hex values (e.g. `color: '#ef4444'`) that appear in style= attributes or TSX WITHOUT
being wrapped in a CSS var(). Fallback values inside `var(--x, fallback)` are acceptable.

### Stack clarification

- Runtime: Node.js + npm (CI, build, lockfile). Do NOT use bun or touch `bun.lock`. Electron uses better-sqlite3 (NOT bun:sqlite)
- Frontend: Vite + React 18 (NOT Next.js — ignore any Next.js references in style guides)
- Routes: React Router v7 (client-side SPA), entry: `app/main.tsx`
- i18n: react-i18next, all translations inline in `app/lib/i18n.ts` (en/es/fr/pt), default language: es
- `verbatimModuleSyntax: true` → ALL type-only imports MUST use `import type { }`

### Architecture boundary (enforced in every audit)

- Code in `app/` (renderer) must NEVER import Node.js modules (`fs`, `path`, `better-sqlite3`, `bun:sqlite`, `electron`, `child_process`, …).
- New IPC channels MUST be whitelisted in `electron/preload.cjs` `ALLOWED_CHANNELS`.
- IPC handlers in `electron/ipc/*.cjs` MUST validate sender (`event.sender`) and sanitize inputs.
- File system and database access from the renderer goes through IPC — never direct.

### Severity criteria (apply consistently across every audit)

Use these three tiers. The marker at the start of a finding (`❌` / `⚠️` / `ℹ️`) controls how the findings pipeline treats it:

- **❌ error** — the code is broken, insecure, or violates a critical architecture rule. Must be fixed before the PR merges.
  - Examples: SQL injection via string concat; `better-sqlite3` imported in `app/`; an IPC handler with no sender validation; a crash-on-null in a code path a user can hit.
- **⚠️ warn** — smell, risk, or debt. The code works today but is likely to cause a bug, regression, or maintenance pain. Propose a fix, don't block the merge.
  - Examples: missing `import type` with `verbatimModuleSyntax: true`; a `useEffect` whose listener is cleaned up but whose dep array is suspicious; a TODO > 30 days old.
- **ℹ️ info** — notable but not actionable. Use sparingly; prefer to skip instead. The findings pipeline does NOT track these; if you emit one, it will be dropped.

**If you are unsure between ❌ and ⚠️, pick ⚠️.** Only use ❌ when you would personally block a PR over it.

### Finding-quality rules (so the resolver can verify fixes)

Each ❌/⚠️ finding you emit is persisted in a JSON database and watched over time. For the resolver to mark a finding `resolved` once the code is fixed, the finding MUST be verifiable by `grep` on the file in `main`. That means:

1. **Concrete file path.** Always use the exact path shown in the diff or `tree` — e.g. `app/components/Search/SimpleSearch.tsx`. NEVER write `unknown`, `various`, `multiple files`, or a directory without a filename. If you cannot point at a specific file, drop the finding.
2. **Line number from the diff.** Use a `+`-side line number visible in the current diff. If the issue spans a region, pick the line the fix should start on.
3. **Include a distinctive code substring.** In the finding body, quote at least 6–10 consecutive characters that actually appear on that line (a function name, variable, or SQL fragment). Avoid generic phrases like `the useEffect` or `this function` — they are not greppable.
4. **One issue per finding.** If you notice two problems on the same line, emit two findings with different patterns, not a conjunction.
5. **Pattern must survive a minimal fix.** If the obvious fix would delete the exact phrase you quoted, the resolver can detect the fix — that's the point. But if the fix only renames a variable while keeping the structure, prefer quoting the structure (e.g. `useEffect(() => {` + missing deps) over the variable name.
6. **Skip duplicates.** Before emitting, check whether the same file+pattern already appears in the "Unresolved findings from the previous audit run" block (injected above). If so, skip it — the resolver will dedupe by id anyway, but duplicates dilute the signal.

### Known non-issues (do NOT flag — these are intentional)

- **CSS variable fallbacks.** `var(--foo, #fff)` is valid — the fallback hex is only used if `--foo` is undefined. Do not flag the fallback as a hardcoded color.
- **`--base-text` hardcoded in `app/globals.css`.** The values `#FFFFFF` (light) / `#121212` (dark) are intentionally hardcoded as the text color on accent buttons, because the accent color itself is theme-dependent and needs fixed-contrast text. Defined once in globals.css.
- **Mantine component internals.** Do not flag color values, class names, or inline styles inside `node_modules/@mantine/*`; they are not our code.
- **Audit-generated files.** Files under `prompts/audits/`, `prompts/review/`, `.claude/rules/`, and `.claude/sops/` are documentation for the auditor/Claude Code itself. Do not audit them for code smell.
- **Type-only re-exports.** `export type { Foo } from './bar'` is correct with `verbatimModuleSyntax: true` — don't rewrite as `export { type Foo }`.
- **`electron/*.cjs` using `require('better-sqlite3')`, `require('fs')`, etc.** This is the main process — CommonJS + Node modules are correct here. Only flag these patterns inside `app/`.
- **Hardcoded strings inside `app/lib/i18n.ts`.** That file IS the translation table; every string there is supposed to be literal.
- **Public client-side analytics / telemetry keys.** PostHog write-only project keys and similar public SDK tokens are not secrets; don't flag them as leaked credentials. Private API keys (OpenAI, Anthropic, server-side tokens) still count as leaks if hardcoded.
