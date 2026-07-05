#!/usr/bin/env node
/**
 * Run read-only OpenCode reviewer after fixes pass deterministic gates.
 *
 * Usage:
 *   MINIMAX_API_KEY=... pnpm run sonar:run-reviewer -- --batch=.quality-loop/batch.json
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpencodeReviewerPrompt } from './build-opencode-reviewer-prompt.mjs';
import { parseArgs } from './lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
const model = args.model || process.env.SONAR_LOOP_MODEL || 'MiniMax-M3';
const timeoutMs = Number(process.env.SONAR_REVIEW_TIMEOUT_MS || 300_000);
const opencodeConfig = path.resolve(
  process.env.OPENCODE_CONFIG || path.join(ROOT, 'scripts/sonar/opencode.ci.json'),
);

/** @param {string} text */
function extractVerdictJson(text) {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?"verdict"[\s\S]*?\})\s*```/);
  if (fenced) return fenced[1];

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1);
    if (slice.includes('"verdict"')) return slice;
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

const prompt = buildOpencodeReviewerPrompt(batchPath);
const startedAt = new Date().toISOString();

console.log('[SonarReview] engine: opencode');
console.log('[SonarReview] model: minimax/' + model);

const env = {
  ...process.env,
  OPENCODE_CONFIG: opencodeConfig,
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_CLIENT: 'dome-sonar-loop-reviewer',
};

const result = spawnSync(
  'opencode',
  [
    'run',
    '--auto',
    '--agent',
    'sonar-reviewer',
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
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
  },
);

const stdout = result.stdout || '';
const stderr = result.stderr || '';
const exitCode = result.status ?? 1;

const rawJson = extractVerdictJson(stdout);
/** @type {Record<string, unknown>} */
let verdict = { verdict: 'REJECT', notes: 'Reviewer did not emit valid JSON verdict' };

if (rawJson) {
  try {
    verdict = JSON.parse(rawJson);
  } catch {
    verdict = { verdict: 'REJECT', notes: 'Invalid JSON in reviewer output', raw: rawJson.slice(0, 500) };
  }
}

if (!verdict.verdict) {
  verdict.verdict = 'REJECT';
}

const outDir = path.join(ROOT, '.quality-loop');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'review-verdict.json'),
  `${JSON.stringify(
    {
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode,
      ...verdict,
    },
    null,
    2,
  )}\n`,
);

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

if (exitCode !== 0) {
  console.error('[SonarReview] OpenCode exited', exitCode);
  process.exit(1);
}

if (String(verdict.verdict).toUpperCase() !== 'APPROVE') {
  console.error('[SonarReview] REJECT:', verdict.notes || verdict);
  process.exit(1);
}

console.log('[SonarReview] APPROVE');
process.exit(0);
