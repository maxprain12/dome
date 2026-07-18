#!/usr/bin/env node
/**
 * Pick files with the most uncovered lines (Sonar) for a coverage-growth PR.
 *
 * Usage:
 *   node scripts/sonar/pick-coverage-batch.mjs [--size=2] [--out=.quality-loop/batch.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, sonarFetch, sonarProjectKey } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const size = Math.max(1, Number(args.size || process.env.SONAR_COVERAGE_BATCH_SIZE || 2));
const outPath = path.resolve(args.out || '.quality-loop/batch.json');

const PREFERRED_PREFIXES = ['app/lib/', 'electron/', 'packages/agent-core/src/', 'packages/ai/src/'];
const SKIP_RE =
  /(\.test\.|\.generated\.|node_modules\/|coverage\/|dist\/|vendor\/|globals\.css$|i18n\.ts$)/i;

/**
 * @param {string} file
 */
function rankPrefix(file) {
  const idx = PREFERRED_PREFIXES.findIndex((p) => file.startsWith(p));
  return idx === -1 ? 99 : idx;
}

async function fetchUncoveredFiles() {
  /** @type {Array<{ file: string; uncovered: number }>} */
  const rows = [];
  let page = 1;
  while (page <= 10) {
    const data = await sonarFetch('/api/measures/component_tree', {
      component: sonarProjectKey(),
      metricKeys: 'uncovered_lines',
      qualifiers: 'FIL',
      strategy: 'leaves',
      s: 'metric',
      metricSort: 'uncovered_lines',
      asc: 'false',
      ps: 100,
      p: page,
    });
    const comps = data.components || [];
    for (const c of comps) {
      const file = String(c.path || c.key || '');
      const rel = file.includes(':') ? file.split(':').slice(1).join(':') : file;
      const uncovered = Number(
        (c.measures || []).find((m) => m.metric === 'uncovered_lines')?.value || 0,
      );
      if (!rel || uncovered < 8 || SKIP_RE.test(rel)) continue;
      if (!PREFERRED_PREFIXES.some((p) => rel.startsWith(p))) continue;
      rows.push({ file: rel, uncovered });
    }
    const total = data.paging?.total ?? rows.length;
    if (comps.length < 100 || page * 100 >= total) break;
    page++;
  }
  return rows.sort((a, b) => {
    const pr = rankPrefix(a.file) - rankPrefix(b.file);
    if (pr !== 0) return pr;
    return b.uncovered - a.uncovered;
  });
}

async function main() {
  const ranked = await fetchUncoveredFiles();
  const picked = ranked.slice(0, size);
  if (picked.length === 0) {
    console.error('No uncovered preferred files found in Sonar measures');
    process.exit(1);
  }

  const batch = picked.map((p, i) => ({
    key: `coverage:${p.file}`,
    sonarKey: `coverage:${p.file}`,
    rule: 'dome:COVERAGE',
    severity: 'MAJOR',
    message: `Add focused unit tests for uncovered logic (~${p.uncovered} uncovered lines). Prefer pure helpers; mock IPC/Electron.`,
    component: `${sonarProjectKey()}:${p.file}`,
    line: 1,
    impacts: [{ softwareQuality: 'MAINTAINABILITY' }],
    uncoveredLines: p.uncovered,
    index: i,
  }));

  const payload = {
    kind: 'coverage',
    pickedAt: new Date().toISOString(),
    strategy: 'sonar-uncovered-lines',
    batch,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

  // Let triage-has-fixes.sh / Agent fix stage treat this as actionable.
  const triagePath = path.join(path.dirname(outPath), 'triage-applied.json');
  fs.writeFileSync(
    triagePath,
    `${JSON.stringify(
      {
        fixCount: batch.length,
        deferCount: 0,
        kind: 'coverage',
        note: 'Synthetic triage for coverage mode — all items are fix (write tests)',
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Coverage batch: ${batch.length} file(s) → ${outPath}`);
  for (const b of batch) {
    console.log(`  ${b.uncoveredLines} uncovered  ${b.component.split(':').slice(1).join(':')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
