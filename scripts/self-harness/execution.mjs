import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DEFAULT_GATES, REPO_ROOT } from './constants.mjs';
import { ensureDir, git, readJson, sanitizeSlug, writeJson } from './io.mjs';
import { isEditablePath, validatePatch } from './policy.mjs';

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const cap = 2 * 1024 * 1024;
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-cap); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-cap); });
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs || 30 * 60 * 1000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ command, args, code, signal, stdout, stderr, durationMs: Date.now() - startedAt });
    });
  });
}

export const DEPENDENCY_INSTALL_ARGS = Object.freeze([
  'install',
  '--frozen-lockfile',
  '--prefer-offline',
  '--ignore-scripts',
]);

export function createWorktree({ baseSha, experimentId, label, patches = [] }) {
  const parent = ensureDir(path.join(os.tmpdir(), 'dome-self-harness-worktrees'));
  const worktree = fs.mkdtempSync(path.join(parent, `${sanitizeSlug(experimentId)}-${sanitizeSlug(label)}-`));
  git(['worktree', 'add', '--detach', worktree, baseSha]);
  try {
    for (const patch of patches) applyPatch(worktree, patch);
    return worktree;
  } catch (error) {
    git(['worktree', 'remove', '--force', worktree], { allowFailure: true });
    throw error;
  }
}

export function applyPatch(worktree, patch) {
  const policy = validatePatch(patch);
  if (!policy.valid) throw new Error(`Patch rejected: ${policy.reasons.join('; ')}`);
  const result = spawnSync('git', ['apply', '--whitespace=nowarn', '-'], {
    cwd: worktree,
    input: patch,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git apply failed: ${(result.stderr || result.stdout).trim()}`);
  const changed = git(['diff', '--name-only'], { cwd: worktree }).stdout.trim().split('\n').filter(Boolean);
  const forbidden = changed.filter((filePath) => !isEditablePath(filePath));
  if (forbidden.length) throw new Error(`Candidate modified trusted or out-of-scope files: ${forbidden.join(', ')}`);
  const symlinks = changed.filter((filePath) => fs.existsSync(path.join(worktree, filePath)) && fs.lstatSync(path.join(worktree, filePath)).isSymbolicLink());
  if (symlinks.length) throw new Error(`Candidate created or modified symlinks: ${symlinks.join(', ')}`);
  const numstat = git(['diff', '--numstat'], { cwd: worktree }).stdout.trim().split('\n').filter(Boolean);
  const weakenedTests = numstat.filter((line) => {
    const [added, deleted, filePath] = line.split('\t');
    return Number(deleted) > 0 && (filePath?.includes('/test/') || filePath?.includes('/__tests__/')) && Number(added) >= 0;
  });
  if (weakenedTests.length) throw new Error('Candidate may add tests but cannot delete or rewrite existing test lines');
}

export async function prepareDependencies(worktree, timeoutMs) {
  return runProcess('pnpm', DEPENDENCY_INSTALL_ARGS, {
    cwd: worktree,
    timeoutMs,
  });
}

export async function runStaticGates(worktree, { timeoutMs, gates = DEFAULT_GATES } = {}) {
  const results = [];
  const install = await prepareDependencies(worktree, timeoutMs);
  results.push({ name: 'install', ...install });
  if (install.code !== 0) return results;

  const buildPackages = await runProcess('pnpm', ['run', 'build:packages'], { cwd: worktree, timeoutMs });
  results.push({ name: 'build:packages', ...buildPackages });
  if (buildPackages.code !== 0) return results;

  for (const [command, args] of gates) {
    const result = await runProcess(command, args, { cwd: worktree, timeoutMs });
    results.push({ name: `${command} ${args.join(' ')}`, ...result });
    if (result.code !== 0) break;
  }
  return results;
}

export function gatesPassed(results) {
  return results.length > 0 && results.every((result) => result.code === 0);
}

export async function runBenchSplit({
  worktree,
  experimentDir,
  manifest,
  split,
  caseIds,
  repeat,
  timeoutMs,
}) {
  const runId = `${split}-repeat-${repeat}`;
  const candidateSlug = sanitizeSlug(manifest.currentCandidate || 'baseline');
  const groupDir = ensureDir(path.join(experimentDir, 'bench-runs', `round-${manifest.currentRound ?? 0}`, candidateSlug));
  const casesPath = path.join(groupDir, `${split}-cases.json`);
  writeJson(casesPath, caseIds);
  const publicManifestPath = path.join(groupDir, 'public-experiment-manifest.json');
  writeJson(publicManifestPath, {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    provider: manifest.provider,
    model: manifest.model,
    baseSha: manifest.baseSha,
    evaluatorVersion: manifest.evaluatorVersion,
    manifestHash: manifest.manifestHash,
  });
  const profile = `${sanitizeSlug(manifest.id)}-${sanitizeSlug(manifest.currentCandidate || 'baseline')}-${split}-${repeat}`;
  const userData = ensureDir(path.join(experimentDir, 'profiles', profile));
  const args = [
    path.join(worktree, 'scripts/bench/run.mjs'), '--',
    '--provider', manifest.provider,
    '--model', manifest.model,
    '--mode', 'direct',
    '--concurrency', String(manifest.concurrency || 1),
    '--timeout-ms', String(manifest.limits.benchTimeoutMs),
    '--no-judge',
    '--cases-file', casesPath,
    '--output-dir', groupDir,
    '--run-id', runId,
    '--experiment-manifest', publicManifestPath,
  ];
  const result = await runProcess(process.execPath, args, {
    cwd: worktree,
    timeoutMs,
    env: { DOME_PROFILE: profile, DOME_BENCH_USER_DATA: userData },
  });
  const resultsPath = path.join(groupDir, runId, 'results.json');
  if (!fs.existsSync(resultsPath)) {
    throw new Error(`Bench did not produce results for ${split} repeat ${repeat}: ${result.stderr || result.stdout}`);
  }
  return { process: result, records: readJson(resultsPath), resultsPath };
}

export async function evaluateWorktree({ worktree, experimentDir, manifest, repeats }) {
  const heldIn = [];
  const heldOut = [];
  const runs = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const inRun = await runBenchSplit({
      worktree, experimentDir, manifest, split: 'held-in', caseIds: manifest.splits.heldIn, repeat,
      timeoutMs: manifest.limits.candidateTimeoutMs,
    });
    heldIn.push(...inRun.records);
    runs.push(inRun.resultsPath);
    const outRun = await runBenchSplit({
      worktree, experimentDir, manifest, split: 'held-out', caseIds: manifest.splits.heldOut, repeat,
      timeoutMs: manifest.limits.candidateTimeoutMs,
    });
    heldOut.push(...outRun.records);
    runs.push(outRun.resultsPath);
  }
  return { heldIn, heldOut, runs };
}

export function removeWorktree(worktree) {
  git(['worktree', 'remove', '--force', worktree], { cwd: REPO_ROOT, allowFailure: true });
}
