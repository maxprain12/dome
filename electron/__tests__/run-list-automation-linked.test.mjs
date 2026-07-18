/**
 * Ensures listRuns(automationLinkedOnly) only returns rows with automation_id.
 * Uses an in-memory SQLite if better-sqlite3 is available; otherwise skips.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('listRuns automationLinkedOnly', () => {
  it('filters to rows with non-null automation_id', () => {
    let db;
    try {
      const Database = require('better-sqlite3');
      db = new Database(':memory:');
    } catch {
      // Native module missing or built for a different Node ABI — skip.
      return;
    }
    db.exec(`
      CREATE TABLE automation_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        automation_id TEXT,
        owner_type TEXT,
        owner_id TEXT,
        title TEXT,
        status TEXT,
        session_id TEXT,
        workflow_id TEXT,
        workflow_execution_id TEXT,
        thread_id TEXT,
        output_text TEXT,
        summary TEXT,
        error TEXT,
        metadata TEXT,
        started_at INTEGER,
        updated_at INTEGER,
        finished_at INTEGER,
        last_heartbeat_at INTEGER
      );
    `);

    const insert = db.prepare(`
      INSERT INTO automation_runs (
        id, project_id, automation_id, owner_type, owner_id, title, status, updated_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('r-many', 'p1', null, 'many', 's1', 'chat', 'completed', 3, 1);
    insert.run('r-auto', 'p1', 'auto-1', 'agent', 'a1', 'Nightly', 'completed', 2, 1);
    insert.run('r-wf', 'p1', 'auto-2', 'workflow', 'w1', 'WF', 'failed', 1, 1);

    const { buildQueries } = require(path.join(__dirname, '../core/db/queries.cjs'));
    const queries = buildQueries(db);

    const linked = queries.getLatestLinkedAutomationRunsByProject.all('p1', 50);
    assert.equal(linked.length, 2);
    assert.ok(linked.every((row) => row.automation_id != null));
    assert.deepEqual(
      linked.map((r) => r.id).sort(),
      ['r-auto', 'r-wf'],
    );

    const all = queries.getLatestAutomationRunsByProject.all('p1', 50);
    assert.equal(all.length, 3);

    db.close();
  });
});

