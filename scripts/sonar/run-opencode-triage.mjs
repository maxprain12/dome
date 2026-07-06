#!/usr/bin/env node
/**
 * Run fast OpenCode triage agent (MiniMax-M2.7-highspeed) before the fixer.
 *
 * Usage:
 *   MINIMAX_API_KEY=... pnpm run sonar:run-triage -- --batch=.quality-loop/batch.json
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpencodeTriagePrompt } from './build-opencode-triage-prompt.mjs';
import { parseArgs } from './lib.mjs';
import { heuristicBatchTriage } from './triage-batch-heuristic.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
const model = args.model || process.env.SONAR_TRIAGE_MODEL || 'MiniMax-M2.7-highspeed';
const timeoutMs = Number(process.env.SONAR_TRIAGE_TIMEOUT_MS || 180_000);
const opencodeConfig = path.resolve(
  process.env.OPENCODE_CONFIG || path.join(ROOT, 'scripts/sonar/opencode.ci.json'),
);

/** @param {string} text */
function extractTriageJson(text) {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?"fix"[\s\S]*?\})\s*```/);
  if (fenced) return fenced[1];

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1);
    if (slice.includes('"fix"') && slice.includes('"defer"')) return slice;
  }
  return null;
}

function requireOpencode() {
  const which = spawnSync('command', ['-v', 'opencode'], { shell: true, encoding: 'utf8' });
  if (which.status !== 0) {
    console.error('ERROR: opencode CLI not found');
    process.exit(1);
  }
}

if (!fs.existsSync(batchPath)) {
  console.error(`Batch file not found: ${batchPath}`);
  process.exit(1);
}

if (!process.env.MINIMAX_API_KEY) {
  console.error('Missing MINIMAX_API_KEY');
  process.exit(1);
}

requireOpencode();

const batchPayload = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const prompt = buildOpencodeTriagePrompt(batchPath);
const startedAt = new Date().toISOString();
const outDir = path.join(ROOT, '.quality-loop');
fs.mkdirSync(outDir, { recursive: true });

console.log('[SonarTriage] engine: opencode');
console.log('[SonarTriage] model: minimax/' + model);

const env = {
  ...process.env,
  OPENCODE_CONFIG: opencodeConfig,
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_CLIENT: 'dome-sonar-loop-triage',
};

const result = spawnSync(
  'opencode',
  [
    'run',
    '--auto',
    '--agent',
    'sonar-triage',
    '--model',
    `minimax/${model}`,
    '--file',
    batchPath,
  ],
  {
    cwd: ROOT,
    env,
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: timeoutMs,
  },
);

const stdout = result.stdout || '';
const stderr = result.stderr || '';
const exitCode = result.status ?? 1;

/** @type {Record<string, unknown>} */
let verdict = heuristicBatchTriage(batchPayload);
let source = 'heuristic-fallback';

const rawJson = extractTriageJson(stdout);
if (rawJson && exitCode === 0) {
  try {
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed.fix) && Array.isArray(parsed.defer)) {
      verdict = parsed;
      source = 'opencode';
    }
  } catch {
    console.warn('[SonarTriage] Invalid JSON from agent — using heuristic fallback');
  }
} else {
  console.warn(
    '[SonarTriage] Agent failed or no JSON — using heuristic fallback:',
    result.error?.message || stderr.slice(0, 300) || `exit ${exitCode}`,
  );
}

const payload = {
  startedAt,
  finishedAt: new Date().toISOString(),
  exitCode,
  source,
  model,
  ...verdict,
};

fs.writeFileSync(path.join(outDir, 'triage-verdict.json'), `${JSON.stringify(payload, null, 2)}\n`);

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

console.log(
  `[SonarTriage] fix=${(verdict.fix || []).length} defer=${(verdict.defer || []).length} source=${source}`,
);
process.exit(0);
