#!/usr/bin/env node
/**
 * Close duplicate open GitHub issues that share the same Sonar **Key** in the body.
 * Keeps the oldest issue number per key; closes newer duplicates.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sonar/close-duplicate-github-issues.mjs [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { extractSonarKey, githubFetch, githubRepo, parseArgs } from './lib.mjs';

const dryRun = parseArgs(process.argv.slice(2))['dry-run'] === 'true';

/** @type {Map<string, Array<{ number: number; createdAt: string }>>} */
const byKey = new Map();

let page = 1;
while (true) {
  const data = await githubFetch('GET', `/repos/${githubRepo()}/issues`, {
    state: 'open',
    labels: 'sonar',
    per_page: '100',
    page: String(page),
    sort: 'created',
    direction: 'asc',
  });
  if (!data || data.length === 0) break;
  for (const issue of data) {
    if (issue.pull_request) continue;
    const key = extractSonarKey(issue.body || '');
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push({ number: issue.number, createdAt: issue.created_at });
    byKey.set(key, list);
  }
  if (data.length < 100) break;
  page++;
}

/** @type {number[]} */
const toClose = [];
for (const [, issues] of byKey) {
  if (issues.length <= 1) continue;
  issues.sort((a, b) => a.number - b.number);
  for (const dup of issues.slice(1)) {
    toClose.push(dup.number);
  }
}

toClose.sort((a, b) => a - b);
console.log(`Found ${toClose.length} duplicate issue(s) to close (keeping oldest per Sonar key)`);

for (const number of toClose) {
  if (dryRun) {
    console.log(`[dry-run] would close #${number}`);
    continue;
  }
  execFileSync(
    'gh',
    [
      'issue',
      'close',
      String(number),
      '--repo',
      githubRepo(),
      '--comment',
      'Duplicate Sonar sync issue (same **Key** as an older open issue). Closed by close-duplicate-github-issues.mjs.',
    ],
    { stdio: 'inherit' },
  );
}

console.log(dryRun ? 'Dry run complete' : `Closed ${toClose.length} duplicate issue(s)`);
