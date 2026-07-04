#!/usr/bin/env node
/**
 * Pick a batch of related Sonar issues for a single fix PR.
 * Prefers same rule + same directory; prioritizes SECURITY/RELIABILITY.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sonar/pick-batch.mjs [--size=10] [--out=.quality-loop/batch.json]
 *   node scripts/sonar/pick-batch.mjs --from=issues.json --size=10
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  extractSonarKey,
  githubFetch,
  githubRepo,
  parseArgs,
  sonarFetch,
  sonarProjectKey,
  withIssueSeverityFilter,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const batchSize = Number(args.size || process.env.SONAR_BATCH_SIZE || 10);
const outPath = path.resolve(args.out || '.quality-loop/batch.json');

/** @param {string} component */
function fileDir(component) {
  const file = component.includes(':') ? component.split(':').slice(1).join(':') : component;
  const idx = file.lastIndexOf('/');
  return idx >= 0 ? file.slice(0, idx) : '';
}

/** @param {Array<Record<string, unknown>>} issues */
function pickCluster(issues) {
  if (issues.length === 0) return [];

  const priority = { SECURITY: 0, RELIABILITY: 1, MAINTAINABILITY: 2 };
  const sorted = [...issues].sort((a, b) => {
    const ia = priority[a.impacts?.[0]?.softwareQuality] ?? 3;
    const ib = priority[b.impacts?.[0]?.softwareQuality] ?? 3;
    if (ia !== ib) return ia - ib;
    return String(a.rule).localeCompare(String(b.rule));
  });

  const seed = sorted[0];
  const seedRule = seed.rule;
  const seedDir = fileDir(String(seed.component));

  const sameRule = sorted.filter((i) => i.rule === seedRule);
  const sameDir = sameRule.filter((i) => fileDir(String(i.component)) === seedDir);

  const pool = sameDir.length >= 2 ? sameDir : sameRule.length >= 2 ? sameRule : sorted;
  return pool.slice(0, batchSize);
}

/** @returns {Promise<Array<Record<string, unknown>>>} */
async function loadIssues() {
  if (args.from) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.from), 'utf8'));
    return raw.issues || raw;
  }

  // Open GitHub issues labeled sonar
  /** @type {Array<Record<string, unknown>>} */
  const ghIssues = [];
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
    for (const gh of data) {
      if (gh.pull_request) continue;
      ghIssues.push({
        githubNumber: gh.number,
        githubUrl: gh.html_url,
        sonarKey: extractSonarKey(gh.body || ''),
        title: gh.title,
        body: gh.body,
      });
    }
    if (data.length < 100) break;
    page++;
  }

  if (ghIssues.length === 0) {
    const data = await sonarFetch(
      '/api/issues/search',
      withIssueSeverityFilter(
        {
          componentKeys: sonarProjectKey(),
          statuses: 'OPEN,CONFIRMED,REOPENED',
          ps: 100,
          p: 1,
        },
        'BLOCKER,CRITICAL,MAJOR,HIGH',
      ),
    );
    return data.issues || [];
  }

  // Enrich GH issues with Sonar metadata when possible
  /** @type {Array<Record<string, unknown>>} */
  const enriched = [];
  for (const gh of ghIssues) {
    if (!gh.sonarKey) {
      enriched.push({ ...gh, source: 'github' });
      continue;
    }
    try {
      const data = await sonarFetch('/api/issues/search', { issues: gh.sonarKey });
      const issue = data.issues?.[0];
      enriched.push({
        ...gh,
        ...(issue || {}),
        githubNumber: gh.githubNumber,
        githubUrl: gh.githubUrl,
        source: 'github+sonar',
      });
    } catch {
      enriched.push({ ...gh, source: 'github' });
    }
  }
  return enriched;
}

const issues = await loadIssues();
const batch = pickCluster(issues);

const payload = {
  pickedAt: new Date().toISOString(),
  batchSize,
  count: batch.length,
  batch,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote batch of ${batch.length} issue(s) to ${outPath}`);
if (batch[0]) {
  console.log(`Primary rule: ${batch[0].rule || 'unknown'}`);
  console.log(`Primary impact: ${batch[0].impacts?.[0]?.softwareQuality || 'unknown'}`);
}
