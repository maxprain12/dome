#!/usr/bin/env node
/**
 * Phase 0 baseline: measure DB file stats and hot-query latency (read-only).
 * Usage: node scripts/db-perf-baseline.mjs [path-to-dome.db]
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath =
  process.argv[2] ||
  path.join(process.env.APPDATA || '', 'dome', 'dome.db');

if (!fs.existsSync(dbPath)) {
  console.error('[db-perf-baseline] DB not found:', dbPath);
  process.exit(1);
}

function mb(n) {
  return `${(n / 1e6).toFixed(2)} MB`;
}

function bench(label, fn, iterations = 50) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { label, iterations, totalMs: ms.toFixed(2), avgMs: (ms / iterations).toFixed(3) };
}

const stat = fs.statSync(dbPath);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const pageSize = Number(db.pragma('page_size', { simple: true }));
const pageCount = Number(db.pragma('page_count', { simple: true }));
const freelist = Number(db.pragma('freelist_count', { simple: true }));

console.log('=== DB perf baseline ===');
console.log(JSON.stringify({
  capturedAt: new Date().toISOString(),
  path: dbPath,
  fileBytes: stat.size,
  fileMB: mb(stat.size),
  pageSize,
  pageCount,
  freelistCount: freelist,
  freePct: `${((freelist / pageCount) * 100).toFixed(2)}%`,
  liveBytesApprox: pageSize * (pageCount - freelist),
}, null, 2));

const schemaVersion = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
console.log('schema_version:', schemaVersion?.value ?? 'unknown');

const benches = [];
benches.push(bench('getSetting', () => {
  db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_provider');
}));
benches.push(bench('listResourcesLight', () => {
  db.prepare(`
    SELECT id, project_id, type, title FROM resources ORDER BY updated_at DESC LIMIT 50
  `).all();
}, 20));
benches.push(bench('searchResources FTS', () => {
  try {
    db.prepare(`
      SELECT r.id FROM resources r
      JOIN resources_fts fts ON r.id = fts.resource_id
      WHERE resources_fts MATCH ?
      LIMIT 20
    `).all('note');
  } catch {
    /* empty FTS on test DB */
  }
}, 10));

console.log('\n=== query latency ===');
for (const b of benches) console.log(JSON.stringify(b));

db.close();
