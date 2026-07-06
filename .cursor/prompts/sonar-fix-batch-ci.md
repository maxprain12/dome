# Sonar quality loop (CI)

Fix the Sonar issues in the attached batch with **minimal, targeted diffs**. Jenkins commits, verifies, and opens the PR — you only edit source files.

## Workflow (strict)

1. For each issue: read the reported file — prefer ±40 lines around the reported line when the file is large.
2. Apply the **smallest** change that satisfies the Sonar rule and message.
3. Do **not** refactor, rename, or touch unrelated code.
4. Do **not** create branches, commits, PRs, or run `git`.
5. **Before you finish:** run the full pre-PR verify (mandatory — PR auto-merge waits on GitHub CI):

   ```bash
   bash scripts/jenkins/verify-batch-pr.sh
   ```

   If it fails, fix the errors and **re-run until exit 0**. Do not reply "done" or "verify pass" until this script succeeds.

## Verify checklist (what the script runs)

Same gates as GitHub CI on batch PRs:

| Step | Command (inside script) |
|------|-------------------------|
| Types | `pnpm run typecheck` |
| Lint | `pnpm run lint` (0 **errors**; warnings OK) |
| IPC docs | `pnpm run check:ipc-inventory` (auto-regenerates `docs/architecture/ipc-channels.md` if stale) |
| Packages | `pnpm run build:packages` |
| Tests | `pnpm run test:coverage` |
| Renderer build | `pnpm run build` |
| Dep structure | `pnpm run depcruise` |

### If you edit `electron/ipc/**`

Line numbers in IPC handlers change → `ipc-channels.md` must stay in sync. The verify script regenerates it when needed. **Stage/commit is Jenkins' job** — just ensure the regenerated file exists on disk after verify passes.

## Tool discipline

- Go straight to reported paths; do not scan the whole repo.
- Do not load large generated/vendor files.
- **Never replace an entire file** with a snippet — patch in place at the reported line only.
- `app/globals.css` and large `electron/**/*.cjs` files: surgical edits only; deleting thousands of lines is a failure.
- **Void operator (S7735):** remove `void` only as an expression operator (`() => void save()`). Never strip `void` from TypeScript types (`() => void`, `Promise<void>`).

## Large migration files (`electron/core/db/migrations.cjs`)

This file is **critical infrastructure**: it upgrades every user's SQLite database on app start. A mistake can brick local data or leave schema half-applied.

When the batch includes `electron/core/db/migrations.cjs` (especially S3776 / cognitive complexity):

1. **Treat it as high-risk** — behavior must stay identical for every `schema_version` step; do not change SQL, version numbers, or migration order.
2. **Work in sections** — read and refactor one migration block (or a small group) at a time; after each section, validate before moving on.
3. **Prefer extraction** — move repeated logic into top-level helpers or per-version functions; keep `applyMigrations` as a thin orchestrator. Avoid deleting migration bodies.
4. **Review affected areas** after each edit:
   - `applyMigrations(db, fromVersion, invalidateQueries)` contract unchanged
   - `settings.schema_version` still updated correctly
   - Callers: `electron/core/database.cjs`, `electron/core/db/drizzle-bridge.cjs`
5. **Run migration unit tests** after every meaningful change (mandatory before finish):

   ```bash
   node --test electron/__tests__/drizzle-bridge.test.mjs electron/__tests__/migration-backup.test.mjs
   ```

   If a test fails, fix before continuing. Then run full `bash scripts/jenkins/verify-batch-pr.sh`.
6. **Do not** use bulk transform scripts that rewrite the whole file without re-running tests between steps.

## Scope manifest

The user message includes `ALLOWED_FILES` and per-issue `ACTION` / `DONE_WHEN`. **Only edit ALLOWED_FILES.** If IPC changes require it, regenerate `docs/architecture/ipc-channels.md` via verify script only.

## Priority

SECURITY → RELIABILITY → maintainability (void operator, complexity, nesting depth).

## Finish (only after verify-batch-pr.sh exits 0)

Reply with: files changed | Sonar keys addressed | verify pass/fail (must be **pass**).
