#!/usr/bin/env node
/**
 * Compare two bench runs (e.g. MiniMax vs OpenRouter).
 * Usage: node scripts/bench/compare.mjs --a <runIdA> --b <runIdB>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(__dirname, '../../docs/bench/runs');

function parseArgs() {
  const args = process.argv.slice(2);
  let a = null;
  let b = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--a' && args[i + 1]) a = args[++i];
    if (args[i] === '--b' && args[i + 1]) b = args[++i];
  }
  return { a, b };
}

function loadSummary(runId) {
  const p = path.join(RUNS_DIR, runId, 'summary.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function loadManifest(runId) {
  const p = path.join(RUNS_DIR, runId, 'manifest.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function loadResults(runId) {
  const p = path.join(RUNS_DIR, runId, 'results.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function main() {
  const { a, b } = parseArgs();
  if (!a || !b) {
    console.error('Usage: node scripts/bench/compare.mjs --a <runA> --b <runB>');
    process.exit(1);
  }

  const sumA = loadSummary(a);
  const sumB = loadSummary(b);
  const manA = loadManifest(a);
  const manB = loadManifest(b);
  const resA = loadResults(a);
  const resB = loadResults(b);

  const mapA = new Map(resA.map((r) => [r.caseId.replace(/\.(direct|supervisor)$/, ''), r]));
  const mapB = new Map(resB.map((r) => [r.caseId.replace(/\.(direct|supervisor)$/, ''), r]));

  const lines = [
    '# Bench comparison',
    '',
    `| Metric | ${a} | ${b} |`,
    '|--------|------|------|',
    `| Prompt version | ${manA.promptVersion ?? 'n/a'} | ${manB.promptVersion ?? 'n/a'} |`,
    `| Pass rate | ${(sumA.pass_rate * 100).toFixed(1)}% | ${(sumB.pass_rate * 100).toFixed(1)}% |`,
    `| Avg score | ${sumA.avg_score ?? '-'} | ${sumB.avg_score ?? '-'} |`,
    `| Avg duration ms | ${sumA.avg_duration_ms ?? '-'} | ${sumB.avg_duration_ms ?? '-'} |`,
    '',
    '## Regressions (A pass → B fail)',
    '',
  ];

  for (const [id, ra] of mapA) {
    const rb = mapB.get(id);
    if (!rb) continue;
    if (ra.outcome === 'PASS' && rb.outcome !== 'PASS') {
      lines.push(`- ${id}: ${ra.outcome} → ${rb.outcome}`);
    }
  }

  lines.push('', '## Improvements (A fail → B pass)', '');
  for (const [id, ra] of mapA) {
    const rb = mapB.get(id);
    if (!rb) continue;
    if (ra.outcome !== 'PASS' && rb.outcome === 'PASS') {
      lines.push(`- ${id}: ${ra.outcome} → ${rb.outcome}`);
    }
  }

  const outPath = path.join(RUNS_DIR, `compare-${a}-vs-${b}.md`);
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  console.log('[bench:compare] Wrote', outPath);
}

main();
