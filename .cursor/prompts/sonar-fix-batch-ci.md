# Sonar quality loop (CI)

Fix the Sonar issues in the attached batch with **minimal, targeted diffs**. Jenkins commits, verifies, and opens the PR — you only edit source files.

## Workflow (strict)

1. For each issue: read the reported file — prefer ±40 lines around the reported line when the file is large.
2. Apply the **smallest** change that satisfies the Sonar rule and message.
3. Do **not** refactor, rename, or touch unrelated code.
4. Do **not** create branches, commits, PRs, or run `git`.
5. After all issues: run verify **once**:
   `pnpm run typecheck && pnpm run lint && pnpm run build:packages && pnpm run test:coverage`

## Tool discipline

- Go straight to reported paths; do not scan the whole repo.
- Do not load large generated/vendor files.
- **Never replace an entire file** with a snippet — patch in place at the reported line only.
- `app/globals.css` and large `electron/**/*.cjs` files: surgical edits only; deleting thousands of lines is a failure.

## Priority

SECURITY → RELIABILITY → maintainability (void operator, complexity).

## Finish

Reply with: files changed | Sonar keys addressed | verify pass/fail.
