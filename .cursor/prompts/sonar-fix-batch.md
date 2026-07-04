# Sonar fix batch — agent prompt

Process the next Sonar quality batch for repo **maxprain12/dome**.

## Input

1. Read `.quality-loop/batch.json` if present.
2. Otherwise: `pnpm run sonar:pick-batch -- --size=5 --out=.quality-loop/batch.json` (needs `SONAR_TOKEN`, `GITHUB_TOKEN`).
3. Or: oldest open GitHub issue with labels `sonar` + `sonar-security` / `sonar-reliability` / `sonar-high`.

## Task

For each issue in the batch (max 5):

1. Open the file at the reported line; understand the Sonar rule and message.
2. Apply the **smallest** fix that resolves the issue.
3. If logic in `electron/` or `packages/` changed, add a focused unit test.
4. Do not refactor unrelated code.

## Verify

```bash
pnpm run typecheck
pnpm run lint
pnpm run build:packages
pnpm run test:coverage
```

## Deliver

1. Branch from `main`: `fix/sonar-<rule-slug>-<github-issue-number>`
2. Commit with message: `fix(sonar): <short description> (Closes #N)`
3. Open PR with:
   - Summary table: Sonar key | Rule | File
   - `Closes #N` for each GitHub issue in the batch
   - Test plan checklist
4. **Do not merge.**

## Priority

1. SECURITY (`sonar-security`)
2. RELIABILITY (`sonar-reliability`)
3. Maintainability HIGH (void operator, cognitive complexity)

Follow `.cursor/rules/sonar-fix-batch.mdc`, `tests-required.mdc`, and `no-void-operator.mdc`.
