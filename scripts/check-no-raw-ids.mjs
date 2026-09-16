#!/usr/bin/env node
/**
 * Heuristic: shadcn SelectValue must receive readable children (no raw id as trigger).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EMPTY_SELECT_VALUE = /<SelectValue\s*(?:\/>|>\s*<\/SelectValue>)/;

export function defaultAllowlist() {
  return new Set([
    'app/components/shared/DateTimePicker.tsx',
    'app/components/settings/sections/McpSection.tsx',
    'app/components/settings/sections/KbLlmSection.tsx',
    'app/components/settings/ai/AIWebSearchTab.tsx',
    'app/components/settings/TranscriptionSettingsSections.tsx',
    'app/components/learn/DeckEditor.tsx',
  ]);
}

export function looksLikeOpaqueId(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z]{1,12}-[0-9a-f]{6,}$/i.test(trimmed)) return true;
  if (/^soc-[a-z]+-[0-9a-f]{6,}$/i.test(trimmed)) return true;
  return false;
}

export function scanSelectValue(text) {
  const hits = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (EMPTY_SELECT_VALUE.test(line)) {
      hits.push({ line: index + 1, kind: 'empty-select-value', snippet: line.trim() });
    }
  });
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

export function findRawIdSelects(repoRoot, allowlist = defaultAllowlist()) {
  const files = walk(path.join(repoRoot, 'app/components'));
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    if (allowlist.has(rel)) continue;
    const hits = scanSelectValue(fs.readFileSync(file, 'utf8'));
    for (const hit of hits) offenders.push({ file: rel, ...hit });
  }
  return offenders;
}

function isMain() {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return entry === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const repoRoot = path.join(__dirname, '..');
  const offenders = findRawIdSelects(repoRoot);
  if (offenders.length > 0) {
    console.error(`[no-raw-ids] ${offenders.length} empty <SelectValue /> (trigger will show the raw id)`);
    for (const item of offenders) {
      console.error(`  ${item.file}:${item.line}  ${item.snippet}`);
    }
    process.exit(1);
  }
  console.log('check:no-raw-ids: OK');
}
