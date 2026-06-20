import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const RUN_QUEUED_ORPHAN_MS = 5 * 60 * 1000;
const RUN_WAITING_APPROVAL_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const RUN_QUEUED_ORPHAN_ERROR = 'Orphaned — the app was restarted before this run started.';
const RUN_APPROVAL_STALE_ERROR = 'Cancelled — approval was not completed within 7 days.';

function makeFakeDb(initialRuns) {
  const runs = initialRuns.map((row) => ({ ...row }));
  return {
    runs,
    prepare(sql) {
      return {
        run(...params) {
          const now = params[params.length - 3];
          const cutoff = params[params.length - 1];
          let changes = 0;
          if (sql.includes("status = 'queued'")) {
            for (const row of runs) {
              if (row.status !== 'queued') continue;
              const ts = row.started_at ?? row.updated_at ?? 0;
              if (ts < cutoff) {
                row.status = 'failed';
                row.error = RUN_QUEUED_ORPHAN_ERROR;
                row.finished_at = now;
                row.updated_at = now;
                changes += 1;
              }
            }
          } else if (sql.includes("status = 'waiting_approval'")) {
            for (const row of runs) {
              if (row.status !== 'waiting_approval') continue;
              const ts = row.updated_at ?? row.started_at ?? 0;
              if (ts < cutoff) {
                row.status = 'cancelled';
                row.error = RUN_APPROVAL_STALE_ERROR;
                row.finished_at = now;
                row.updated_at = now;
                changes += 1;
              }
            }
          }
          return { changes };
        },
      };
    },
  };
}

function recoverStuckRunsLike(dbModule, now) {
  const db = dbModule.getDB();
  const ts = now;
  const queuedStaleCutoff = ts - RUN_QUEUED_ORPHAN_MS;
  const approvalStaleCutoff = ts - RUN_WAITING_APPROVAL_STALE_MS;

  db.prepare(`
    UPDATE automation_runs
    SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
    WHERE status = 'queued' AND COALESCE(started_at, updated_at) < ?
  `).run(RUN_QUEUED_ORPHAN_ERROR, ts, ts, queuedStaleCutoff);

  db.prepare(`
    UPDATE automation_runs
    SET status = 'cancelled', error = ?, finished_at = ?, updated_at = ?
    WHERE status = 'waiting_approval' AND COALESCE(updated_at, started_at) < ?
  `).run(RUN_APPROVAL_STALE_ERROR, ts, ts, approvalStaleCutoff);
}

describe('recoverStuckRuns queued / waiting_approval', () => {
  it('marks old queued runs as failed', () => {
    const now = 1_000_000;
    const db = makeFakeDb([
      { id: 'q1', status: 'queued', started_at: now - RUN_QUEUED_ORPHAN_MS - 1 },
      { id: 'q2', status: 'queued', started_at: now - 1000 },
    ]);
    recoverStuckRunsLike({ getDB: () => db }, now);
    assert.equal(db.runs.find((r) => r.id === 'q1')?.status, 'failed');
    assert.equal(db.runs.find((r) => r.id === 'q2')?.status, 'queued');
  });

  it('marks stale waiting_approval runs as cancelled', () => {
    const now = 10_000_000;
    const db = makeFakeDb([
      { id: 'w1', status: 'waiting_approval', updated_at: now - RUN_WAITING_APPROVAL_STALE_MS - 1 },
      { id: 'w2', status: 'waiting_approval', updated_at: now - 1000 },
    ]);
    recoverStuckRunsLike({ getDB: () => db }, now);
    assert.equal(db.runs.find((r) => r.id === 'w1')?.status, 'cancelled');
    assert.equal(db.runs.find((r) => r.id === 'w2')?.status, 'waiting_approval');
  });
});
