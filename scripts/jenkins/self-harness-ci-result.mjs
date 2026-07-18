#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectExperiment } from "../self-harness/controller.mjs";
import { sanitizeSlug, writeJson } from "../self-harness/io.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function buildCiResult({ manifest, state, dir, buildUrl = null }) {
  if (state.phase !== "completed") {
    throw new Error(
      `Experiment ${manifest.id} is ${state.phase}; expected completed`,
    );
  }

  const hasPromotion = state.lineage.length > 0;
  const branch = hasPromotion
    ? `feat/self-harness-${sanitizeSlug(manifest.model)}-${sanitizeSlug(manifest.id)}`
    : null;
  return {
    schemaVersion: 1,
    experimentId: manifest.id,
    provider: manifest.provider,
    model: manifest.model,
    baseSha: manifest.baseSha,
    manifestHash: manifest.manifestHash,
    completedRounds: state.round,
    promotedEdits: state.lineage.length,
    winningProposalIds: state.lineage.map((entry) => entry.proposalId),
    hasPromotion,
    branch,
    reportPath: path.relative(REPO_ROOT, path.join(dir, "report.md")),
    buildUrl,
  };
}

export function buildPrBody(result) {
  const proposals = result.winningProposalIds
    .map((id) => `- \`${id}\``)
    .join("\n");
  return `## Automated Self-Harness improvement

Jenkins completed the sealed Self-Harness suite and found a non-regressive winning lineage.

| Field | Value |
|---|---|
| Experiment | \`${result.experimentId}\` |
| Model | \`${result.provider}/${result.model}\` |
| Base commit | \`${result.baseSha}\` |
| Completed rounds | ${result.completedRounds} |
| Promoted edits | ${result.promotedEdits} |
| Jenkins build | ${result.buildUrl ? `[open build](${result.buildUrl})` : "not available"} |

### Winning proposals

${proposals || "_None._"}

Every promoted candidate passed the repository static gates plus repeated held-in and sealed held-out evaluation. Auto-merge is requested, but GitHub branch protection remains authoritative and will wait for all required checks.
`;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${item}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.experiment) throw new Error("Missing --experiment");
  const output = path.resolve(
    args.output || ".dome-self-harness/jenkins-result.json",
  );
  const prBody = path.resolve(
    args["pr-body"] || ".dome-self-harness/jenkins-pr-body.md",
  );
  const result = buildCiResult({
    ...inspectExperiment(args.experiment),
    buildUrl: process.env.BUILD_URL || null,
  });
  writeJson(output, result);
  fs.mkdirSync(path.dirname(prBody), { recursive: true });
  fs.writeFileSync(prBody, buildPrBody(result), "utf8");
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`[self-harness-ci-result] ${error.message}`);
    process.exitCode = 1;
  }
}
