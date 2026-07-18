#!/usr/bin/env node
/**
 * Pre-check batch JSON before quality-loop fix stages.
 *
 * Usage: node scripts/sonar/validate-batch.mjs --batch=.quality-loop/batch.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentToRelativePath, parseArgs } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

/** Rules the loop knows how to handle (mechanical and/or agent). */
const KNOWN_RULE_SUFFIXES = [
  ':S7735', // void operator
  ':S3776', // cognitive complexity
  ':S2004', // nesting depth
  ':S1192', // string literals
  ':S1067', // expression complexity
  ':S1541', // function complexity
  ':S138', // function length
  ':S107', // too many parameters
  ':S1128', // unused imports
  ':S1481', // unused vars
  ':S1854', // useless assignment
  ':S3923', // conditional same value
  ':S3358', // nested ternary
  ':S6544', // optional chain
];

/** @param {string} rule */
function isKnownRule(rule) {
  const r = String(rule || '');
  return KNOWN_RULE_SUFFIXES.some((suffix) => r.endsWith(suffix));
}

if (!fs.existsSync(batchPath)) {
  console.error(`Batch file not found: ${batchPath}`);
  process.exit(1);
}

/** @type {{ batch?: Array<Record<string, unknown>> }} */
let payload;
try {
  payload = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
} catch (err) {
  console.error(`Invalid batch JSON: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const issues = payload.batch || [];
if (issues.length === 0) {
  console.error('Batch is empty — nothing to fix');
  process.exit(1);
}

const isCoverage = payload.kind === 'coverage';

let fail = 0;
const unknownRules = new Set();

for (let i = 0; i < issues.length; i++) {
  const issue = issues[i];
  const key = issue.key || issue.sonarKey;
  const rule = issue.rule;
  const component = issue.component;

  if (!key) {
    console.error(`Issue[${i}]: missing key/sonarKey`);
    fail = 1;
  }
  if (!rule) {
    console.error(`Issue[${i}] ${key}: missing rule`);
    fail = 1;
  }
  if (!component) {
    console.error(`Issue[${i}] ${key}: missing component`);
    fail = 1;
  }

  const file = componentToRelativePath(String(component || ''));
  if (file) {
    const abs = path.resolve(root, file);
    if (!fs.existsSync(abs)) {
      console.error(`Issue[${i}] ${key}: file not found on disk: ${file}`);
      fail = 1;
    }
  }

  if (isCoverage) {
    if (rule && rule !== 'dome:COVERAGE') {
      console.warn(`WARN: coverage batch unexpected rule: ${rule}`);
    }
  } else if (rule && !isKnownRule(String(rule))) {
    unknownRules.add(String(rule));
  }
}

if (!isCoverage && unknownRules.size > 0) {
  console.warn(
    `WARN: unknown rule(s) in batch (agent-only, no mechanical): ${[...unknownRules].join(', ')}`,
  );
}

if (fail) {
  console.error('validate-batch: FAILED');
  process.exit(1);
}

console.log(`validate-batch: OK (${issues.length} issue(s))`);
process.exit(0);
