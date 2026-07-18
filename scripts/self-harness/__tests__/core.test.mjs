import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateMetrics, evaluateCandidate, rankCandidates } from '../metrics.mjs';
import { buildEvidenceBundle, deriveFailureSignature } from '../mining.mjs';
import { isEditablePath, repoRead, validatePatch } from '../policy.mjs';
import { createStratifiedSplit } from '../split.mjs';
import { REPO_ROOT } from '../constants.mjs';
import { SELF_HARNESS_SCHEMAS } from '../schema-catalog.mjs';
import { DEPENDENCY_INSTALL_ARGS } from '../execution.mjs';
import { describeGateFailure } from '../controller.mjs';

const validPatch = `diff --git a/electron/agents/agent-runtime.cjs b/electron/agents/agent-runtime.cjs
--- a/electron/agents/agent-runtime.cjs
+++ b/electron/agents/agent-runtime.cjs
@@ -1,3 +1,3 @@
-old
+new
 context
`;

test('stratified split is deterministic, disjoint, and retains held-in cases', () => {
  const cases = [
    { id: 'a1', category: 'a' }, { id: 'a2', category: 'a' }, { id: 'a3', category: 'a' },
    { id: 'b1', category: 'b' }, { id: 'b2', category: 'b' },
  ];
  const first = createStratifiedSplit(cases, 'seed', 0.4);
  const second = createStratifiedSplit(cases, 'seed', 0.4);
  assert.deepEqual(first, second);
  assert.equal(first.heldIn.some((id) => first.heldOut.includes(id)), false);
  assert.equal(first.heldIn.length + first.heldOut.length, cases.length);
});

test('patch policy permits harness code and rejects trusted control plane', () => {
  assert.equal(validatePatch(validPatch).valid, true);
  const denied = validPatch.replaceAll('electron/agents/agent-runtime.cjs', 'electron/bench/validators.cjs');
  const result = validatePatch(denied);
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(' '), /outside editable harness surface/);
  assert.equal(isEditablePath('scripts/self-harness/controller.mjs'), false);
  const symlinkPatch = `${validPatch}\nnew file mode 120000\n`;
  assert.match(validatePatch(symlinkPatch).reasons.join(' '), /symlink/);
});

test('controlled repo reader cannot access held-out or bench files', () => {
  assert.match(repoRead(REPO_ROOT, 'electron/agents/agent-runtime.cjs', 1, 2), /^1:/);
  assert.throws(() => repoRead(REPO_ROOT, 'scripts/bench/cases/web/web_search.json'), /Read denied/);
  assert.throws(() => repoRead(REPO_ROOT, '../package.json'), /Unsafe repository path/);
});

test('failure mining separates terminal cause from agent mechanism', () => {
  const timeout = deriveFailureSignature({ outcome: 'FAIL_EXEC', error: 'Timeout after 60000ms' });
  assert.deepEqual(timeout, {
    terminalCause: 'timeout',
    causalStatus: 'agent_contributed',
    agentMechanism: 'unbounded_execution',
  });
  const bundle = buildEvidenceBundle([
    { caseId: 'one', outcome: 'FAIL_EXEC', error: 'Timeout after 1ms' },
    { caseId: 'two', outcome: 'FAIL_EXEC', error: 'Timeout after 1ms' },
    { caseId: 'pass', outcome: 'PASS', toolsCalled: ['ok'] },
  ]);
  assert.equal(bundle.patterns[0].support, 2);
  assert.deepEqual(bundle.patterns[0].caseIds, ['one', 'two']);
});

test('acceptance rejects split regressions and budget inflation', () => {
  const baselineIn = aggregateMetrics([{ outcome: 'PASS', durationMs: 100, usage: { totalTokens: 100 } }]);
  const baselineOut = aggregateMetrics([{ outcome: 'FAIL_STRUCTURAL', durationMs: 100, usage: { totalTokens: 100 } }]);
  const improvedOut = aggregateMetrics([{ outcome: 'PASS', durationMs: 110, usage: { totalTokens: 110 } }]);
  const accepted = evaluateCandidate({
    baselineIn, baselineOut, candidateIn: baselineIn, candidateOut: improvedOut,
    limits: { maxTokenRatio: 1.2, maxP95DurationRatio: 1.2 },
  });
  assert.equal(accepted.accepted, true);

  const inflated = aggregateMetrics([{ outcome: 'PASS', durationMs: 200, usage: { totalTokens: 500 } }]);
  const rejected = evaluateCandidate({
    baselineIn, baselineOut, candidateIn: baselineIn, candidateOut: inflated,
    limits: { maxTokenRatio: 1.2, maxP95DurationRatio: 1.2 },
  });
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reasons.join(' '), /token budget|duration budget/);
});

test('candidate ranking prioritizes held-out then held-in improvements', () => {
  const make = (deltaOut, deltaIn) => ({
    decision: { deltaOut, deltaIn },
    metrics: {
      heldIn: { errors: 0, totalTokens: 10, p95DurationMs: 10 },
      heldOut: { errors: 0, totalTokens: 10, p95DurationMs: 10 },
    },
  });
  const candidates = [make(0, 5), make(1, 0)].sort(rankCandidates);
  assert.equal(candidates[0].decision.deltaOut, 1);
});

test('schema catalog covers every persisted public artifact', () => {
  for (const name of [
    'ExperimentManifest', 'HarnessLineage', 'TraceRecord', 'FailureSignature',
    'EvidenceBundle', 'HarnessProposal', 'CandidateEvaluation', 'PromotionDecision',
  ]) {
    assert.equal(SELF_HARNESS_SCHEMAS[name].type, 'object');
  }
});

test('worktree install prefers cache but can fetch a missing locked tarball', () => {
  assert.equal(DEPENDENCY_INSTALL_ARGS.includes('--frozen-lockfile'), true);
  assert.equal(DEPENDENCY_INSTALL_ARGS.includes('--prefer-offline'), true);
  assert.equal(DEPENDENCY_INSTALL_ARGS.includes('--offline'), false);
});

test('static gate failures include the failing command output', () => {
  const message = describeGateFailure([
    { name: 'install', code: 1, stdout: 'ERR_PNPM_NO_OFFLINE_TARBALL missing package' },
  ]);
  assert.match(message, /install exited with code 1/);
  assert.match(message, /ERR_PNPM_NO_OFFLINE_TARBALL/);
});
