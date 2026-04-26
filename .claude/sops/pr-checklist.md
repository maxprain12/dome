# SOP: PR Checklist

Before every PR is considered ready, verify each item below.

## Process Separation (Critical)

- [ ] No Node.js modules or non-standard virtual imports in `app/` (check: `better-sqlite3`, `node:fs`, `electron`, `bun:` prefix)
- [ ] New IPC channels are whitelisted in `electron/preload.cjs` ALLOWED_CHANNELS
- [ ] New IPC handlers are registered in `electron/ipc/index.cjs`
- [ ] Any file system access goes through IPC, never directly from renderer

## i18n

- [ ] All new user-visible strings use `t('some.key')` via `useTranslation()`
- [ ] New translation keys added to all 4 languages in `app/lib/i18n.ts` (en, es, fr, pt)
- [ ] No hardcoded Spanish or English strings in UI components

## UI / Styling

- [ ] Colors use CSS variables (`var(--primary-text)`, `var(--accent)`, etc.), not hardcoded hex values
- [ ] Interactive elements (buttons, links) use `--accent`
- [ ] New components tested in both light and dark theme

## TypeScript

- [ ] No `any` types introduced without justification
- [ ] Type-only imports use `import type { }` (verbatimModuleSyntax is on)
- [ ] No `@ts-ignore` or `@ts-expect-error` without a comment explaining why

## Automated Checks

CI will verify these automatically, but check locally first:

```bash
# TypeScript
npx tsc --noEmit

# Lint
npx eslint app/

# Architecture: must return 0 results
grep -rE "bun:|require('fs')\|require('better-sqlite3')" app/
```
