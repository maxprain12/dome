#!/usr/bin/env node
/**
 * Create a PR for a Sonar quality-loop batch (used by Jenkins).
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sonar/create-batch-pr.mjs --batch=.quality-loop/batch.json [--branch=fix/sonar-batch-...]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubRepo, parseArgs } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const branch =
  args.branch ||
  process.env.SONAR_LOOP_BRANCH ||
  `fix/sonar-batch-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

const isCoverage = batch.kind === 'coverage';
const closes = (batch.batch || [])
  .map((i) => i.githubNumber)
  .filter(Boolean)
  .map((n) => `Closes #${n}`);

/** @param {string} rel */
function readJsonIfExists(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const fastGates = readJsonIfExists('.quality-loop/fast-gates.json');
const review = readJsonIfExists('.quality-loop/review-verdict.json');

const gateRows = fastGates
  ? `| Fast gates | ${fastGates.overall || 'unknown'} |`
  : '| Fast gates | (not run) |';

const reviewRow = review
  ? `| LLM reviewer | ${review.verdict || 'unknown'} |`
  : '| LLM reviewer | (skipped) |';

const coverageTargets = isCoverage
  ? (batch.batch || [])
      .map((i) => {
        const file = String(i.component || '').includes(':')
          ? String(i.component).split(':').slice(1).join(':')
          : String(i.component || '');
        return file ? `- \`${file}\` (${i.uncoveredLines ?? '?'} uncovered lines)` : null;
      })
      .filter(Boolean)
      .join('\n')
  : '';

const body = isCoverage
  ? `## Sonar coverage growth (Jenkins)

Automated tests from \`.quality-loop/batch.json\` (\`kind: coverage\`).

### Targets
${coverageTargets || '_See batch JSON._'}

## Local gates (Jenkins)

| Gate | Result |
|------|--------|
${gateRows}
${reviewRow}
| Full verify | pass |
| GitHub CI | pending |

## Checks (GitHub CI)
- typecheck, lint, test:coverage, build, depcruise
`
  : `## Sonar quality loop (Jenkins)

Automated fix from \`.quality-loop/batch.json\`.

${closes.length ? closes.join('\n') : '_No linked GitHub issue numbers in batch._'}

## Local gates (Jenkins)

| Gate | Result |
|------|--------|
${gateRows}
${reviewRow}
| Full verify | pass |
| GitHub CI | pending |

## Checks (GitHub CI)
- typecheck, lint, test:coverage, build, depcruise
`;

const bodyFile = path.join(root, '.quality-loop', 'pr-body.md');
fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
fs.writeFileSync(bodyFile, body);

const prTitle = isCoverage
  ? 'test(sonar): coverage growth batch'
  : 'fix(sonar): quality loop batch';

const repo = githubRepo();
const prUrl = execFileSync(
  'gh',
  [
    'pr',
    'create',
    '--repo',
    repo,
    '--base',
    process.env.SONAR_LOOP_BASE_BRANCH || 'main',
    '--title',
    prTitle,
    '--body-file',
    bodyFile,
    '--head',
    branch,
  ],
  { cwd: root, encoding: 'utf8' },
).trim();

execFileSync(
  'gh',
  ['pr', 'merge', prUrl, '--auto', '--squash', '--repo', repo],
  { cwd: root, stdio: 'inherit' },
);

console.log(`PR created with auto-merge (squash): ${prUrl}`);
