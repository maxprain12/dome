#!/usr/bin/env node
/**
 * Mechanical fix: remove unnecessary `void` operator in arrow callbacks.
 * Only touches files with S7735 (void operator) issues in the batch.
 *
 * Usage:
 *   node scripts/sonar/fix-void-operator.mjs --batch=.quality-loop/batch.json
 *   node scripts/sonar/fix-void-operator.mjs --files=app/components/agent-canvas/WorkflowLibraryCard.tsx
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentToRelativePath, isVoidOperatorRule, parseArgs } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));

/** void followed by an expression — not a TS return type `=> void` */
const VOID_EXPR = '(?=[a-zA-Z_$([])';

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
    if (!isVoidOperatorRule(issue.rule)) continue;
    const file = componentToRelativePath(issue.component);
    if (file) files.add(path.resolve(root, file));
  }
  return [...files];
}

/** @param {string} content */
function stripVoidOperator(content) {
  // () => void fn(...)  →  () => fn(...)
  // () => { void fn(...); }  →  () => { fn(...); }
  // Does NOT match `=> void` type annotations (no expression after void).
  return content
    .replace(new RegExp(`\\(\\)\\s*=>\\s*void\\s+${VOID_EXPR}`, 'g'), '() => ')
    .replace(new RegExp(`(\\([^)]*\\))\\s*=>\\s*void\\s+${VOID_EXPR}`, 'g'), '$1 => ')
    .replace(new RegExp(`\\{\\s*void\\s+${VOID_EXPR}`, 'g'), '{ ')
    .replace(new RegExp(`;\\s*void\\s+${VOID_EXPR}`, 'g'), '; ');
}

let changed = 0;
const files = targetFiles();
if (files.length === 0) {
  console.log('No S7735 files in batch — nothing to fix');
  process.exit(0);
}

for (const file of files) {
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
process.exit(0);
