#!/usr/bin/env node
/**
 * Mark Sonar issues as RESOLVED when linked GitHub issues were closed by a merged PR.
 *
 * Usage:
 *   SONAR_TOKEN=... GITHUB_TOKEN=... node scripts/sonar/close-resolved.mjs [--since-days=7]
 */

import {
  extractSonarKey,
  githubFetch,
  githubRepo,
  parseArgs,
  sonarFetch,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const sinceDays = Number(args['since-days'] || 7);
const since = new Date(Date.now() - sinceDays * 86400000).toISOString();

let page = 1;
let transitioned = 0;

while (true) {
  const data = await githubFetch('GET', `/repos/${githubRepo()}/issues`, {
    state: 'closed',
    labels: 'sonar',
    per_page: '100',
    page: String(page),
    sort: 'updated',
    direction: 'desc',
  });
  if (!data || data.length === 0) break;

  for (const gh of data) {
    if (gh.pull_request) continue;
    if (gh.closed_at && gh.closed_at < since) continue;
    const sonarKey = extractSonarKey(gh.body || '');
    if (!sonarKey) continue;

    try {
      await sonarFetch(
        '/api/issues/do_transition',
        { issue: sonarKey, transition: 'resolve' },
        'POST',
      );
      console.log(`Resolved Sonar ${sonarKey} (GitHub #${gh.number})`);
      transitioned++;
    } catch (err) {
      console.warn(`Skip ${sonarKey}: ${err.message}`);
    }
  }

  if (data.length < 100) break;
  page++;
}

console.log(`Done: ${transitioned} Sonar issue(s) marked resolved`);
