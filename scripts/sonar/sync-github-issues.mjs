#!/usr/bin/env node
/**
 * Sync SonarQube OPEN issues → GitHub Issues (dedupe by sonarKey in body).
 *
 * Usage:
 *   SONAR_TOKEN=... GITHUB_TOKEN=... node scripts/sonar/sync-github-issues.mjs [--severity=HIGH,MAJOR] [--max=50]
 */

import { execFileSync } from 'node:child_process';
import {
  extractSonarKey,
  formatGithubIssueBody,
  formatGithubIssueTitle,
  githubFetch,
  githubRepo,
  parseArgs,
  sonarFetch,
  sonarImpactLabel,
  sonarProjectKey,
  sonarSeverityLabel,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const severities = (args.severity || 'BLOCKER,CRITICAL,MAJOR,HIGH').split(',').map((s) => s.trim());
const maxCreate = Number(args.max || 50);
const dryRun = args['dry-run'] === 'true';

/** @type {Set<string>} */
const existingKeys = new Set();

async function loadExistingGithubIssues() {
  let page = 1;
  while (true) {
    const data = await githubFetch('GET', `/repos/${githubRepo()}/issues`, {
      state: 'open',
      labels: 'sonar',
      per_page: '100',
      page: String(page),
    });
    if (!data || data.length === 0) break;
    for (const issue of data) {
      const key = extractSonarKey(issue.body || '');
      if (key) existingKeys.add(key);
    }
    if (data.length < 100) break;
    page++;
  }
}

/** @param {string} name */
function ensureLabel(name) {
  if (dryRun) {
    console.log(`[dry-run] would ensure label ${name}`);
    return;
  }
  execFileSync(
    'gh',
    ['label', 'create', name, '--repo', githubRepo(), '--force', '--color', '1d76db'],
    { stdio: 'pipe' },
  );
}

/** @param {Record<string, unknown>} issue */
async function createGithubIssue(issue) {
  const labels = [
    'sonar',
    sonarSeverityLabel(String(issue.severity)),
    sonarImpactLabel(issue.impacts?.[0]?.softwareQuality),
  ];
  const title = formatGithubIssueTitle(/** @type {Parameters<typeof formatGithubIssueTitle>[0]} */ (issue));
  const body = formatGithubIssueBody(/** @type {Parameters<typeof formatGithubIssueBody>[0]} */ (issue));

  if (dryRun) {
    console.log(`[dry-run] would create: ${title}`);
    return;
  }

  for (const label of labels) {
    ensureLabel(label);
  }

  const json = execFileSync(
    'gh',
    [
      'issue',
      'create',
      '--repo',
      githubRepo(),
      '--title',
      title,
      '--body',
      body,
      ...labels.flatMap((l) => ['--label', l]),
    ],
    { encoding: 'utf8' },
  );
  console.log(json.trim());
}

await loadExistingGithubIssues();
console.log(`Found ${existingKeys.size} existing open GitHub issues with sonarKey`);

/** @type {Array<Record<string, unknown>>} */
const candidates = [];
let page = 1;

while (candidates.length < maxCreate) {
  const data = await sonarFetch('/api/issues/search', {
    componentKeys: sonarProjectKey(),
    statuses: 'OPEN,CONFIRMED,REOPENED',
    severities: severities.join(','),
    ps: 100,
    p: page,
    s: 'SEVERITY',
    asc: 'false',
  });

  const issues = data.issues || [];
  if (issues.length === 0) break;

  for (const issue of issues) {
    if (existingKeys.has(issue.key)) continue;
    candidates.push(issue);
    if (candidates.length >= maxCreate) break;
  }

  if (issues.length < 100) break;
  page++;
}

// Prioritize SECURITY then RELIABILITY
const priority = { SECURITY: 0, RELIABILITY: 1, MAINTAINABILITY: 2 };
candidates.sort((a, b) => {
  const ia = priority[a.impacts?.[0]?.softwareQuality] ?? 3;
  const ib = priority[b.impacts?.[0]?.softwareQuality] ?? 3;
  return ia - ib;
});

let created = 0;
for (const issue of candidates) {
  await createGithubIssue(issue);
  existingKeys.add(issue.key);
  created++;
}

console.log(`Sync complete: created ${created} GitHub issue(s)`);
