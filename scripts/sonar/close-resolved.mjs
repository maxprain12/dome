#!/usr/bin/env node
/**
 * Mark Sonar issues as RESOLVED when linked GitHub issues were closed by a merged PR.
 *
 * Requires a Sonar **User Token** (squ_…) with **Administer Issues** on the project
 * (not a Global Analysis Token sqa_…). Optional override: SONAR_ISSUE_ADMIN_TOKEN.
 *
 * Usage:
 *   SONAR_TOKEN=... GITHUB_TOKEN=... node scripts/sonar/close-resolved.mjs [--since-days=7]
 *   SONAR_CLOSE_RESOLVED=0  — skip entirely
 */

import {
  extractSonarKey,
  githubFetch,
  githubRepo,
  parseArgs,
  sonarFetch,
  sonarIssueAdminToken,
  sonarProjectKey,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const sinceDays = Number(args['since-days'] || 7);
const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
const adminToken = sonarIssueAdminToken();

if (process.env.SONAR_CLOSE_RESOLVED === '0' || process.env.SONAR_CLOSE_RESOLVED === 'false') {
  console.log('SONAR_CLOSE_RESOLVED=0 — skipping close-resolved');
  process.exit(0);
}

/** @param {string} message */
function printPermissionHelp(message) {
  console.warn('\n[close-resolved] Cannot transition Sonar issues (403 Insufficient privileges).');
  console.warn(message);
  console.warn('Fix in SonarQube:');
  console.warn(`  1. Project → ${sonarProjectKey()} → Project Settings → Permissions`);
  console.warn('  2. Grant "Administer Issues" to the Jenkins token user (or a dedicated bot user).');
  console.warn('  3. Token must be a User Token (squ_…), not Global Analysis Token (sqa_…).');
  console.warn('  4. Optional: set SONAR_ISSUE_ADMIN_TOKEN to a user token with that permission.');
  console.warn('Note: fixed issues still auto-close on the next dome-sonar analysis on main.\n');
}

/** @param {string} message */
function isInsufficientPrivileges(message) {
  return message.includes('(403)') || message.includes('Insufficient privileges');
}

/** @param {string} sonarKey */
async function getOpenSonarIssue(sonarKey) {
  const data = await sonarFetch('/api/issues/search', { issues: sonarKey }, 'GET', adminToken);
  const issue = data.issues?.[0];
  if (!issue) return null;
  if (issue.status === 'CLOSED' || issue.resolution === 'FIXED') return null;
  return issue;
}

let page = 1;
let transitioned = 0;
let skippedAlreadyClosed = 0;
let permissionBlocked = false;

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
      const openIssue = await getOpenSonarIssue(sonarKey);
      if (!openIssue) {
        skippedAlreadyClosed++;
        continue;
      }

      await sonarFetch(
        '/api/issues/do_transition',
        { issue: sonarKey, transition: 'resolve' },
        'POST',
        adminToken,
      );
      console.log(`Resolved Sonar ${sonarKey} (GitHub #${gh.number})`);
      transitioned++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isInsufficientPrivileges(message)) {
        printPermissionHelp(message);
        permissionBlocked = true;
        break;
      }
      console.warn(`Skip ${sonarKey}: ${message}`);
    }
  }

  if (permissionBlocked) break;
  if (data.length < 100) break;
  page++;
}

if (skippedAlreadyClosed) {
  console.log(`Skipped ${skippedAlreadyClosed} issue(s) already closed/fixed in Sonar`);
}
if (permissionBlocked) {
  console.log('Done: 0 Sonar issue(s) marked resolved (missing Administer Issues permission)');
  process.exit(0);
}

console.log(`Done: ${transitioned} Sonar issue(s) marked resolved`);
