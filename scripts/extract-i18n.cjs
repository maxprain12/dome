#!/usr/bin/env node
/* eslint-disable */
/**
 * One-off extraction script for Phase 5 of the Dome → pi-style restructure.
 *
 * Reads the 4 language objects (en/es/fr/pt) inline in
 * `app/lib/i18n.ts` and emits `packages/i18n/locales/<lang>/<namespace>.json`
 * for each top-level key (which we treat as a namespace).
 *
 * The script is intentionally tiny and dependency-free — it does not parse
 * TypeScript; it uses line ranges verified from `grep` of the source.
 * The line ranges it relies on are:
 *   - `const en = {` … `};`  (en block)
 *   - `const es = {` … `};`  (es block)
 *   - `const fr = {` … `};`  (fr block)
 *   - `const pt = {` … `};`  (pt block)
 *
 * The script is idempotent: re-running produces identical output.
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

function findBlock(srcLines, startMarker, endMarker) {
  const startIdx = srcLines.findIndex((l) => l.trim() === startMarker);
  if (startIdx === -1) throw new Error(`start marker not found: ${startMarker}`);
  const endIdx = srcLines.findIndex((l, i) => i > startIdx && endMarker.test(l));
  if (endIdx === -1) throw new Error(`end marker not found for ${startMarker}`);
  return srcLines.slice(startIdx + 1, endIdx); // inner lines, between { and };
}

function indentOf(line) {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].length : 0;
}

/**
 * Convert the inner lines of a `const lang = { ... };` block into a flat
 * map of namespace → nested object. We use a tiny indentation-based parser
 * (no eval, no TypeScript parser). Two levels deep are enough because the
 * top-level keys are namespaces and the leaves are string values.
 */
function parseLangBlock(innerLines) {
  // Strip the leading 'const lang = {' header (already excluded) and the
  // trailing '};' (already excluded). We expect keys at indent 2, with
  // sub-keys at indent 4, and string values at indent 4+ on the same line.
  const out = {};
  let ns = null; // current namespace key
  for (let i = 0; i < innerLines.length; i += 1) {
    const line = innerLines[i];
    if (!line.trim()) continue;
    const ind = indentOf(line);
    const trimmed = line.trim();

    if (ind === 2 && trimmed.endsWith(': {')) {
      // start a namespace
      const m = /^([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(trimmed);
      if (!m) continue;
      ns = m[1];
      out[ns] = out[ns] || {};
      continue;
    }
    if (ind === 2 && trimmed === '},') {
      // end a namespace
      ns = null;
      continue;
    }
    if (ind === 4 && ns) {
      // leaf or nested key
      const m = /^([A-Za-z_$][\w$]*)\s*:\s*(.*?),?\s*$/.exec(trimmed);
      if (!m) continue;
      const key = m[1];
      const rawVal = m[2];
      // Strip trailing comma for eval, then JSON.parse on simple values.
      // Values in this file are either:
      //   - string literals: 'text' or "text"
      //   - template literals: `text ${var}` or `text`
      //   - numeric: 0 / 1
      //   - booleans: true / false
      //   - nested object: { foo: 'bar' }  (rare at this depth)
      // We try JSON.parse first, then fall back to manual.
      let val;
      try {
        val = JSON.parse(rawVal);
      } catch {
        // manual conversion
        if (rawVal === 'true') val = true;
        else if (rawVal === 'false') val = false;
        else if (/^-?\d+(\.\d+)?$/.test(rawVal)) val = Number(rawVal);
        else if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
          val = rawVal.slice(1, -1).replace(/\\'/g, "'");
        } else if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
          val = rawVal.slice(1, -1).replace(/\\"/g, '"');
        } else if (rawVal.startsWith('`') && rawVal.endsWith('`')) {
          val = rawVal.slice(1, -1);
        } else {
          // unknown — keep raw
          val = rawVal;
        }
      }
      out[ns][key] = val;
    }
  }
  return out;
}

function emitJson(dir, lang, nsMap) {
  const langDir = path.join(dir, lang);
  fs.mkdirSync(langDir, { recursive: true });
  let totalKeys = 0;
  const namespaces = Object.keys(nsMap).sort();
  for (const ns of namespaces) {
    const file = path.join(langDir, `${ns}.json`);
    const obj = nsMap[ns];
    // Sort keys deterministically for stable diffs.
    const sorted = Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
    fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    totalKeys += Object.keys(obj).length;
  }
  return { namespaces: namespaces.length, keys: totalKeys };
}

function main() {
  const src = fs.readFileSync(I18N_PATH, 'utf8');
  const lines = src.split('\n');
  const stats = {};
  for (const { id, startMarker, endMarker } of LANGS) {
    const block = findBlock(lines, startMarker, endMarker);
    const nsMap = parseLangBlock(block);
    stats[id] = emitJson(OUT_DIR, id, nsMap);
  }
  console.log('Extraction complete:');
  for (const lang of Object.keys(stats)) {
    console.log(`  ${lang}: ${stats[lang].namespaces} namespaces, ${stats[lang].keys} keys`);
  }
}

main();
