import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXPERIMENTS_ROOT, REPO_ROOT } from './constants.mjs';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, filePath);
}

export function sha256(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

export function resolveExperimentDir(id) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,80}$/.test(id || '')) {
    throw new Error(`Invalid experiment id: ${id}`);
  }
  return path.join(EXPERIMENTS_ROOT, id);
}

export function loadExperiment(id) {
  const dir = resolveExperimentDir(id);
  return {
    dir,
    manifest: readJson(path.join(dir, 'manifest.json')),
    state: readJson(path.join(dir, 'state.json')),
  };
}

export function updateState(dir, state, patch) {
  const next = { ...state, ...patch, updatedAt: new Date().toISOString() };
  writeJson(path.join(dir, 'state.json'), next);
  return next;
}

export function sanitizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'model';
}

export function listCaseDefinitions() {
  const root = path.join(REPO_ROOT, 'scripts/bench/cases');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) files.push(full);
    }
  };
  walk(root);
  return files.map((filePath) => ({ ...readJson(filePath), filePath }));
}
