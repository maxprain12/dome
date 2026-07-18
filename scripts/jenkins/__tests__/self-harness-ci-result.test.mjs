import assert from "node:assert/strict";
import test from "node:test";
import { buildCiResult, buildPrBody } from "../self-harness-ci-result.mjs";

function fixture(lineage = []) {
  return {
    dir: "/repo/.dome-self-harness/experiments/jenkins-42",
    manifest: {
      id: "jenkins-42-20260718T220000Z",
      provider: "minimax",
      model: "MiniMax-M2.7",
      baseSha: "abc123",
      manifestHash: "manifest-hash",
    },
    state: { phase: "completed", round: 5, lineage },
  };
}

test("completed experiment without a lineage does not request publication", () => {
  const result = buildCiResult(fixture());
  assert.equal(result.hasPromotion, false);
  assert.equal(result.branch, null);
  assert.equal(result.promotedEdits, 0);
});

test("winning lineage produces a deterministic feature branch and PR body", () => {
  const result = buildCiResult({
    ...fixture([{ proposalId: "r0-c2" }, { proposalId: "r3-c1" }]),
    buildUrl: "https://jenkins.example/job/42/",
  });
  assert.equal(result.hasPromotion, true);
  assert.equal(
    result.branch,
    "feat/self-harness-minimax-m2-7-jenkins-42-20260718t220000z",
  );
  assert.deepEqual(result.winningProposalIds, ["r0-c2", "r3-c1"]);
  assert.match(
    buildPrBody(result),
    /GitHub branch protection remains authoritative/,
  );
  assert.match(buildPrBody(result), /https:\/\/jenkins\.example\/job\/42\//);
});

test("incomplete experiment cannot be published", () => {
  assert.throws(
    () =>
      buildCiResult({
        ...fixture(),
        state: { phase: "failed", round: 1, lineage: [] },
      }),
    /expected completed/,
  );
});
