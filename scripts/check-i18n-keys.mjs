#!/usr/bin/env node
/**
 * P-004 — locale JSON key parity across en/es/fr/pt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LANGS = ['en', 'es', 'fr', 'pt'];

/** Existing mismatches on main — ratchet: do not add entries. */
export const KNOWN_MISMATCHES = new Set([
  'missing key: es/quiz.json → shuffle',
  'missing key: fr/chat.json → artifact_streaming',
  'missing key: fr/quiz.json → shuffle',
  'missing key: pt/chat.json → artifact_streaming',
  'missing key: pt/quiz.json → shuffle',
  'missing key: pt/settings.json → tabs.dome_sync',
  'extra key: fr/chat.json → welcome_title',
  'extra key: fr/chat.json → welcome_subtitle',
  'extra key: pt/chat.json → welcome_title',
  'extra key: pt/chat.json → welcome_subtitle',
]);

export function flattenKeys(value, prefix = '', out = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenKeys(nested, next, out);
    }
    return out;
  }
  if (prefix) out.push(prefix);
  return out;
}

export function localeRoot(repoRoot) {
  return path.join(repoRoot, 'packages/i18n/locales');
}

export function listNamespaceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort((a, b) => a.localeCompare(b));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function diffLocaleParity(repoRoot) {
  const root = localeRoot(repoRoot);
  const missingFiles = [];
  const missingKeys = [];
  const extraKeys = [];

  const enDir = path.join(root, 'en');
  const enFiles = listNamespaceFiles(enDir);

  for (const lang of LANGS) {
    const langDir = path.join(root, lang);
    if (!fs.existsSync(langDir)) {
      missingFiles.push({ lang, file: `(missing locale dir ${lang})` });
      continue;
    }
    const langFiles = new Set(listNamespaceFiles(langDir));
    for (const file of enFiles) {
      if (!langFiles.has(file)) {
        missingFiles.push({ lang, file });
        continue;
      }
      if (lang === 'en') continue;
      const enKeys = new Set(flattenKeys(readJson(path.join(enDir, file))));
      const otherKeys = new Set(flattenKeys(readJson(path.join(langDir, file))));
      for (const key of enKeys) {
        if (!otherKeys.has(key)) missingKeys.push({ lang, file, key });
      }
      for (const key of otherKeys) {
        if (!enKeys.has(key)) extraKeys.push({ lang, file, key });
      }
    }
  }

  return { missingFiles, missingKeys, extraKeys };
}

export function formatParityReport(result) {
  const lines = [];
  for (const item of result.missingFiles) {
    lines.push(`missing file: ${item.lang}/${item.file}`);
  }
  for (const item of result.missingKeys) {
    lines.push(`missing key: ${item.lang}/${item.file} → ${item.key}`);
  }
  for (const item of result.extraKeys) {
    lines.push(`extra key: ${item.lang}/${item.file} → ${item.key}`);
  }
  return lines;
}

function isMain() {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return entry === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const repoRoot = path.join(__dirname, '..');
  const result = diffLocaleParity(repoRoot);
  const lines = formatParityReport(result).filter((line) => !KNOWN_MISMATCHES.has(line));
  if (lines.length > 0) {
    console.error(`[i18n-keys] ${lines.length} mismatch(es) across en/es/fr/pt`);
    for (const line of lines.slice(0, 80)) console.error(`  ${line}`);
    if (lines.length > 80) console.error(`  … ${lines.length - 80} more`);
    process.exit(1);
  }
  console.log('check:i18n-keys: OK (en/es/fr/pt key parity; known ratchet mismatches excluded)');
}
