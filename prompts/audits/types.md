---
name: audit-types
description: TypeScript quality — remove `any`, add `import type`, clean non-null assertions.
version: 1
focus: types
last_updated: 2026-04-17
---

## Focus: TypeScript Quality

Audit the codebase for TypeScript issues:

1. Files using `any` type where a proper type can be inferred
2. Missing `import type` for type-only imports (`verbatimModuleSyntax` is ON)
3. Non-null assertions (`!`) that could be replaced with proper null checks
4. Inconsistent return types on functions
5. Missing types on exported functions/components

### Tool use (required before proposing fixes)

- `grep -rn ': any' app/ --include='*.ts' --include='*.tsx' | wc -l` — record count before/after
- `npm run typecheck` — must pass after every change. Do not commit if it doesn't.
- `npm run lint` — catches most missing `import type` issues automatically
- If a file has 10+ `any`, prioritize it; don't spread attention over many files

### Scope

Scan ALL of: `app/lib/`, `app/components/`, `electron/ipc/`.
Fix what you can. Focus on files with the most `any` types first.
