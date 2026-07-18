# Sonar coverage growth (CI)

Raise Sonar/Jest/Vitest coverage by adding **focused unit tests** for the files in the attached coverage batch. Jenkins commits and opens the PR — you only edit source/test files.

## Workflow (strict)

1. Read each ALLOWED source file; identify pure helpers / branches with little coverage.
2. Add or extend colocated tests only (`*.test.ts(x)` under `app/` / `packages/`, or `electron/__tests__/*.test.mjs`).
3. Prefer testing logic without Electron IPC when possible; mock `window.electron` / Node APIs lightly.
4. Do **not** refactor production code unless a tiny extract is required to make a pure function testable (keep diffs minimal).
5. Do **not** create branches, commits, PRs, or run `git`.
6. **Before you finish:** run:

   ```bash
   bash scripts/jenkins/verify-batch-pr.sh
   ```

   Re-run until exit 0.

## Constraints

- Stay inside ALLOWED_FILES (source + implied test paths).
- No `pnpm-lock.yaml` / `package.json` edits.
- No giant snapshots; assert behavior on realistic inputs.
- One clear test file per source target is enough for this batch.

## Done when

- New/updated tests pass under `pnpm run test:coverage` (via verify-batch-pr).
- Diff is limited to the batch files.
