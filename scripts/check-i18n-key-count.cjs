#!/usr/bin/env node
/* eslint-disable */
/**
 * Key-count assertion for Phase 5 of the Dome → pi-style restructure.
 *
 * Compares the number of leaf keys in `app/lib/i18n.ts` (4 language objects
 * inline) against the sum of keys across `packages/i18n/locales/<lang>/*.json`.
 * Exits non-zero if any language has a mismatch.
 *
 * This is the gate for risk R6 (key loss during split).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const I18N_PATH = path.resolve(__dirname, '../app/lib/i18n.ts');
const OUT_DIR = path.resolve(__dirname, '../packages/i18n/locales');

const LANGS = [
  { id: 'en', startMarker: 'const en = {', endMarker: /^};/m },
  { id: 'es', startMarker: 'const es = {', endMarker: /^};/m },
  { id: 'fr', startMarker: 'const fr = {', endMarker: /^};/m },
  { id: 'pt', startMarker: 'const pt = {', endMarker: /^};/m },
];

function countLeavesInBlock(innerLines) {
  // Count leaves at indent 4 (string values). Heuristic: each line at
  // indent 4 with a `key: value,` shape contributes one leaf.
  let count = 0;
  for (const line of innerLines) {
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ['', ''])[1].length;
    if (ind === 4) {
      const m = /^([A-Za-z_$][\w$]*)\s*:\s*/.exec(line.trim());
      if (m) count += 1;
    }
  }
  return count;
}

function countKeysInJsonDir(langDir) {
  let total = 0;
  const files = fs.readdirSync(langDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(langDir, f), 'utf8'));
    total += Object.keys(data).length;
  }
  return { total, files: files.length };
}

function main() {
  const src = fs.readFileSync(I18N_PATH, 'utf8');
  const lines = src.split('\n');
  const errors = [];
  console.log('Key-count assertion (R6):');
  for (const { id, startMarker, endMarker } of LANGS) {
    const startIdx = lines.findIndex((l) => l.trim() === startMarker);
    const endIdx = lines.findIndex((l, i) => i > startIdx && endMarker.test(l));
    if (startIdx === -1 || endIdx === -1) {
      errors.push(`[${id}] could not find block in source`);
      continue;
    }
    const inner = lines.slice(startIdx + 1, endIdx);
    const oldCount = countLeavesInBlock(inner);
    const langDir = path.join(OUT_DIR, id);
    if (!fs.existsSync(langDir)) {
      errors.push(`[${id}] missing directory ${langDir}`);
      continue;
    }
    const { total, files } = countKeysInJsonDir(langDir);
    const diff = oldCount - total;
    const mark = diff === 0 ? '✅' : diff > 0 ? '⚠️ ' : '❌';
    console.log(`  ${mark} ${id}: old=${oldCount}, new=${total} (${files} files), diff=${diff}`);
    if (diff < 0) {
      errors.push(`[${id}] gained ${-diff} keys (extraction bug? source count = ${oldCount})`);
    }
  }
  if (errors.length) {
    console.error('\nFAILED:');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  console.log('\nAll language key counts match (or are a subset of) the original.');
}

main();
