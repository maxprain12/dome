#!/usr/bin/env node
/**
 * Fail if legacy prompts/martin/ reappears or consumers still reference it.
 * Run: node scripts/check-no-martin-prompts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const martinDir = path.join(root, 'prompts', 'martin');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.cursor']);
const SKIP_FILES = new Set(['CHANGELOG.md', 'check-no-martin-prompts.mjs', 'README.md']);
const LEGACY = /prompts\/martin|martin\/core|martin\/subagents/;

const errors = [];

if (fs.existsSync(martinDir)) {
  errors.push('prompts/martin/ must not exist — migrate to packages/prompts and packages/tools/src/domains');
}

function walk(dir, hits) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, hits);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs|md|json)$/.test(name)) continue;
    if (SKIP_FILES.has(name) || name.endsWith('.plan.md')) continue;
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (rel.includes('hermes-dome-harness-comparison.html')) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (LEGACY.test(text)) hits.push(rel);
  }
}

const hits = [];
walk(root, hits);
if (hits.length) {
  errors.push(`Found legacy martin references in:\n${hits.map((h) => `  - ${h}`).join('\n')}`);
}

if (errors.length) {
  console.error('[check-no-martin-prompts] FAILED\n');
  for (const msg of errors) console.error(msg);
  process.exit(1);
}

console.log('[check-no-martin-prompts] OK — no prompts/martin/ and no consumer references');
