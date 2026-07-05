#!/usr/bin/env bash
# Parallel fast gates for Sonar quality loop (Tier 2).
# Writes .quality-loop/fast-gates.json
set -uo pipefail

ROOT="${1:-.}"
BATCH="${2:-.quality-loop/batch.json}"
cd "$ROOT"

OUT_DIR=".quality-loop"
mkdir -p "$OUT_DIR"
TS="$(date -Iseconds)"

run_typecheck() {
  pnpm run typecheck >"$OUT_DIR/gate-typecheck.log" 2>&1
}

run_lint() {
  pnpm exec eslint app/ --max-warnings 9999 >"$OUT_DIR/gate-lint.log" 2>&1
}

run_scope() {
  node scripts/sonar/validate-batch-scope.mjs --batch="$BATCH" >"$OUT_DIR/gate-scope.log" 2>&1
}

run_diff() {
  bash scripts/jenkins/verify-loop-diff.sh "$ROOT" >"$OUT_DIR/gate-diff.log" 2>&1
}

echo "=== run-fast-gates: starting parallel gates ==="
run_typecheck &
pid_tc=$!
run_lint &
pid_lint=$!
run_scope &
pid_scope=$!
run_diff &
pid_diff=$!

typecheck_rc=0
lint_rc=0
scope_rc=0
diff_rc=0

wait "$pid_tc" || typecheck_rc=$?
wait "$pid_lint" || lint_rc=$?
wait "$pid_scope" || scope_rc=$?
wait "$pid_diff" || diff_rc=$?

overall=0
for rc in "$typecheck_rc" "$lint_rc" "$scope_rc" "$diff_rc"; do
  if [ "$rc" -ne 0 ]; then
    overall=1
  fi
done

node --input-type=module -e "
import fs from 'node:fs';
const payload = {
  timestamp: process.env.TS,
  overall: process.env.OVERALL === '0' ? 'pass' : 'fail',
  gates: {
    typecheck: Number(process.env.TC),
    lint: Number(process.env.LINT),
    scope: Number(process.env.SCOPE),
    diff: Number(process.env.DIFF),
  },
};
fs.writeFileSync('.quality-loop/fast-gates.json', JSON.stringify(payload, null, 2) + '\n');
" \
  TS="$TS" OVERALL="$overall" TC="$typecheck_rc" LINT="$lint_rc" SCOPE="$scope_rc" DIFF="$diff_rc"

if [ "$overall" -ne 0 ]; then
  {
    echo "=== gate-failure @ $TS ==="
    for f in typecheck lint scope diff; do
      echo "--- $f ---"
      cat "$OUT_DIR/gate-${f}.log" 2>/dev/null || true
    done
  } >"$OUT_DIR/gate-failure.log"
  echo "run-fast-gates: FAILED (typecheck=$typecheck_rc lint=$lint_rc scope=$scope_rc diff=$diff_rc)"
  exit 1
fi

echo "run-fast-gates: OK"
exit 0
