#!/usr/bin/env node
/**
 * The cloud Manys UI is meant to run outside Electron too (a standalone web app over HTTP). This
 * walks the static value-import closure of its entry points and fails when it reaches the desktop:
 * `window.electron`, the desktop stores or the toast store. Type-only imports are erased by the
 * compiler and are not followed.
 *
 *   node scripts/check-cloud-ui-portable.mjs [entry ...]
 *
 * With no arguments it checks every entry point in ROOTS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'app');

/** Entry points of the portable UI. */
const ROOTS = [
  'app/components/manys/ManysView.tsx',
];

/** Modules that belong to the desktop shell. */
const FORBIDDEN_FILES = [
  /^app\/lib\/store\/useAppStore\.tsx?$/,
  /^app\/lib\/store\/useTabStore\.tsx?$/,
  /^app\/lib\/store\/useManyStore\.tsx?$/,
  /^app\/lib\/store\/useToastStore\.tsx?$/,
];

/** Text that only works inside Electron. */
const FORBIDDEN_TEXT = [
  // Feature detection (`window.electron?.x`, `window.electron !== undefined`) is how shared code
  // degrades outside Electron, so only an unguarded use counts.
  { label: 'window.electron', pattern: /\bwindow\.electron\b(?!\s*(?:\?\.|[!=]==\s*undefined))/ },
  { label: "import from 'electron'", pattern: /from\s+['"]electron['"]/ },
  { label: 'Node built-in', pattern: /from\s+['"](?:node:[a-z/_]+|fs|path|child_process)['"]/ },
];

/**
 * The default transport is the one place allowed to talk to Electron. It is only reached through
 * `transport.ts`'s default; a web app installs the HTTP transport before it renders anything, so the
 * IPC calls never run there. The walk does not go into it.
 */
const BOUNDARY = new Set(['app/lib/manys/ipcTransport.ts']);

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

const rel = (file) => path.relative(root, file).split(path.sep).join('/');

function resolveImport(from, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(app, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return /\.(?:tsx?|jsx?)$/.test(base) ? base : null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Specifiers of the imports that survive compilation. */
export function valueImports(source) {
  const code = stripComments(source);
  const specifiers = [];
  const statement = /\b(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(statement)) {
    const [, , typeOnly, clause, specifier] = match;
    if (typeOnly) continue;
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named) {
      const items = named[1].split(',').map((item) => item.trim()).filter(Boolean);
      if (items.length > 0 && items.every((item) => /^type\s/.test(item))) continue;
    }
    specifiers.push(specifier);
  }
  for (const match of code.matchAll(/(?:^|[^.\w])import\s+['"]([^'"]+)['"]/g)) specifiers.push(match[1]);
  for (const match of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(match[1]);
  return specifiers;
}

/** Offenders reachable from one entry: `{ file, reason, chain }`. */
export function check(entry) {
  const offenders = [];
  const seen = new Map([[entry, null]]);
  const queue = [entry];
  const chainOf = (file) => {
    const chain = [];
    for (let current = file; current; current = seen.get(current)) chain.unshift(rel(current));
    return chain;
  };
  while (queue.length > 0) {
    const file = queue.shift();
    const name = rel(file);
    if (FORBIDDEN_FILES.some((pattern) => pattern.test(name))) {
      offenders.push({ file: name, reason: 'desktop store', chain: chainOf(file) });
      continue;
    }
    if (BOUNDARY.has(name)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const code = stripComments(source);
    for (const { label, pattern } of FORBIDDEN_TEXT) {
      if (pattern.test(code)) offenders.push({ file: name, reason: label, chain: chainOf(file) });
    }
    for (const specifier of valueImports(source)) {
      const resolved = resolveImport(file, specifier);
      if (!resolved || seen.has(resolved)) continue;
      seen.set(resolved, file);
      queue.push(resolved);
    }
  }
  return { offenders, visited: seen.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = (process.argv.length > 2 ? process.argv.slice(2) : ROOTS).map((entry) => path.resolve(root, entry));
  let failed = false;
  for (const entry of entries) {
    const { offenders, visited } = check(entry);
    if (offenders.length === 0) {
      console.log(`[cloud-ui-portable] ${rel(entry)}: clean (${visited} modules)`);
      continue;
    }
    failed = true;
    console.error(`[cloud-ui-portable] ${rel(entry)} reaches the desktop:`);
    for (const offender of offenders) console.error(`  - ${offender.file} (${offender.reason})\n      ${offender.chain.join(' -> ')}`);
  }
  process.exit(failed ? 1 : 0);
}
