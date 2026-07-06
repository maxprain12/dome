#!/usr/bin/env node
/**
 * Deterministic batch triage fallback when the LLM triage agent fails.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentToRelativePath, parseArgs } from './lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_CJS = 'electron/core/db/migrations.cjs';
const LARGE_FILE_LINES = 1500;
const MAX_FIX_PER_RUN = 2;

/** @param {string} file */
function fileLineCount(file) {
  try {
    const abs = path.resolve(ROOT, file);
    return fs.readFileSync(abs, 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

/** @param {string} rule */
function isHeavyComplexity(rule) {
  const r = String(rule || '');
  return r.endsWith(':S3776') || r.endsWith(':S1541');
}

/**
 * @param {{ batch?: Array<Record<string, unknown>> }} batchPayload
 * @returns {{ fix: string[], defer: string[], rationale: Record<string, string>, notes: string, source: string }}
 */
export function heuristicBatchTriage(batchPayload) {
  const issues = batchPayload.batch || [];
  /** @type {string[]} */
  const fix = [];
  /** @type {string[]} */
  const defer = [];
  /** @type {Record<string, string>} */
  const rationale = {};

  const entries = issues.map((issue) => {
    const file = componentToRelativePath(String(issue.component || ''));
    const key = String(issue.key || issue.sonarKey || '');
    const rule = String(issue.rule || '');
    return { key, file, rule, lines: fileLineCount(file) };
  });

  const migrationEntries = entries.filter((e) => e.file === MIGRATIONS_CJS);
  const otherEntries = entries.filter((e) => e.file !== MIGRATIONS_CJS);

  if (migrationEntries.length > 0 && otherEntries.length > 0) {
    for (const m of migrationEntries) {
      defer.push(m.key);
      rationale[m.key] = 'migrations.cjs deferred — needs dedicated run when mixed with other issues';
    }
    for (const o of otherEntries) {
      fix.push(o.key);
      rationale[o.key] = 'lighter issue — fix this run';
    }
    return {
      fix,
      defer,
      rationale,
      notes: 'Heuristic: defer migrations in mixed batch',
      source: 'heuristic',
    };
  }

  const heavyEntries = entries.filter(
    (e) => e.file === MIGRATIONS_CJS || (e.lines > LARGE_FILE_LINES && isHeavyComplexity(e.rule)),
  );

  if (entries.length <= MAX_FIX_PER_RUN || heavyEntries.length === 0) {
    for (const e of entries) {
      fix.push(e.key);
      rationale[e.key] = 'eligible for this run';
    }
    return { fix, defer, rationale, notes: 'Heuristic: all issues fit budget', source: 'heuristic' };
  }

  const sorted = [...entries].sort((a, b) => {
    const aHeavy = heavyEntries.some((h) => h.key === a.key) ? 1 : 0;
    const bHeavy = heavyEntries.some((h) => h.key === b.key) ? 1 : 0;
    if (aHeavy !== bHeavy) return aHeavy - bHeavy;
    return a.lines - b.lines;
  });

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (i < MAX_FIX_PER_RUN) {
      fix.push(e.key);
      rationale[e.key] = 'selected — within per-run fix cap';
    } else {
      defer.push(e.key);
      rationale[e.key] = 'deferred — batch too heavy for one run';
    }
  }

  return {
    fix,
    defer,
    rationale,
    notes: `Heuristic: capped at ${MAX_FIX_PER_RUN} fixes`,
    source: 'heuristic',
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const batchPath = path.resolve(args.batch || '.quality-loop/batch.json');
  const payload = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(heuristicBatchTriage(payload), null, 2)}\n`);
}
