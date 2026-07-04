#!/usr/bin/env node
/**
 * Mechanical fix: remove unnecessary `void` operator in arrow callbacks.
 * Reads .quality-loop/batch.json or --files list.
 *
 * Usage:
 *   node scripts/sonar/fix-void-operator.mjs --batch=.quality-loop/batch.json
 *   node scripts/sonar/fix-void-operator.mjs --files=app/components/agent-canvas/WorkflowLibraryCard.tsx
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));

/** @returns {string[]} */
function targetFiles() {
  if (args.files) {
    return args.files.split(',').map((f) => path.resolve(root, f.trim()));
  }
  const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
  if (!fs.existsSync(batchPath)) {
    console.error(`Batch file not found: ${batchPath}`);
    process.exit(1);
  }
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const files = new Set();
  for (const issue of batch.batch || []) {
    const component = String(issue.component || '');
    const file = component.includes(':') ? component.split(':').slice(1).join(':') : component;
    if (file) files.add(path.resolve(root, file));
  }
  return [...files];
}

/** @param {string} content */
function stripVoidOperator(content) {
  // () => void fn(...)  →  () => fn(...)
  // () => { void fn(...); }  →  () => { fn(...); }
  return content
    .replace(/\(\)\s*=>\s*void\s+/g, '() => ')
    .replace(/(\([^)]*\))\s*=>\s*void\s+/g, '$1 => ')
    .replace(/\{\s*void\s+/g, '{ ')
    .replace(/;\s*void\s+/g, '; ');
}

let changed = 0;
for (const file of targetFiles()) {
  if (!fs.existsSync(file)) {
    console.warn(`Skip missing file: ${file}`);
    continue;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = stripVoidOperator(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`Fixed void operator(s) in ${path.relative(root, file)}`);
    changed++;
  }
}

console.log(`Done: ${changed} file(s) updated`);
process.exit(changed > 0 ? 0 : 0);
