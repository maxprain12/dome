#!/usr/bin/env node
/**
 * Windows startup diagnostic helper for Dome v2.5.x hang / high RAM reports.
 *
 * Usage:
 *   node scripts/windows-startup-diag.mjs
 *   node scripts/windows-startup-diag.mjs --db "C:\Users\you\AppData\Roaming\dome\dome.db"
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function defaultDbPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'dome', 'dome.db');
}

function parseArgs(argv) {
  const dbFlag = argv.indexOf('--db');
  const dbPath = dbFlag >= 0 ? argv[dbFlag + 1] : defaultDbPath();
  return { dbPath };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function tryOpenDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.warn(`Database not found: ${dbPath}`);
    return null;
  }
  try {
    const Database = require('better-sqlite3');
    return new Database(dbPath, { readonly: true });
  } catch (err) {
    console.warn(`Could not open database (${err?.message || err})`);
    return null;
  }
}

function printRunStatus(db) {
  section('automation_runs by status');
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM automation_runs GROUP BY status ORDER BY c DESC').all();
  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.status}: ${row.c}`);
  }
}

function printStaleRuns(db) {
  section('potentially stuck runs (queued / running / waiting_approval)');
  const rows = db.prepare(`
    SELECT id, status, automation_id, started_at, updated_at, last_heartbeat_at, error
    FROM automation_runs
    WHERE status IN ('queued', 'running', 'waiting_approval')
    ORDER BY COALESCE(updated_at, started_at) DESC
    LIMIT 20
  `).all();
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.id} status=${row.status} automation=${row.automation_id} updated=${row.updated_at}`);
    if (row.error) console.log(`    error: ${String(row.error).slice(0, 120)}`);
  }
}

function printEnabledAutomations(db) {
  section('enabled scheduled automations');
  const rows = db.prepare(`
    SELECT id, title, enabled, schedule_json, last_run_at
    FROM automation_definitions
    WHERE enabled = 1
    ORDER BY title
  `).all();
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.id} — ${row.title || '(untitled)'} lastRun=${row.last_run_at ?? 'never'}`);
    if (row.schedule_json) console.log(`    schedule: ${row.schedule_json}`);
  }
}

function printSettings(db) {
  section('relevant settings');
  const keys = [
    'automation_run_on_startup',
    'semantic_initial_reindex_done_v2',
    'github_sync_auto_enabled',
    'github_sync_interval_minutes',
    'dome_mcp_enabled',
    'email_himalaya_path',
  ];
  for (const key of keys) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    console.log(`  ${key}: ${row?.value ?? '(unset)'}`);
  }
}

function printAgentSessions(userDataDir) {
  section('agent-sessions directory');
  const dir = path.join(userDataDir, 'agent-sessions');
  if (!fs.existsSync(dir)) {
    console.log(`(missing) ${dir}`);
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += fs.statSync(path.join(dir, file)).size;
  }
  console.log(`  path: ${dir}`);
  console.log(`  files: ${files.length}`);
  console.log(`  total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

function main() {
  const { dbPath } = parseArgs(process.argv.slice(2));
  const userDataDir = path.dirname(dbPath);

  console.log('Dome Windows startup diagnostic');
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Database: ${dbPath}`);

  const db = tryOpenDb(dbPath);
  if (db) {
    try {
      printRunStatus(db);
      printStaleRuns(db);
      printEnabledAutomations(db);
      printSettings(db);
    } finally {
      db.close();
    }
  }

  printAgentSessions(userDataDir);

  section('SQLite backups');
  if (fs.existsSync(userDataDir)) {
    const all = fs.readdirSync(userDataDir).filter(
      (f) => f.startsWith('dome.db.auto-') || f.startsWith('dome.db.backup-v'),
    );
    if (all.length === 0) {
      console.log('  (no backups — run Dome once to create startup snapshot)');
    } else {
      for (const name of all.slice(0, 10)) {
        const stat = fs.statSync(path.join(userDataDir, name));
        console.log(`  ${name} — ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
      }
      if (all.length > 10) console.log(`  ... and ${all.length - 10} more`);
    }
  }

  section('SQLite sidecars (WAL/SHM)');
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = dbPath + suffix;
    if (fs.existsSync(sidecar)) {
      const stat = fs.statSync(sidecar);
      console.log(`  ${sidecar} — ${stat.size} bytes (stale sidecars can cause SQLITE_IOERR on Windows)`);
    }
  }
  if (!fs.existsSync(dbPath + '-wal') && !fs.existsSync(dbPath + '-shm')) {
    console.log('  (no sidecar files present)');
  }

  section('manual checks');
  console.log('  1. Task Manager: count Dome renderer processes at 0s / 10s / 60s after launch.');
  console.log('  2. DevTools → Application → localStorage key dome:tabs-v1 (active tab).');
  console.log('  3. Logs under %APPDATA%\\dome\\logs or dev console: [Automation], [Init], [himalaya], [MCP].');
  console.log('  4. A/B: rename dome.db (backup) or disable all automations — does startup improve?');
  console.log('  5. SQLITE_IOERR: quit Dome, delete dome.db-wal and dome.db-shm, restart.');
}

main();
