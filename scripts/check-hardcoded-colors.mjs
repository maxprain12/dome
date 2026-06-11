#!/usr/bin/env node
/**
 * Ratchet check: hardcoded hex colors outside allowed palette files.
 * Fails if count exceeds scripts/baselines/hardcoded-colors.txt baseline.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(__dirname, 'baselines', 'hardcoded-colors.txt');

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

const ALLOWED_FILES = new Set([
  'app/globals.css',
  'app/styles/_variables.scss',
  'app/lib/vendor/pptx-preview.patched.es.js',
]);

const SCAN_DIRS = ['app/components', 'app/pages', 'app/workspace', 'app/lib'];
const SCAN_CSS = ['app/styles'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue;
      walk(full, out);
    } else if (/\.(tsx?|css|scss)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function countHexInFile(fullPath) {
  const rel = path.relative(ROOT, fullPath).split(path.sep).join('/');
  if (ALLOWED_FILES.has(rel)) return 0;

  const text = fs.readFileSync(fullPath, 'utf8');
  const isCssVarDefinition = rel.endsWith('.css') || rel.endsWith('.scss');

  let count = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (isCssVarDefinition && /--[\w-]+\s*:/.test(trimmed)) continue;
    const matches = line.match(HEX_RE);
    if (matches) count += matches.length;
  }
  return count;
}

function collectFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), files);
  }
  for (const dir of SCAN_CSS) {
    walk(path.join(ROOT, dir), files);
  }
  return files;
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  const n = Number.parseInt(fs.readFileSync(BASELINE_FILE, 'utf8').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

const files = collectFiles();
let total = 0;
const offenders = [];

for (const file of files) {
  const n = countHexInFile(file);
  if (n > 0) {
    total += n;
    offenders.push({ file: path.relative(ROOT, file), count: n });
  }
}

const baseline = readBaseline();

if (baseline == null) {
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, String(total));
  console.log(`check:design-system: baseline created with ${total} hardcoded hex colors`);
  process.exit(0);
}

if (total > baseline) {
  console.error(`[design-system] Hardcoded hex count ${total} exceeds baseline ${baseline}`);
  for (const o of offenders.sort((a, b) => b.count - a.count).slice(0, 15)) {
    console.error(`  ${o.count}\t${o.file}`);
  }
  process.exit(1);
}

console.log(`check:design-system: OK (${total}/${baseline} hardcoded hex colors)`);
