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

const legacy = readLegacy();
const files = fs.readdirSync(IPC_DIR).filter((f) => f.endsWith('.cjs') && f !== 'index.cjs');
const bad = [];
for (const f of files) {
  const full = path.join(IPC_DIR, f);
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
