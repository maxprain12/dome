#!/usr/bin/env bash
# Pre-PR checks for Sonar quality-loop — mirrors GitHub CI required jobs.
# Used by OpenCode agent (before finish) and Jenkins Verify & PR stage.
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

echo "=== verify-batch-pr: typecheck ==="
pnpm run typecheck

echo "=== verify-batch-pr: lint (renderer) ==="
pnpm run lint

echo "=== verify-batch-pr: sonar clean-code patterns (P-011) ==="
pnpm run test:sonar-patterns
# Strict full-tree only here (progressive --diff is enforced on GitHub PR CI;
# quality-loop batches may touch files that still contain legacy void/node: debt).
pnpm run check:sonar-patterns

echo "=== verify-batch-pr: IPC inventory ==="
if ! pnpm run check:ipc-inventory; then
  echo "ipc-channels.md out of date — regenerating (common after electron/ipc edits)..."
  node scripts/generate-ipc-inventory.mjs
  pnpm run check:ipc-inventory
fi

echo "=== verify-batch-pr: build packages ==="
pnpm run build:packages

echo "=== verify-batch-pr: test coverage ==="
pnpm run test:coverage

echo "=== verify-batch-pr: Vite build ==="
pnpm run build

echo "=== verify-batch-pr: dependency structure ==="
pnpm run depcruise

echo "verify-batch-pr: OK"
