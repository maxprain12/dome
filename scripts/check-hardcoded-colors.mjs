#!/usr/bin/env node
/**
 * Strict gate: zero hardcoded hex colors outside allowed palette files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

const ALLOWED_FILES = new Set([
  'app/globals.css',
  'app/styles/_variables.scss',
  'app/lib/vendor/pptx-preview.patched.es.js',
  // Content palettes (swatches persisted in DB, editor highlight hex, canvas
  // fallbacks) — the single sanctioned home for hex in app code.
  'app/lib/ui/palettes.ts',
  // Hex appears only inside agent-tool description strings (prompt copy).
  'app/lib/ai/tools/resource-actions.ts',
  // Email HTML is rendered inside a sandboxed iframe against a white canvas;
  // CSS variables do not cross the iframe boundary, so literal colors are required.
  'app/components/email/EmailBody.tsx',
  'app/lib/email/emailBodyParts.ts',
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
    } else if (/\.(tsx?|css|scss)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      // Skip unit tests — `#450` issue titles etc. are not palette colors.
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

if (total > 0) {
  console.error(`[design-system] Found ${total} hardcoded hex color(s) outside allowed files.`);
  console.error('Use a theme token or color-mix(), or add the file to ALLOWED_FILES with a documented reason.');
  for (const o of offenders.sort((a, b) => b.count - a.count)) {
    console.error(`  ${o.count}\t${o.file}`);
  }
  process.exit(1);
}

console.log('check:design-system: OK (0 hardcoded hex colors)');
