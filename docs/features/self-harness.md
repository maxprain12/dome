# Self-Harness CLI

Dome includes a development-only laboratory that lets a fixed model propose and validate bounded changes to its own agent harness. It follows the Self-Harness loop: verifier-grounded weakness mining, same-model proposal, isolated candidate evaluation, and conservative promotion.

The laboratory is not used by the packaged application and never changes `main` automatically.

## Quick start

```bash
pnpm self-harness:init -- --provider minimax --model MiniMax-M2.7
pnpm self-harness:run -- --experiment <id> --rounds 5 --width 4 --repeats 2
pnpm self-harness:report -- --experiment <id>
pnpm self-harness:promote -- --experiment <id>
```

Local state, traces, evidence bundles, candidate decisions, and reports are written under `.dome-self-harness/experiments/<id>/`. This directory is ignored by Git.

## Trust boundary

The proposer can search and read only declared harness paths and must submit a unified diff. It cannot read the held-out case list or access benchmark/controller files through its tools. The controller rejects patches outside the allowlist, patches over 8 files or 200 changed lines, and changes to the evaluator, bench, IPC, renderer, database, CI, or Self-Harness implementation.

Candidates run in detached temporary worktrees with isolated `DOME_PROFILE` and `DOME_BENCH_USER_DATA`. A candidate must pass the repository gates before benchmark evaluation.

Worktree dependency installation uses the frozen lockfile and prefers the local pnpm store. If an exact locked tarball is absent, pnpm may fetch it from the configured registry; this avoids making a warm Jenkins cache a hidden prerequisite while preserving deterministic dependency versions.

General dependency lifecycle scripts remain disabled. The controller explicitly materializes the locked Electron binary and then runs Dome's trusted `rebuild:natives` command so `better-sqlite3` and the other approved native runtimes match Electron's ABI before any benchmark starts.

## Promotion rule

A candidate is accepted only when it improves at least one split without reducing pass count on either held-in or held-out. Errors and timeouts may not increase, no security violation is allowed, and total tokens and p95 duration may grow by at most 20%.

`self-harness:promote` applies the winning lineage to a new `feat/self-harness-*` branch and commits it. It does not switch the operator's working tree, push, create a pull request, or merge.

## Reproducibility

The experiment manifest fixes the base commit, provider, model, split, seed, evaluator version, repeat count, concurrency, and budgets. `self-harness:resume` continues from the persisted state machine after an interruption.

Use `pnpm run test:self-harness` for control-plane tests. Real experiments require the same provider credential variables used by the Dome bench.

## Hourly Jenkins run

[`Jenkinsfile.self-harness`](../../Jenkinsfile.self-harness) runs the complete default experiment every hour (`5` rounds, `4` candidates per round, `2` repetitions) against a detached checkout of `origin/main`. Concurrent executions are disabled, so a slow experiment cannot overlap another run.

Configure a Pipeline from SCM using `Jenkinsfile.self-harness`. It reuses the repository's existing Jenkins string credentials:

- `minimax-api-key` for the fixed `minimax/MiniMax-M2.7` proposer and benchmark runtime.
- `github-quality-loop` for pushing the generated branch and operating the GitHub CLI.

Every run archives its reproducibility bundle and report. A completed experiment with no accepted lineage does not create a branch or PR. When at least one candidate survives all static, held-in, and sealed held-out gates, Jenkins creates the review branch, pushes it, opens a PR against `main`, and requests squash auto-merge. GitHub branch protection and required CI checks remain authoritative; Jenkins never merges directly or bypasses them.

The job is serialized and has a 24-hour timeout because the full suite may take longer than its one-hour trigger interval. Jenkins queues the next timer execution instead of running two experiments against the same worker concurrently.

The Docker job opts the benchmark process into `DOME_BENCH_NO_SANDBOX=1`. This adds Chromium's `--no-sandbox` flags only to the Linux Electron benchmark launched inside the isolated Jenkins container, where the SUID helper cannot be owned by root. Normal Dome and local benchmark launches retain Electron's sandbox.
