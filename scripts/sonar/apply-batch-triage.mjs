#!/usr/bin/env node
/**
 * Apply triage verdict to batch.json (fix subset only).
 *
 * Usage: node scripts/sonar/apply-batch-triage.mjs --batch=.quality-loop/batch.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';
import { heuristicBatchTriage } from './triage-batch-heuristic.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
const verdictPath = path.resolve(args.verdict || '.quality-loop/triage-verdict.json');
const outDir = path.dirname(batchPath);

if (!fs.existsSync(batchPath)) {
  console.error(`Batch file not found: ${batchPath}`);
  process.exit(1);
}

/** @type {{ batch?: Array<Record<string, unknown>>, pickedAt?: string, batchSize?: number, count?: number, triage?: Record<string, unknown> }} */
const original = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const issues = original.batch || [];

/** @type {{ fix?: string[], defer?: string[], source?: string, notes?: string }} */
let verdict;
if (fs.existsSync(verdictPath)) {
  verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
} else {
  verdict = heuristicBatchTriage(original);
}

const fixKeys = new Set((verdict.fix || []).map(String));
const deferKeys = new Set((verdict.defer || []).map(String));

const fixIssues = issues.filter((i) => fixKeys.has(String(i.key || i.sonarKey)));
const deferIssues = issues.filter((i) => deferKeys.has(String(i.key || i.sonarKey)));

// Issues missing from both lists → defer (safe default)
const unclassified = issues.filter(
  (i) => !fixKeys.has(String(i.key || i.sonarKey)) && !deferKeys.has(String(i.key || i.sonarKey)),
);
if (unclassified.length > 0) {
  console.warn(
    `[SonarTriage] ${unclassified.length} issue(s) not classified — deferring:`,
    unclassified.map((i) => i.key).join(', '),
  );
  for (const i of unclassified) {
    deferIssues.push(i);
    deferKeys.add(String(i.key || i.sonarKey));
  }
}

const filtered = {
  ...original,
  count: fixIssues.length,
  triage: {
    appliedAt: new Date().toISOString(),
    source: verdict.source || 'unknown',
    notes: verdict.notes || '',
    fixKeys: [...fixKeys],
    deferKeys: [...deferKeys],
  },
  batch: fixIssues,
};

fs.writeFileSync(batchPath, `${JSON.stringify(filtered, null, 2)}\n`);
fs.writeFileSync(
  path.join(outDir, 'batch-deferred.json'),
  `${JSON.stringify(
    {
      deferredAt: new Date().toISOString(),
      count: deferIssues.length,
      batch: deferIssues,
    },
    null,
    2,
  )}\n`,
);

const applied = {
  fixCount: fixIssues.length,
  deferCount: deferIssues.length,
  allDeferred: fixIssues.length === 0,
  source: verdict.source || 'unknown',
};

fs.writeFileSync(path.join(outDir, 'triage-applied.json'), `${JSON.stringify(applied, null, 2)}\n`);

console.log(
  `apply-batch-triage: ${fixIssues.length} fix, ${deferIssues.length} defer (source=${applied.source})`,
);

if (fixIssues.length === 0) {
  console.log('apply-batch-triage: all issues deferred — fixer stages will be skipped');
}

process.exit(0);
