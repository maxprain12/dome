#!/usr/bin/env node
/**
 * Pick a batch of related Sonar issues for a single fix PR.
 * Prefers same rule + same directory; prioritizes SECURITY/RELIABILITY.
 * Skips stale / already-fixed keys (see batch-eligibility.mjs).
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sonar/pick-batch.mjs [--size=10] [--out=.quality-loop/batch.json]
 *   node scripts/sonar/pick-batch.mjs --from=issues.json --size=10
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RECENT_FIX_DAYS,
  filterEligibleIssues,
} from './batch-eligibility.mjs';
import {
  extractSonarKey,
  githubFetch,
  githubRepo,
  parseArgs,
  sonarFetch,
  sonarProjectKey,
  withIssueSeverityFilter,
} from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchSize = Number(args.size || process.env.SONAR_BATCH_SIZE || 10);
const outPath = path.resolve(args.out || '.quality-loop/batch.json');
const recentFixDays = Number(args['recent-fix-days'] || process.env.SONAR_RECENT_FIX_DAYS || DEFAULT_RECENT_FIX_DAYS);

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

/**
 * Load sonar keys from GitHub issues (open and/or closed).
 * @param {'open' | 'closed' | 'all'} state
 * @returns {Promise<{ openKeys: Set<string>, closedKeys: Set<string>, openIssues: Array<Record<string, unknown>> }>}
 */
async function loadGithubSonarIssues(state) {
  /** @type {Set<string>} */
  const openKeys = new Set();
  /** @type {Set<string>} */
  const closedKeys = new Set();
  /** @type {Array<Record<string, unknown>>} */
  const openIssues = [];

  let page = 1;
  while (true) {
    const data = await githubFetch('GET', `/repos/${githubRepo()}/issues`, {
      state,
      labels: 'sonar',
      per_page: '100',
      page: String(page),
      sort: 'created',
      direction: 'asc',
    });
    if (!data || data.length === 0) break;
    for (const gh of data) {
      if (gh.pull_request) continue;
      const key = extractSonarKey(gh.body || '');
      if (gh.state === 'closed') {
        if (key) closedKeys.add(key);
        continue;
      }
      if (key) openKeys.add(key);
      openIssues.push({
        githubNumber: gh.number,
        githubUrl: gh.html_url,
        sonarKey: key,
        title: gh.title,
        body: gh.body,
      });
    }
    if (data.length < 100) break;
    page++;
  }

  return { openKeys, closedKeys, openIssues };
}

/**
 * Collect Sonar keys cited in recently merged PRs (body/title).
 * @param {number} [maxPages]
 */
async function loadMergedPrSonarKeys(maxPages = 5) {
  /** @type {Set<string>} */
  const keys = new Set();
  let page = 1;
  while (page <= maxPages) {
    const data = await githubFetch('GET', `/repos/${githubRepo()}/pulls`, {
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: '100',
      page: String(page),
    });
    if (!data || data.length === 0) break;
    for (const pr of data) {
      if (!pr.merged_at) continue;
      const text = `${pr.title || ''}\n${pr.body || ''}`;
      // UUID-like Sonar keys + **Key**: lines
      const fromBody = extractSonarKey(text);
      if (fromBody) keys.add(fromBody);
      for (const m of text.matchAll(
        /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi,
      )) {
        keys.add(m[1]);
      }
    }
    if (data.length < 100) break;
    page++;
  }
  return keys;
}

/** @returns {Promise<Array<Record<string, unknown>>>} */
async function loadIssues() {
  if (args.from) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.from), 'utf8'));
    return raw.issues || raw;
  }

  const { openIssues: ghIssues } = await loadGithubSonarIssues('open');

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

/** @returns {Promise<{ closedKeys: Set<string>, mergedPrKeys: Set<string> }>} */
async function loadSkipSets() {
  if (args.from && args['skip-live'] === 'true') {
    return { closedKeys: new Set(), mergedPrKeys: new Set() };
  }
  try {
    const [{ closedKeys }, mergedPrKeys] = await Promise.all([
      loadGithubSonarIssues('all'),
      loadMergedPrSonarKeys(),
    ]);
    return { closedKeys, mergedPrKeys };
  } catch (err) {
    console.warn(
      `[pick-batch] skip-set load failed (continuing without GH closed/PR filters): ${
        err instanceof Error ? err.message : err
      }`,
    );
    return { closedKeys: new Set(), mergedPrKeys: new Set() };
  }
}

const issues = await loadIssues();
const { closedKeys, mergedPrKeys } = await loadSkipSets();

const { kept, skipped } = filterEligibleIssues(issues, {
  repoRoot: root,
  closedSonarKeys: closedKeys,
  mergedPrSonarKeys: mergedPrKeys,
  recentFixDays,
});

if (skipped.length) {
  console.log(`Skipped ${skipped.length} ineligible issue(s):`);
  for (const s of skipped.slice(0, 30)) {
    console.log(`  - ${s.key}: ${s.reason}`);
  }
  if (skipped.length > 30) console.log(`  … +${skipped.length - 30} more`);
}

const batch = pickCluster(kept);

const payload = {
  pickedAt: new Date().toISOString(),
  batchSize,
  count: batch.length,
  skippedCount: skipped.length,
  skipped: skipped.slice(0, 50),
  batch,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote batch of ${batch.length} issue(s) to ${outPath}`);
if (batch.length === 0) {
  console.log('Empty batch — nothing actionable (already fixed / stale / deferred). Job should succeed.');
  process.exit(0);
}
if (batch[0]) {
  console.log(`Primary rule: ${batch[0].rule || 'unknown'}`);
  console.log(`Primary impact: ${batch[0].impacts?.[0]?.softwareQuality || 'unknown'}`);
}
