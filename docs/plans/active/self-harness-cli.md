---
title: Self-Harness CLI
status: implemented
date: 2026-07-18
---

# Self-Harness CLI

Implement a controlled CLI loop where a fixed Dome model mines verifier-grounded failures, proposes bounded changes to the complete declared harness surface, validates every candidate in an isolated worktree, and leaves the winning lineage on a review branch only.

## Invariants

- The control plane, evaluator, cases, held-out evidence, CI, IPC, renderer, and database are not editable by candidates.
- The proposer uses only controlled repository read/search operations and patch submission.
- Promotion requires non-regression on held-in and held-out plus repository gates and resource budgets.
- Experiments start from a committed SHA and never include uncommitted operator changes.
- No command pushes, opens a PR, merges, or switches the operator's working tree.

## Verification

```bash
pnpm run test:self-harness
node --test electron/__tests__/bench-self-harness-options.test.mjs
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check:ipc-inventory
pnpm run check:sonar-patterns
pnpm run depcruise
```
