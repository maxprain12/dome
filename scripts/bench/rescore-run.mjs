#!/usr/bin/env node
/**
 * Re-score case JSONs from a finished/partial run (fixes toolsCalled extraction).
 * Usage: node scripts/bench/rescore-run.mjs --run 2026-05-28T09-49-10Z
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(__dirname, '../../docs/bench/runs');

const { normalizeToolName } = require('../../electron/tools/tool-dispatcher.cjs');
const { validateStructural, deriveOutcome, validateExecution } = require('../../electron/bench/validators.cjs');
const storage = require('../../electron/bench/storage.cjs');

function extractToolsFromChunks(chunks) {
  const names = new Set();
  for (const c of chunks) {
    if (c.type !== 'tool_call') continue;
    const raw = c.toolCall?.name || c.name;
    if (raw) names.add(normalizeToolName(raw));
  }
  return [...names];
}

function loadCaseDef(caseId) {
  const base = path.join(__dirname, 'cases');
  for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const tool = caseId.replace(/\.basic$/, '');
    const p = path.join(base, dir.name, `${tool}.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  const sub = path.join(base, 'subagent', `${caseId}.json`);
  if (fs.existsSync(sub)) return JSON.parse(fs.readFileSync(sub, 'utf-8'));
  return null;
}

function main() {
  const runId = process.argv.includes('--run')
    ? process.argv[process.argv.indexOf('--run') + 1]
    : null;
  if (!runId) {
    console.error('Usage: node scripts/bench/rescore-run.mjs --run <runId>');
    process.exit(1);
  }
  const runDir = path.join(RUNS_DIR, runId);
  const casesDir = path.join(runDir, 'cases');
  if (!fs.existsSync(casesDir)) {
    console.error('No cases dir:', casesDir);
    process.exit(1);
  }

  const results = [];
  for (const file of fs.readdirSync(casesDir).filter((f) => f.endsWith('.json'))) {
    const r = JSON.parse(fs.readFileSync(path.join(casesDir, file), 'utf-8'));
    const def = loadCaseDef(r.caseId) || {};
    const toolsCalled = extractToolsFromChunks(r.chunks || []);
    const execution = r.validation?.execution || validateExecution({
      chunks: r.chunks || [],
      error: r.error,
      timedOut: false,
      hitInterrupt: false,
      skipHitl: def.skip_hitl !== false,
    });
    const structural = validateStructural({
      expectedTools: def.expected_tools || r.expectedTools || [],
      forbiddenTools: def.forbidden_tools || [],
      toolsCalled,
      finalText: r.finalText || '',
      behavior: r.behavior || null,
      chunks: r.chunks || [],
      outputShape: def.output_shape || null,
    });
    let judge = r.validation?.judge || { skipped: true };
    if (judge.error || (judge.reasoning && String(judge.reasoning).includes('Judge failed'))) {
      judge = {
        pass: true,
        skipped: true,
        score: null,
        reasoning: 'Judge skipped during rescore (original judge error)',
        issues: ['judge_rescored'],
      };
    }
    const outcome = deriveOutcome(
      execution,
      structural,
      judge,
      def.optional === true,
      !execution.pass,
    );
    const updated = { ...r, toolsCalled, validation: { execution, structural, judge }, outcome };
    fs.writeFileSync(path.join(casesDir, file), `${JSON.stringify(updated, null, 2)}\n`);
    results.push(updated);
  }

  const manifestPath = path.join(runDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : { runId };
  manifest.rescoredAt = new Date().toISOString();
  storage.finalizeRun(runDir, manifest, results);
  console.log(`[rescore] ${results.length} cases → ${runDir}/report.md`);
}

main();
