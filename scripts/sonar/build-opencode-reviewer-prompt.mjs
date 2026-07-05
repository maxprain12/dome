#!/usr/bin/env node
/**
 * Build reviewer prompt from batch JSON + current git diff summary.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchAllowedFiles, parseArgs } from './lib.mjs';
import { formatIssue } from './build-opencode-prompt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

function gitDiffStat() {
  try {
    return execFileSync('git', ['diff', '--stat', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '_No diff._';
  }
}

function gitDiffNames() {
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function buildOpencodeReviewerPrompt(batchPathArg = batchPath) {
  const resolved = path.isAbsolute(batchPathArg)
    ? batchPathArg
    : path.resolve(ROOT, batchPathArg);
  const batchPayload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const issues = batchPayload.batch || [];
  const allowed = [...batchAllowedFiles(batchPayload)].sort();
  const issueBlock =
    issues.length > 0
      ? issues.map(formatIssue).join('\n\n')
      : '_No issues in batch._';

  return `Review the quality-loop diff for this batch of ${issues.length} Sonar issue(s).

## Batch issues
${issueBlock}

## Allowed files (scope)
${allowed.map((f) => `- \`${f}\``).join('\n')}

## Changed files
${gitDiffNames() || '_none_'}

## Diff stat
\`\`\`
${gitDiffStat()}
\`\`\`

Audit whether the diff fixes the batch issues with minimal scope and no behavior risk.
Reply with ONLY a JSON object (no markdown fence) matching the schema in your system prompt.`;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  process.stdout.write(buildOpencodeReviewerPrompt());
}
