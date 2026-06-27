#!/usr/bin/env node
/**
 * One-off DB bloat inspector (read-only). Usage:
 *   node scripts/inspect-db-bloat.mjs [path-to-dome.db]
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath =
  process.argv[2] ||
  path.join(process.env.APPDATA || '', 'dome', 'dome.db');

if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath);
  process.exit(1);
}

const stat = fs.statSync(dbPath);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

function mb(n) {
  return `${(n / 1e6).toFixed(2)} MB`;
}

const pageSize = Number(db.pragma('page_size', { simple: true }));
const pageCount = Number(db.pragma('page_count', { simple: true }));
const freelist = Number(db.pragma('freelist_count', { simple: true }));
const autoVacuum = Number(db.pragma('auto_vacuum', { simple: true }));
const autoVacuumLabel = { 0: 'NONE', 1: 'FULL', 2: 'INCREMENTAL' }[autoVacuum] ?? String(autoVacuum);

console.log('=== FILE ===');
console.log('path:', dbPath);
console.log('size:', mb(stat.size), `(${stat.size} bytes)`);
console.log('modified:', stat.mtime.toISOString());
console.log('');
console.log('=== PAGE STATS ===');
console.log('page_size:', pageSize);
console.log('page_count:', pageCount);
console.log('freelist_count:', freelist);
console.log('free_pct:', `${((freelist / pageCount) * 100).toFixed(2)}%`);
console.log('free_bytes:', mb(pageSize * freelist));
console.log('live_bytes (approx):', mb(pageSize * (pageCount - freelist)));
console.log('auto_vacuum:', autoVacuumLabel);
console.log('');

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  .all()
  .map((r) => r.name);

console.log('=== TABLE ROW COUNTS ===');
for (const t of tables) {
  try {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
    if (n > 0) console.log(`${t}: ${n}`);
  } catch {
    /* skip */
  }
}
console.log('');

console.log('=== DBSTAT TOP TABLES (if available) ===');
try {
  const rows = db
    .prepare(
      `SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC LIMIT 20`
    )
    .all();
  for (const r of rows) {
    console.log(`${r.name}: ${mb(r.bytes)}`);
  }
} catch (e) {
  console.log('dbstat unavailable:', e.message);
}
console.log('');

function sampleLargeText(table, col, limit = 5) {
  try {
    return db
      .prepare(
        `SELECT rowid AS id, length("${col}") AS len FROM "${table}" WHERE "${col}" IS NOT NULL ORDER BY len DESC LIMIT ${limit}`
      )
      .all();
  } catch {
    return [];
  }
}

const probes = [
  ['automation_runs', 'metadata'],
  ['automation_run_steps', 'content'],
  ['automation_run_steps', 'metadata'],
  ['chat_messages', 'content'],
  ['chat_messages', 'metadata'],
  ['resources', 'content'],
  ['resources', 'metadata'],
  ['interactions', 'content'],
  ['interactions', 'metadata'],
  ['github_issues', 'body'],
  ['github_issues', 'metadata'],
  ['feeder_runs', 'output'],
  ['feeder_runs', 'metadata'],
  ['studio_outputs', 'content'],
  ['artifacts', 'state'],
  ['settings', 'value'],
];

console.log('=== LARGEST TEXT COLUMNS (top 5 each) ===');
for (const [table, col] of probes) {
  const rows = sampleLargeText(table, col);
  if (!rows.length) continue;
  const max = rows[0]?.len ?? 0;
  if (max < 100_000) continue;
  console.log(`\n${table}.${col}:`);
  for (const r of rows) {
    console.log(`  id=${r.id} len=${r.len} (${mb(r.len)})`);
  }
}

console.log('\n=== AUTOMATION RUNS RECENT (metadata size) ===');
try {
  const runs = db
    .prepare(
      `SELECT id, status, length(metadata) AS meta_len, started_at, finished_at
       FROM automation_runs
       WHERE metadata IS NOT NULL
       ORDER BY started_at DESC
       LIMIT 15`
    )
    .all();
  for (const r of runs) {
    console.log(
      `${r.id.slice(0, 8)}… status=${r.status} meta=${mb(r.meta_len)} started=${r.started_at}`
    );
  }
} catch (e) {
  console.log('automation_runs probe failed:', e.message);
}

console.log('\n=== TRUNCATION MARKERS (capResultText applied?) ===');
const markers = [
  ['automation_run_steps', 'content', 'result truncated for storage'],
  ['automation_runs', 'metadata', 'result truncated for storage'],
  ['automation_run_steps', 'content', '_domeOmitted'],
  ['chat_messages', 'content', 'result truncated for storage'],
];
for (const [table, col, needle] of markers) {
  try {
    const n = db
      .prepare(`SELECT COUNT(*) AS c FROM "${table}" WHERE "${col}" LIKE ?`)
      .get(`%${needle}%`).c;
    if (n > 0) console.log(`${table}.${col} contains "${needle}": ${n} rows`);
  } catch {
    /* skip */
  }
}

console.log('\n=== STEPS WITH HUGE CONTENT (recent) ===');
try {
  const steps = db
    .prepare(
      `SELECT s.id, s.run_id, s.step_type, length(s.content) AS content_len, s.created_at
       FROM automation_run_steps s
       WHERE s.content IS NOT NULL AND length(s.content) > 65536
       ORDER BY s.created_at DESC
       LIMIT 20`
    )
    .all();
  console.log(`count >64KB: ${steps.length} (showing up to 20)`);
  for (const s of steps) {
    console.log(
      `  run=${String(s.run_id).slice(0, 8)} type=${s.step_type} len=${mb(s.content_len)}`
    );
  }
} catch (e) {
  console.log('steps probe failed:', e.message);
}

db.close();
