#!/usr/bin/env node
/**
 * Fetch open SonarQube issues as JSON.
 *
 * Usage:
 *   SONAR_TOKEN=... node scripts/sonar/fetch-issues.mjs [--severity=HIGH,MAJOR] [--impact=SECURITY] [--max=100] [--out=issues.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, sonarFetch, sonarProjectKey, withIssueSeverityFilter } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const severityFilter = args.severity || 'BLOCKER,CRITICAL,MAJOR,HIGH';
const impacts = args.impact ? args.impact.split(',').map((s) => s.trim()) : null;
const maxIssues = Number(args.max || 500);
const pageSize = Math.min(500, maxIssues);

/** @type {Array<Record<string, unknown>>} */
const all = [];
let page = 1;

while (all.length < maxIssues) {
  const data = await sonarFetch(
    '/api/issues/search',
    withIssueSeverityFilter(
      {
        componentKeys: sonarProjectKey(),
        statuses: 'OPEN,CONFIRMED,REOPENED',
        ps: pageSize,
        p: page,
      },
      severityFilter,
    ),
  );

  const issues = data.issues || [];
  if (issues.length === 0) break;

  for (const issue of issues) {
    if (impacts) {
      const impact = issue.impacts?.[0]?.softwareQuality;
      if (!impact || !impacts.includes(impact)) continue;
    }
    all.push(issue);
    if (all.length >= maxIssues) break;
  }

  if (issues.length < pageSize) break;
  page++;
}

const payload = {
  fetchedAt: new Date().toISOString(),
  projectKey: sonarProjectKey(),
  count: all.length,
  issues: all,
};

if (args.out) {
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${all.length} issues to ${outPath}`);
} else {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
