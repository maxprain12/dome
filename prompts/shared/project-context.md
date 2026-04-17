---
name: project-context
description: Shared project context injected into all audit and review prompts. Defines valid CSS variables, stack specifics, and i18n rules so agents don't produce false positives.
version: 1
last_updated: 2026-04-17
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

- Runtime: Bun for dev/build; Electron uses Node.js (better-sqlite3, NOT bun:sqlite)
- Frontend: Vite + React 18 (NOT Next.js — ignore any Next.js references in style guides)
- Routes: React Router v7 (client-side SPA), entry: `app/main.tsx`
- i18n: react-i18next, all translations inline in `app/lib/i18n.ts` (en/es/fr/pt), default language: es
- `verbatimModuleSyntax: true` → ALL type-only imports MUST use `import type { }`

### Architecture boundary (enforced in every audit)

- Code in `app/` (renderer) must NEVER import Node.js modules (`fs`, `path`, `better-sqlite3`, `bun:sqlite`, `electron`, `child_process`, …).
- New IPC channels MUST be whitelisted in `electron/preload.cjs` `ALLOWED_CHANNELS`.
- IPC handlers in `electron/ipc/*.cjs` MUST validate sender (`event.sender`) and sanitize inputs.
- File system and database access from the renderer goes through IPC — never direct.
