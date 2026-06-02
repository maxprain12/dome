#!/usr/bin/env node
/**
 * Regenerate report.md from an existing run directory.
 * Usage: node scripts/bench/report.mjs --run 2026-05-28T11-30-00Z
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const RUNS_DIR = path.join(ROOT, 'docs/bench/runs');
const storage = require('../../electron/bench/storage.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  let runId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run' && args[i + 1]) runId = args[++i];
  }
  return { runId };
}

function main() {
  const { runId } = parseArgs();
  if (!runId) {
    const runs = fs.existsSync(RUNS_DIR)
      ? fs.readdirSync(RUNS_DIR).filter((d) => fs.statSync(path.join(RUNS_DIR, d)).isDirectory()).sort()
      : [];
    console.error('Usage: node scripts/bench/report.mjs --run <runId>');
    if (runs.length) console.error('Available:', runs.slice(-5).join(', '));
    process.exit(1);
  }

  const runDir = path.join(RUNS_DIR, runId);
  const resultsPath = path.join(runDir, 'results.json');
  const manifestPath = path.join(runDir, 'manifest.json');
  if (!fs.existsSync(resultsPath)) {
    console.error(`Missing ${resultsPath}`);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : { runId };

  storage.finalizeRun(runDir, manifest, results);
  console.log('[bench:report] Regenerated', runDir);
}

main();
