import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createExperiment, runExperiment } from '../controller.mjs';
import { removeWorktree } from '../execution.mjs';

const patch = `diff --git a/electron/agents/agent-runtime.cjs b/electron/agents/agent-runtime.cjs
--- a/electron/agents/agent-runtime.cjs
+++ b/electron/agents/agent-runtime.cjs
@@ -622,2 +622,2 @@
-/** Build a \`shouldStopAfterTurn\` that bounds the run to \`limit\` turns. */
+/** Bound each run to the configured turn limit. */
 function buildTurnLimiter(limit) {
`;

function record(caseId, outcome, tokens = 100, durationMs = 100) {
  return { caseId, outcome, durationMs, usage: { totalTokens: tokens }, toolsCalled: [] };
}

test('one controlled round rejects a regression and promotes the improvement', async (t) => {
  const id = `test-${Date.now()}-${process.pid}`;
  const created = createExperiment({
    id,
    provider: 'fake',
    model: 'fake-model',
    rounds: 1,
    width: 2,
    repeats: 1,
    seed: 'controller-test',
  });
  t.after(() => {
    if (fs.existsSync(path.join(created.dir, 'state.json'))) {
      const state = JSON.parse(fs.readFileSync(path.join(created.dir, 'state.json'), 'utf8'));
      for (const worktree of state.worktrees || []) removeWorktree(worktree);
    }
    fs.rmSync(created.dir, { recursive: true, force: true });
  });

  const proposals = [
    {
      id: 'improves', patch, targetMechanism: 'tool_selection', summary: 'improve',
      expectedEffect: 'more passes', regressionRisks: [], expectedTests: ['fake'],
    },
    {
      id: 'regresses', patch, targetMechanism: 'tool_scope', summary: 'regress',
      expectedEffect: 'fewer passes', regressionRisks: [], expectedTests: ['fake'],
    },
  ];
  const adapters = {
    gates: async () => [{ name: 'fake', code: 0 }],
    generateProposals: async () => proposals,
    evaluate: async ({ candidateId }) => {
      if (candidateId === 'improves') {
        return {
          heldIn: [record('in-a', 'PASS'), record('in-b', 'PASS')],
          heldOut: [record('out-a', 'PASS'), record('out-b', 'PASS')],
        };
      }
      if (candidateId === 'regresses') {
        return {
          heldIn: [record('in-a', 'FAIL_STRUCTURAL'), record('in-b', 'FAIL_STRUCTURAL')],
          heldOut: [record('out-a', 'PASS'), record('out-b', 'FAIL_STRUCTURAL')],
        };
      }
      return {
        heldIn: [record('in-a', 'PASS'), record('in-b', 'FAIL_STRUCTURAL')],
        heldOut: [record('out-a', 'PASS'), record('out-b', 'FAIL_STRUCTURAL')],
      };
    },
  };

  const result = await runExperiment(id, { rounds: 1, width: 2, repeats: 1 }, adapters);
  assert.equal(result.state.phase, 'completed');
  assert.equal(result.state.lineage.length, 1);
  assert.equal(result.state.lineage[0].proposalId, 'improves');
  const decisions = JSON.parse(fs.readFileSync(path.join(created.dir, 'rounds/0/candidate-evaluations.json'), 'utf8'));
  assert.equal(decisions.find((item) => item.id === 'regresses').status, 'rejected');
  assert.equal(fs.existsSync(path.join(created.dir, 'report.md')), true);
});
