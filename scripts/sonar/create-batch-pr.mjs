#!/usr/bin/env node
/**
 * Create a PR for a mechanical Sonar batch (used by Jenkins quality loop).
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sonar/create-batch-pr.mjs --batch=.quality-loop/batch.json
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubRepo, parseArgs } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

const closes = (batch.batch || [])
  .map((i) => i.githubNumber)
  .filter(Boolean)
  .map((n) => `Closes #${n}`);

const body = `## Sonar quality loop (Jenkins)

Automated mechanical fix from \`.quality-loop/batch.json\`.

${closes.length ? closes.join('\n') : '_No linked GitHub issue numbers in batch._'}

## Checks
- [x] typecheck
- [x] lint
- [x] test:coverage
`;

const branch = `fix/sonar-batch-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const bodyFile = path.join(root, '.quality-loop', 'pr-body.md');
fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
fs.writeFileSync(bodyFile, body);

execFileSync('gh', [
  'pr',
  'create',
  '--repo',
  githubRepo(),
  '--title',
  'fix(sonar): mechanical quality batch',
  '--body-file',
  bodyFile,
  '--head',
  branch,
], { cwd: root, stdio: 'inherit' });

console.log(`PR created for branch ${branch}`);
