#!/usr/bin/env node
/**
 * Close duplicate / obsolete open GitHub sonar issues.
 *
 * 1. Same Sonar key on multiple OPEN issues → keep oldest, close newer.
 * 2. OPEN issue whose key already exists on a CLOSED issue → close the open one
 *    (prevents refile loops when Sonar is stale after a real fix).
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sonar/close-duplicate-github-issues.mjs [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { extractSonarKey, githubFetch, githubRepo, parseArgs } from './lib.mjs';

const dryRun = parseArgs(process.argv.slice(2))['dry-run'] === 'true';

/** @type {Map<string, Array<{ number: number; createdAt: string; state: string }>>} */
const byKey = new Map();
/** @type {Set<string>} */
const closedKeys = new Set();

let page = 1;
while (true) {
  const data = await githubFetch('GET', `/repos/${githubRepo()}/issues`, {
    state: 'all',
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
    if (issue.state === 'closed') {
      closedKeys.add(key);
      continue;
    }
    const list = byKey.get(key) || [];
    list.push({ number: issue.number, createdAt: issue.created_at, state: issue.state });
    byKey.set(key, list);
  }
  if (data.length < 100) break;
  page++;
}

/** @type {Array<{ number: number; reason: string }>} */
const toClose = [];

for (const [key, issues] of byKey) {
  if (closedKeys.has(key)) {
    for (const open of issues) {
      toClose.push({
        number: open.number,
        reason:
          'Sonar key already has a closed GitHub issue (stale refile). Closed by close-duplicate-github-issues.mjs.',
      });
    }
    continue;
  }
  if (issues.length <= 1) continue;
  issues.sort((a, b) => a.number - b.number);
  for (const dup of issues.slice(1)) {
    toClose.push({
      number: dup.number,
      reason:
        'Duplicate Sonar sync issue (same **Key** as an older open issue). Closed by close-duplicate-github-issues.mjs.',
    });
  }
}

toClose.sort((a, b) => a.number - b.number);
console.log(
  `Found ${toClose.length} issue(s) to close ` +
    `(${closedKeys.size} closed sonarKey(s) considered for refile cleanup)`,
);

for (const item of toClose) {
  if (dryRun) {
    console.log(`[dry-run] would close #${item.number}`);
    continue;
  }
  execFileSync(
    'gh',
    [
      'issue',
      'close',
      String(item.number),
      '--repo',
      githubRepo(),
      '--comment',
      item.reason,
    ],
    { stdio: 'inherit' },
  );
}

console.log(dryRun ? 'Dry run complete' : `Closed ${toClose.length} issue(s)`);
