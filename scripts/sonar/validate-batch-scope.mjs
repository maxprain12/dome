#!/usr/bin/env node
/**
 * Ensure quality-loop diff stays within batch file scope and size limits.
 *
 * Usage: node scripts/sonar/validate-batch-scope.mjs --batch=.quality-loop/batch.json
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchAllowedFiles, parseArgs } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');

const maxChangedFiles = Number(process.env.SONAR_LOOP_MAX_CHANGED_FILES || 15);
const maxTotalDiffLines = Number(process.env.SONAR_LOOP_MAX_TOTAL_DIFF_LINES || 800);

const FORBIDDEN_PREFIXES = ['.jenkins-', 'coverage/'];
const FORBIDDEN_EXACT = new Set(['pnpm-lock.yaml', 'package.json']);

/** Auto-allowed when IPC handlers change (verify-batch-pr may regenerate). */
const IPC_INVENTORY_DOC = 'docs/architecture/ipc-channels.md';

function gitLines(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

if (!fs.existsSync(batchPath)) {
  console.error(`Batch file not found: ${batchPath}`);
  process.exit(1);
}

const batchPayload = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const allowed = batchAllowedFiles(batchPayload);

const changedRaw = gitLines(['diff', '--name-only', 'HEAD']);
const changed = changedRaw ? changedRaw.split('\n').filter(Boolean) : [];

if (changed.length === 0) {
  console.log('validate-batch-scope: no diff — OK');
  process.exit(0);
}

let fail = 0;
let totalLines = 0;

for (const file of changed) {
  if (FORBIDDEN_EXACT.has(file)) {
    console.error(`ERROR: forbidden path changed: ${file}`);
    fail = 1;
    continue;
  }
  if (FORBIDDEN_PREFIXES.some((p) => file.startsWith(p))) {
    console.error(`ERROR: forbidden path changed: ${file}`);
    fail = 1;
    continue;
  }

  const ipcTouched = changed.some((f) => f.startsWith('electron/ipc/'));
  const allowedHere =
    allowed.has(file) || (ipcTouched && file === IPC_INVENTORY_DOC);

  if (!allowedHere) {
    console.error(`ERROR: ${file} not in batch allowed files`);
    fail = 1;
  }

  const numstat = gitLines(['diff', '--numstat', 'HEAD', '--', file]);
  if (numstat) {
    const [adds, dels] = numstat.split('\t');
    totalLines += Number(adds || 0) + Number(dels || 0);
  }
}

if (changed.length > maxChangedFiles) {
  console.error(`ERROR: ${changed.length} files changed (max ${maxChangedFiles})`);
  fail = 1;
}

if (totalLines > maxTotalDiffLines) {
  console.error(`ERROR: ${totalLines} total diff lines (max ${maxTotalDiffLines})`);
  fail = 1;
}

if (fail) {
  console.error('validate-batch-scope: FAILED');
  console.error(`Allowed files: ${[...allowed].join(', ')}`);
  process.exit(1);
}

console.log(
  `validate-batch-scope: OK (${changed.length} file(s), ${totalLines} diff lines)`,
);
process.exit(0);
