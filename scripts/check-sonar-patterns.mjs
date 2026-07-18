#!/usr/bin/env node
/**
 * Guard against Sonar anti-patterns (P-011).
 *
 * Usage:
 *   node scripts/check-sonar-patterns.mjs              # strict rules, full tree
 *   node scripts/check-sonar-patterns.mjs --diff=origin/main   # + progressive on changed files
 *   node scripts/check-sonar-patterns.mjs --json        # machine-readable
 *
 * Docs: docs/automation/sonar-clean-code.md
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @typedef {{ id: string; rule: string; tier: 'strict' | 'progressive'; message: string; test: (line: string, ctx: LineCtx) => boolean; allowPath?: (rel: string) => boolean }} PatternRule */
/** @typedef {{ rel: string; lineNo: number; line: string; inTemplate: boolean }} LineCtx */

const NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
];

const REQUIRE_BUILTIN_RE = new RegExp(
  `require\\s*\\(\\s*['"](${NODE_BUILTINS.map((b) => b.replace('/', '\\/')).join('|')})['"]\\s*\\)`,
);

/** Paths where postMessage('*') is intentional (iframe srcdoc ↔ parent). */
function allowPostMessageStar(rel) {
  return (
    rel.includes('artifact') ||
    rel.endsWith('artifactIframeNavigate.ts') ||
    rel.endsWith('HtmlArtifactFrame.tsx') ||
    rel.endsWith('artifactStorageShim.ts')
  );
}

/** @type {PatternRule[]} */
export const STRICT_RULES = [
  {
    id: 'string-nullish',
    rule: 'S6638',
    tier: 'strict',
    message: 'String(...) is never nullish — do not use ?? on it',
    test: (line) => /String\s*\([^)]*\)\s*\?\?/.test(line),
  },
  {
    id: 'number-nullish',
    rule: 'S6638',
    tier: 'strict',
    message: 'Number(...) is never nullish — use || / Number.isFinite instead of ??',
    test: (line) => /Number\s*\([^)]*\)\s*\?\?/.test(line),
  },
  {
    id: 'sort-no-compare',
    rule: 'S2871',
    tier: 'strict',
    message: 'Provide a compare function to .sort() (e.g. localeCompare)',
    test: (line) => /\.sort\s*\(\s*\)/.test(line),
  },
  {
    id: 'replace-dollar-without-group',
    rule: 'S6328',
    tier: 'strict',
    message: 'Do not use $1 in replace when the regex has no capturing group',
    test: (line) => {
      if (!/\.replace\s*\(/.test(line) || !/'\$1'|"\$1"|`\$1`/.test(line)) return false;
      // Heuristic: /.../ with $1 but no (...) group in the same literal
      const m = line.match(/\.replace\s*\(\s*\/((?:\\.|[^/])*)\/[gimsuy]*\s*,\s*['"`]\$1['"`]/);
      if (!m) return false;
      const body = m[1];
      // Has an unescaped capturing group?
      if (/(^|[^\\])\((?!\?)/.test(body)) return false;
      return true;
    },
  },
];

/** @type {PatternRule[]} */
export const PROGRESSIVE_RULES = [
  {
    id: 'postMessage-star',
    rule: 'S2819',
    tier: 'progressive',
    message: "Specify postMessage target origin (avoid '*')",
    allowPath: allowPostMessageStar,
    test: (line, ctx) => {
      if (ctx.inTemplate) return false;
      return /\.postMessage\s*\([\s\S]*?,\s*['"]\*['"]\s*\)/.test(line) ||
        /postMessage\s*\([^)]*,\s*['"]\*['"]\s*\)/.test(line);
    },
  },
  {
    id: 'void-arrow',
    rule: 'S7735',
    tier: 'progressive',
    message: 'Avoid unnecessary void in arrow callbacks (see no-void-operator.mdc)',
    test: (line) => /=>\s*void\s+/.test(line),
    allowPath: (rel) => rel.startsWith('electron/') || rel.startsWith('scripts/'),
  },
  {
    id: 'node-builtin-require',
    rule: 'S7772',
    tier: 'progressive',
    message: "Prefer require('node:…') for Node builtins",
    test: (line) => REQUIRE_BUILTIN_RE.test(line),
    allowPath: (rel) =>
      !rel.startsWith('electron/') &&
      !rel.startsWith('shared/') &&
      !rel.startsWith('packages/'),
  },
  {
    id: 'identical-ternary',
    rule: 'S3923',
    tier: 'progressive',
    message: 'Identical ternary branches — simplify',
    test: (line) =>
      /\?\s*([a-zA-Z_$][\w.$]*|true|false|null|\d+(?:\.\d+)?)\s*:\s*\1\b/.test(line),
  },
  {
    id: 'jsx-numeric-and',
    rule: 'S6439',
    tier: 'progressive',
    message: 'Coerce numeric JSX guards (use !!n or n > 0) to avoid leaked 0',
    test: (line) => /\{(?!!!)[a-zA-Z_$][\w.]*\.(?:total_pages|length|count|size|index)\s*&&/.test(line),
  },
];

export const ALL_RULES = [...STRICT_RULES, ...PROGRESSIVE_RULES];

const SCAN_ROOTS = ['app', 'electron', 'packages', 'shared'];
const FILE_RE = /\.(?:tsx?|jsx?|mjs|cjs|css)$/;

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'vendor' ||
      entry.name === 'coverage' ||
      entry.name === '.git'
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (FILE_RE.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** @returns {string[]} absolute paths */
export function collectScanFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    walk(path.join(ROOT, root), files);
  }
  return files.filter((f) => {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    return !rel.includes('/vendor/') && !rel.includes('/__tests__/') && !rel.includes('/test/');
  });
}

/**
 * @param {string} baseRef
 * @returns {string[]} absolute paths of changed files that exist
 */
export function collectDiffFiles(baseRef) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const rels = out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return rels
    .filter((rel) => FILE_RE.test(rel) && !/\.test\.[jt]sx?$/.test(rel))
    .map((rel) => path.join(ROOT, rel))
    .filter((abs) => fs.existsSync(abs));
}

/**
 * Strip line comments and track crude template-literal state per line (not nested-perfect).
 * @param {string} source
 * @returns {Array<{ lineNo: number; line: string; inTemplate: boolean }>}
 */
export function annotateLines(source) {
  /** @type {Array<{ lineNo: number; line: string; inTemplate: boolean }>} */
  const rows = [];
  let inTemplate = false;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    // skip full-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      rows.push({ lineNo: i + 1, line, inTemplate });
      continue;
    }
    // crude template toggle on odd number of unescaped backticks
    const ticks = line.match(/(?<!\\)`/g);
    if (ticks && ticks.length % 2 === 1) inTemplate = !inTemplate;
    rows.push({ lineNo: i + 1, line, inTemplate: inTemplate || (ticks ? ticks.length > 0 : false) });
  }
  return rows;
}

/**
 * @param {string} absPath
 * @param {PatternRule[]} rules
 * @returns {Array<{ rel: string; line: number; id: string; rule: string; message: string; snippet: string }>}
 */
export function scanFile(absPath, rules) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
  const source = fs.readFileSync(absPath, 'utf8');
  const rows = annotateLines(source);
  /** @type {Array<{ rel: string; line: number; id: string; rule: string; message: string; snippet: string }>} */
  const hits = [];

  for (const row of rows) {
    const ctx = { rel, lineNo: row.lineNo, line: row.line, inTemplate: row.inTemplate };
    for (const rule of rules) {
      if (rule.allowPath?.(rel)) continue;
      if (!rule.test(row.line, ctx)) continue;
      hits.push({
        rel,
        line: row.lineNo,
        id: rule.id,
        rule: rule.rule,
        message: rule.message,
        snippet: row.line.trim().slice(0, 160),
      });
    }
  }
  return hits;
}

/**
 * @param {{ files: string[]; rules: PatternRule[] }} opts
 */
export function runScan({ files, rules }) {
  /** @type {ReturnType<typeof scanFile>} */
  const violations = [];
  for (const file of files) {
    violations.push(...scanFile(file, rules));
  }
  return violations;
}

function parseArgs(argv) {
  /** @type {{ diff: string | null; json: boolean }} */
  const out = { diff: null, json: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a.startsWith('--diff=')) out.diff = a.slice('--diff='.length);
    else if (a === '--diff') out.diff = 'origin/main';
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strictFiles = collectScanFiles();
  const strictHits = runScan({ files: strictFiles, rules: STRICT_RULES });

  /** @type {ReturnType<typeof scanFile>} */
  let progressiveHits = [];
  if (args.diff) {
    let diffFiles = [];
    try {
      diffFiles = collectDiffFiles(args.diff);
    } catch (err) {
      console.warn(`[check-sonar-patterns] git diff failed (${err.message}) — skipping progressive tier`);
    }
    progressiveHits = runScan({ files: diffFiles, rules: PROGRESSIVE_RULES });
  }

  const all = [...strictHits, ...progressiveHits];

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ strict: strictHits.length, progressive: progressiveHits.length, violations: all }, null, 2)}\n`,
    );
  } else {
    if (all.length === 0) {
      console.log(
        `check-sonar-patterns: OK (strict on ${strictFiles.length} files` +
          (args.diff ? `; progressive on diff vs ${args.diff}` : '') +
          ')',
      );
    } else {
      console.error('check-sonar-patterns: FAILED — Sonar anti-patterns (P-011)\n');
      console.error('Docs: docs/automation/sonar-clean-code.md\n');
      for (const v of all) {
        console.error(`${v.rel}:${v.line} [${v.rule}/${v.id}] ${v.message}`);
        console.error(`  ${v.snippet}`);
      }
      console.error(`\n${all.length} violation(s) (${strictHits.length} strict, ${progressiveHits.length} progressive)`);
    }
  }

  process.exit(all.length > 0 ? 1 : 0);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
