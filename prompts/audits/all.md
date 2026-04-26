---

## name: audit-all
description: Comprehensive audit covering every focus. Used for weekly sweeps.
version: 2
focus: all
last_updated: 2026-04-26

## Focus: Full Audit (all areas)

> **Stack baselines:** `prompts/shared/project-context.md` (v5), `AGENTS.md` (§ Baseline 2026-04). Use **npm** / `package-lock.json` only; Electron 41; embeddings Nomic; no SheetJS (`xlsx`).

Perform a comprehensive audit covering:

1. **Security:** IPC validation, SQL injection, path traversal
2. **TypeScript:** `any` types, missing `import type`, null safety
3. **i18n:** missing translations in `app/lib/i18n.ts`
4. **Code quality:** hardcoded colors, dead code, console.logs
5. **React:** `useEffect` cleanup, direct state mutations
6. **Errors:** missing Error Boundaries, IPC try/catch

### Priority order

Security > Errors > TypeScript > React > Code quality > i18n.

### Deliverable

Fix the top 5-10 most impactful issues. Do not try to fix everything at once.

### Tool use

Before proposing fixes, run the relevant tool-use checks documented in the
per-focus prompts (`prompts/audits/<focus>.md`). When in doubt, confirm the
pattern still exists in `main` before proposing a fix.