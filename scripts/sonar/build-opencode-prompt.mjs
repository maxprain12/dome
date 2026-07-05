#!/usr/bin/env node
/**
 * Build user prompt for OpenCode sonar-fix agent from batch JSON.
 *
 * Usage: node scripts/sonar/build-opencode-prompt.mjs --batch=.quality-loop/batch.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchAllowedFiles, componentToRelativePath, isVoidOperatorRule, parseArgs } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

/** @param {string} rule */
function actionHint(rule) {
  const r = String(rule || '');
  if (isVoidOperatorRule(r)) {
    return 'Remove void **operator** only (`() => void fn()` → `() => fn()`). Never remove `void` from type annotations (`() => void`).';
  }
  if (r.endsWith(':S3776') || r.endsWith(':S1541')) {
    return 'Extract helpers to reduce complexity; preserve observable behavior; no unrelated refactor.';
  }
  if (r.endsWith(':S2004')) {
    return 'Reduce nesting depth with early returns/guards; preserve behavior.';
  }
  return 'Minimal fix for the Sonar message at the reported line; no unrelated edits.';
}

/** @param {Record<string, unknown>} issue */
export function formatIssue(issue) {
  const file = componentToRelativePath(String(issue.component || ''));
  const line = issue.line ? `:${issue.line}` : '';
  const impact = issue.impacts?.[0]?.softwareQuality || '';
  const key = issue.key || issue.sonarKey || 'unknown';
  return [
    `### ${key}`,
    `- RULE: \`${issue.rule || 'unknown'}\`${impact ? ` (${impact})` : ''}`,
    `- FILE: \`${file}${line}\``,
    `- MESSAGE: ${issue.message || issue.title || ''}`,
    `- ACTION: ${actionHint(String(issue.rule || ''))}`,
    `- DONE_WHEN: issue rule satisfied; verify-batch-pr.sh passes`,
    issue.githubNumber ? `- GitHub: #${issue.githubNumber}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildOpencodePrompt(batchPathArg = batchPath) {
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

  return `Fix these ${issues.length} Sonar issue(s) from the attached batch JSON.

## Manifest (mandatory)

ALLOWED_FILES:
${allowed.map((f) => `- \`${f}\``).join('\n')}

FORBIDDEN:
- Touching files outside ALLOWED_FILES (except regenerating \`docs/architecture/ipc-channels.md\` after IPC edits)
- \`pnpm-lock.yaml\`, \`package.json\`, \`.jenkins-*\`, deleting/truncating large files
- Unrequested refactors, renames, or behavior changes

## Issues

${issueBlock}`;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  process.stdout.write(buildOpencodePrompt());
}

export { buildOpencodePrompt };
