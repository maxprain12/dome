#!/usr/bin/env node
/**
 * Run Sonar quality-loop agent via OpenCode CLI + MiniMax M3.
 *
 * Usage:
 *   MINIMAX_API_KEY=... pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json
 *   pnpm run sonar:run-agent -- --dry-run
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpencodePrompt } from './build-opencode-prompt.mjs';
import { parseArgs } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
const model = args.model || process.env.SONAR_LOOP_MODEL || 'MiniMax-M3';
const timeoutMs = Number(process.env.SONAR_LOOP_TIMEOUT_MS || 900_000);
const opencodeConfig = path.resolve(
  process.env.OPENCODE_CONFIG || path.join(ROOT, 'scripts/sonar/opencode.ci.json'),
);

function requireOpencode() {
  const which = spawnSync('command', ['-v', 'opencode'], { shell: true, encoding: 'utf8' });
  if (which.status !== 0) {
    console.error('ERROR: opencode CLI not found. Run scripts/jenkins/bootstrap-opencode.sh');
    process.exit(1);
  }
}

function writeAgentRun(payload) {
  const outDir = path.join(ROOT, '.quality-loop');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'agent-run.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

if (args['dry-run'] === 'true' || args['dry-run'] === true) {
  requireOpencode();
  console.log('[SonarLoop] engine: opencode');
  console.log('[SonarLoop] config:', opencodeConfig);
  console.log('[SonarLoop] model: minimax/' + model);
  console.log('[SonarLoop] batch:', batchPath);
  console.log('[SonarLoop] prompt preview:\n');
  console.log(buildOpencodePrompt(batchPath).slice(0, 800));
  process.exit(0);
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

const prompt = buildOpencodePrompt(batchPath);
const startedAt = new Date().toISOString();

console.log('[SonarLoop] engine: opencode');
console.log('[SonarLoop] model: minimax/' + model);
console.log('[SonarLoop] batch:', batchPath);
console.log('[SonarLoop] config:', opencodeConfig);

const env = {
  ...process.env,
  OPENCODE_CONFIG: opencodeConfig,
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_CLIENT: 'dome-sonar-loop',
};

// OpenCode `--file` is a greedy yargs array: a trailing positional prompt is treated
// as another attachment path ("File not found: Fix these…"). Deliver prompt on stdin.
const opencodeArgs = [
  'run',
  '--auto',
  '--agent',
  'sonar-fix',
  '--model',
  `minimax/${model}`,
  '--file',
  batchPath,
];

const result = spawnSync('opencode', opencodeArgs, {
  cwd: ROOT,
  env,
  input: prompt,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  timeout: timeoutMs,
});

const stdout = result.stdout || '';
const stderr = result.stderr || '';
const exitCode = result.status ?? 1;
const error = result.error?.message || (exitCode !== 0 ? stderr.slice(0, 2000) || `exit ${exitCode}` : null);

let batchPayload = {};
try {
  batchPayload = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
} catch {
  batchPayload = {};
}

writeAgentRun({
  engine: 'opencode',
  startedAt,
  finishedAt: new Date().toISOString(),
  provider: 'minimax',
  model,
  exitCode,
  error,
  stdout: stdout.slice(-8000),
  stderr: stderr.slice(-4000),
  batch: batchPayload,
});

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

if (error) {
  console.error('[SonarLoop] Failed:', error);
  process.exit(1);
}

console.log('[SonarLoop] Done.');
process.exit(0);
