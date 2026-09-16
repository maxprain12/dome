#!/usr/bin/env node
/**
 * Dense UI timestamps should use formatShortDistance, not formatDistanceToNow as visible label.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function defaultAllowlist() {
  return new Set([
    'app/lib/utils/formatting.ts',
    'app/components/search/CommandPaletteResourcePreview.tsx',
    'app/components/search/CommandPalette.tsx',
    'app/components/people/PersonTimeline.tsx',
    'app/components/notes/NoteSavePill.tsx',
    'app/components/notes/MarkdownNoteWorkspace.tsx',
    'app/components/home/DashboardView.tsx',
  ]);
}

export function scanDistanceToNow(text) {
  const hits = [];
  text.split('\n').forEach((line, index) => {
    if (line.includes('formatDistanceToNow')) {
      hits.push({ line: index + 1, snippet: line.trim() });
    }
  });
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

export function findUncontainedTimestamps(repoRoot, allowlist = defaultAllowlist()) {
  const files = [
    ...walk(path.join(repoRoot, 'app/components')),
    ...walk(path.join(repoRoot, 'app/lib')),
  ];
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    if (allowlist.has(rel)) continue;
    const hits = scanDistanceToNow(fs.readFileSync(file, 'utf8'));
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
  const offenders = findUncontainedTimestamps(repoRoot);
  if (offenders.length > 0) {
    console.error(`[text-containment] ${offenders.length} formatDistanceToNow outside allowlist`);
    console.error('Use formatShortDistance / formatRelativePair for visible card meta.');
    for (const item of offenders) {
      console.error(`  ${item.file}:${item.line}  ${item.snippet}`);
    }
    process.exit(1);
  }
  console.log('check:text-containment: OK');
}
