#!/usr/bin/env node
/**
 * P-002: nuevos módulos IPC con handlers deben importar/ usar zod.
 * La lista de herencia (sin Zod aún) está en scripts/ipc-zod-legacy.txt
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IPC_DIR = path.join(ROOT, 'electron', 'ipc');
const LEGACY_FILE = path.join(__dirname, 'ipc-zod-legacy.txt');

const hasHandle = (t) => /ipcMain\.handle/.test(t);
const hasZod = (t) => /\bzod\b|from\s+['"]zod['"]|require\(\s*['"]zod['"]\s*\)/.test(t);

function readLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return new Set();
  return new Set(
    fs
      .readFileSync(LEGACY_FILE, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter((l) => l && !l.startsWith('#')),
  );
}

function walkCjs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkCjs(full));
    } else if (entry.name.endsWith('.cjs') && entry.name !== 'index.cjs') {
      out.push(full);
    }
  }
  return out;
}

const legacy = readLegacy();
const files = walkCjs(IPC_DIR);
const bad = [];
for (const full of files) {
  const f = path.basename(full);
  const t = fs.readFileSync(full, 'utf8');
  if (!hasHandle(t)) continue;
  if (hasZod(t)) continue;
  if (legacy.has(f)) continue;
  bad.push(f);
}

if (bad.length) {
  console.error('[P-002] Módulos IPC con handlers sin Zod (añade validación o una línea en scripts/ipc-zod-legacy.txt si es herencia aceptada):');
  for (const b of bad) console.error('  -', b);
  process.exit(1);
}
console.log('check-ipc-zod: OK (legacy o Zod en todos los handlers nuevos)');
