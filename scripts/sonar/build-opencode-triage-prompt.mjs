#!/usr/bin/env node
/**
 * Build triage user prompt from batch JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchAllowedFiles, componentToRelativePath, parseArgs } from './lib.mjs';
import { formatIssue } from './build-opencode-prompt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

const MIGRATIONS_CJS = 'electron/core/db/migrations.cjs';

/** @param {string} file */
function fileLineCount(file) {
  try {
    const abs = path.resolve(ROOT, file);
    const src = fs.readFileSync(abs, 'utf8');
    return src.split('\n').length;
  } catch {
    return 0;
  }
}

export function buildOpencodeTriagePrompt(batchPathArg = batchPath) {
  const resolved = path.isAbsolute(batchPathArg)
    ? batchPathArg
    : path.resolve(ROOT, batchPathArg);
  const batchPayload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const issues = batchPayload.batch || [];
  const allowed = [...batchAllowedFiles(batchPayload)].sort();

  const fileHints = allowed
    .map((f) => {
      const lines = fileLineCount(f);
      const tag =
        f === MIGRATIONS_CJS
          ? ' **CRITICAL DB MIGRATIONS**'
          : lines > 1500
            ? ' **LARGE FILE**'
            : '';
      return `- \`${f}\` (~${lines} lines)${tag}`;
    })
    .join('\n');

  const issueBlock =
    issues.length > 0
      ? issues.map(formatIssue).join('\n\n')
      : '_No issues in batch._';

  return `Triage this Sonar batch of ${issues.length} issue(s) for the quality-loop fixer.

Fixer budget: ~50 minutes (MiniMax-M3). Prefer a focused subset that can complete with tests.

## Batch issues
${issueBlock}

## Files in batch
${fileHints}

Decide fix vs defer for each issue key. Reply with ONLY the JSON object from your system prompt.`;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  process.stdout.write(buildOpencodeTriagePrompt());
}
