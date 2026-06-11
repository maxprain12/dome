import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { purgeExpiredRuns, DEFAULT_RETENTION_DAYS } = require('../agents/run-retention.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 10);

/**
 * Minimal fake of the better-sqlite3 surface used by run-retention:
 * prepare().all/.run + transaction(). Tracks deletions per table.
 */
function makeFakeDb({ expiredRuns = [], feederRunChanges = 0 } = {}) {
  const deletedRunIds = [];
  return {
    deletedRunIds,
    prepare(sql) {
      if (sql.includes('SELECT id, owner_type FROM automation_runs')) {
        return { all: () => expiredRuns };
      }
      if (sql.includes('DELETE FROM automation_runs')) {
        return { run: (id) => { deletedRunIds.push(id); return { changes: 1 }; } };
      }
      if (sql.includes('DELETE FROM feeder_runs')) {
        return { run: () => ({ changes: feederRunChanges }) };
      }
      throw new Error(`Unexpected SQL in fake db: ${sql}`);
    },
    transaction(fn) {
      return fn;
    },
  };
}

function makeFakeRepo(sessionIds, { failFor = [] } = {}) {
  const deleted = [];
  return {
    deleted,
    list: async () => sessionIds.map((id) => ({ id })),
    delete: async (meta) => {
      if (failFor.includes(meta.id)) throw new Error('fs busy');
      deleted.push(meta.id);
    },
  };
}

function makeDeps({ db, repo, retentionDays }) {
  return {
    getDB: () => db,
    getSetting: () => (retentionDays === undefined ? undefined : String(retentionDays)),
    getSessionRepo: async () => repo,
    sessionCwd: 'dome',
  };
}

describe('run-retention', () => {
  it('is disabled when runs_retention_days <= 0', async () => {
    const db = makeFakeDb({ expiredRuns: [{ id: 'r1', owner_type: 'agent' }] });
    const deps = makeDeps({ db, repo: makeFakeRepo([]), retentionDays: 0 });
    const result = await purgeExpiredRuns({ now: NOW, deps });
    assert.equal(result.purgedRuns, 0);
    assert.deepEqual(db.deletedRunIds, []);
  });

  it('defaults to 90 days when the setting is missing', async () => {
    const db = makeFakeDb();
    const deps = makeDeps({ db, repo: makeFakeRepo([]), retentionDays: undefined });
    const result = await purgeExpiredRuns({ now: NOW, deps });
    assert.equal(result.retentionDays, DEFAULT_RETENTION_DAYS);
  });

  it('purges expired terminal runs and feeder runs', async () => {
    const db = makeFakeDb({
      expiredRuns: [
        { id: 'run-a', owner_type: 'agent' },
        { id: 'run-b', owner_type: 'many' },
      ],
      feederRunChanges: 3,
    });
    const deps = makeDeps({ db, repo: makeFakeRepo([]), retentionDays: 90 });
    const result = await purgeExpiredRuns({ now: NOW, deps });
    assert.equal(result.purgedRuns, 2);
    assert.equal(result.purgedFeederRuns, 3);
    assert.deepEqual(db.deletedRunIds.sort(), ['run-a', 'run-b']);
  });

  it('deletes per-node JSONL sessions of purged workflow runs', async () => {
    const db = makeFakeDb({
      expiredRuns: [{ id: 'wfrun1', owner_type: 'workflow' }],
    });
    const repo = makeFakeRepo(['wfrun1_node1', 'wfrun1_node2', 'otherrun_node1', 'plainchat']);
    const deps = makeDeps({ db, repo, retentionDays: 90 });
    const result = await purgeExpiredRuns({ now: NOW, deps });
    assert.equal(result.purgedRuns, 1);
    assert.equal(result.purgedSessions, 2);
    assert.deepEqual(repo.deleted.sort(), ['wfrun1_node1', 'wfrun1_node2']);
    assert.deepEqual(db.deletedRunIds, ['wfrun1']);
  });

  it('keeps a workflow run row if any of its sessions fails to delete', async () => {
    const db = makeFakeDb({
      expiredRuns: [
        { id: 'wfbad', owner_type: 'workflow' },
        { id: 'wfok', owner_type: 'workflow' },
      ],
    });
    const repo = makeFakeRepo(['wfbad_node1', 'wfok_node1'], { failFor: ['wfbad_node1'] });
    const deps = makeDeps({ db, repo, retentionDays: 90 });
    const result = await purgeExpiredRuns({ now: NOW, deps });
    // wfbad row survives so its remaining session stays hidden from Many history
    assert.deepEqual(db.deletedRunIds, ['wfok']);
    assert.equal(result.purgedRuns, 1);
    assert.equal(result.purgedSessions, 1);
  });
});
