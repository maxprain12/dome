#!/usr/bin/env node
/**
 * Build user prompt for OpenCode sonar-fix agent from batch JSON.
 *
 * Usage: node scripts/sonar/build-opencode-prompt.mjs --batch=.quality-loop/batch.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

/** @param {Record<string, unknown>} issue */
function formatIssue(issue) {
  const component = String(issue.component || '');
  const file = component.includes(':') ? component.split(':').slice(1).join(':') : component;
  const line = issue.line ? `:${issue.line}` : '';
  const impact = issue.impacts?.[0]?.softwareQuality || '';
  return [
    `### ${issue.key || issue.sonarKey || 'unknown'}`,
    `- Rule: \`${issue.rule || 'unknown'}\`${impact ? ` (${impact})` : ''}`,
    `- File: \`${file}${line}\``,
    `- Message: ${issue.message || issue.title || ''}`,
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
  const issueBlock =
    issues.length > 0
      ? issues.map(formatIssue).join('\n\n')
      : '_No issues in batch._';

  return `Fix these ${issues.length} Sonar issue(s) from the attached batch JSON:

${issueBlock}`;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  process.stdout.write(buildOpencodePrompt());
}

export { buildOpencodePrompt, formatIssue };
