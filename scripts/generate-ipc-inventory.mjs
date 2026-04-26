#!/usr/bin/env node
/**
 * Genera docs/architecture/ipc-channels.md a partir de electron/ipc/*.cjs
 * Uso: node scripts/generate-ipc-inventory.mjs
 *      node scripts/generate-ipc-inventory.mjs --check  (CI: falla si no coincide)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IPC_DIR = path.join(ROOT, 'electron', 'ipc');
const OUT = path.join(ROOT, 'docs', 'architecture', 'ipc-channels.md');

const HANDLE_RE = /ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]/g;
const ON_RE = /ipcMain\.on\s*\(\s*['"]([^'"]+)['"]/g;

function parseFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const out = [];
  for (const re of [HANDLE_RE, ON_RE]) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(text)) !== null) {
      const ch = m[1];
      const upTo = text.slice(0, m.index);
      const line = upTo.split('\n').length;
      out.push({ channel: ch, file: rel, line });
    }
  }
  return out;
}

function buildMarkdown() {
  const files = fs
    .readdirSync(IPC_DIR)
    .filter((f) => f.endsWith('.cjs') && f !== 'index.cjs')
    .map((f) => path.join(IPC_DIR, f))
    .sort();

  const all = [];
  for (const f of files) {
    all.push(...parseFile(f));
  }
  all.sort((a, b) => a.channel.localeCompare(b.channel) || a.file.localeCompare(b.file) || a.line - b.line);

  const byChannel = new Map();
  for (const row of all) {
    if (!byChannel.has(row.channel)) byChannel.set(row.channel, []);
    byChannel.get(row.channel).push(row);
  }

  const gen = new Date().toISOString();
  let md = `# Canales IPC (autogenerado)

> **No edites a mano.** Regenera con \`npm run generate:ipc-inventory\`.
> Última generación: ${gen}

Canales detectados vía \`ipcMain.handle\` / \`ipcMain.on\` en \`electron/ipc/*.cjs\`.

| Canal | Archivo: línea |
| ----- | --------------- |
`;

  for (const [ch, rows] of [...byChannel.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const locs = rows.map((r) => `\`${r.file}:${r.line}\``).join(' · ');
    md += `| \`${ch}\` | ${locs} |\n`;
  }
  return { md, channelCount: byChannel.size };
}

function normalizeForCompare(s) {
  return s
    .replace(/> [ÚU]ltima generaci(ó|o)n: .*\r?\n/gi, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

const check = process.argv.includes('--check');
const { md, channelCount } = buildMarkdown();

if (check) {
  if (!fs.existsSync(OUT)) {
    console.error('Falta', OUT, '— ejecuta: npm run generate:ipc-inventory');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUT, 'utf8');
  if (normalizeForCompare(existing) !== normalizeForCompare(md)) {
    console.error('ipc-channels.md desincronizado. Ejecuta: npm run generate:ipc-inventory');
    process.exit(1);
  }
  console.log('ipc-channels.md OK,', channelCount, 'canales');
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md, 'utf8');
console.log('Wrote', OUT, `(${channelCount} channels)`);
