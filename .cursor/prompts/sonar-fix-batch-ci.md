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

## Priority

SECURITY → RELIABILITY → maintainability (void operator, complexity, nesting depth).

## Finish (only after verify-batch-pr.sh exits 0)

Reply with: files changed | Sonar keys addressed | verify pass/fail (must be **pass**).
