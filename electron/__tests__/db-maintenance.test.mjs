import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  reclaimSpaceIfBloated,
  incrementalVacuum,
  repairBloatedCalendarReminders,
  readPageStats,
} = require('../core/db-maintenance.cjs');

/**
 * Stub of the better-sqlite3 surface db-maintenance uses (pragma + exec).
 * VACUUM compacts the file to its live pages; incremental_vacuum drops the
 * freelist. Lets us assert the decision logic without a native better-sqlite3
 * (which is compiled for Electron's ABI, not plain Node).
 */
function makeFakeDb({ pageSize = 4096, pageCount, freelistCount, autoVacuum = 0, calendarRows = [] }) {
  const state = { pageSize, pageCount, freelistCount, autoVacuum, calendarRows: [...calendarRows] };
  const calls = { execs: [], pragmas: [], updates: [] };
  const db = {
    state,
    calls,
    pragma(arg) {
      calls.pragmas.push(arg);
      const a = String(arg).trim();
      if (a === 'page_size') return state.pageSize;
      if (a === 'page_count') return state.pageCount;
      if (a === 'freelist_count') return state.freelistCount;
      if (a === 'auto_vacuum') return state.autoVacuum;
      if (/^auto_vacuum\s*=\s*incremental$/i.test(a)) {
        state.autoVacuum = 2;
        return undefined;
      }
      throw new Error(`Unexpected pragma: ${arg}`);
    },
    prepare(sql) {
      const s = String(sql);
      if (s.includes('COUNT(*)') && s.includes('calendar_events')) {
        return {
          get(threshold) {
            const c = state.calendarRows.filter((len) => len > threshold).length;
            return { c };
          },
        };
      }
      if (s.startsWith('UPDATE calendar_events')) {
        return {
          run(remindersJson, updatedAt, threshold) {
            calls.updates.push({ remindersJson, updatedAt, threshold });
            let changes = 0;
            state.calendarRows = state.calendarRows.map((len) => {
              if (len > threshold) {
                changes += 1;
                return remindersJson.length;
              }
              return len;
            });
            return { changes };
          },
        };
      }
      throw new Error(`Unexpected prepare: ${sql}`);
    },
    exec(sql) {
      calls.execs.push(sql);
      const s = String(sql).trim().toUpperCase();
      if (s === 'VACUUM') {
        // Compact: only live pages remain.
        state.pageCount = state.pageCount - state.freelistCount;
        state.freelistCount = 0;
        return;
      }
      if (s === 'PRAGMA INCREMENTAL_VACUUM') {
        state.pageCount = state.pageCount - state.freelistCount;
        state.freelistCount = 0;
        return;
      }
      throw new Error(`Unexpected exec: ${sql}`);
    },
  };
  return db;
}

describe('db-maintenance — ELECTRON-7 space reclaim', () => {
  it('readPageStats derives free/file bytes from pragmas', () => {
    const db = makeFakeDb({ pageCount: 1000, freelistCount: 900 });
    const stats = readPageStats(db);
    assert.equal(stats.freeBytes, 900 * 4096);
    assert.equal(stats.fileBytes, 1000 * 4096);
  });

  it('does NOT VACUUM when free space is below the threshold', () => {
    // ~4MB free — trivial, should be left alone.
    const db = makeFakeDb({ pageCount: 2000, freelistCount: 1000 });
    const res = reclaimSpaceIfBloated(db);
    assert.equal(res.ran, false);
    assert.equal(res.reason, 'below_threshold');
    assert.ok(!db.calls.execs.includes('VACUUM'));
  });

  it('VACUUMs a bloated DB (mostly free pages) and reclaims the file', () => {
    // Mirror the real incident: ~6.85GB free out of ~6.9GB, only live data kept.
    const db = makeFakeDb({ pageCount: 1_685_579, freelistCount: 1_672_810, autoVacuum: 0 });
    const before = readPageStats(db);
    const res = reclaimSpaceIfBloated(db);
    assert.equal(res.ran, true);
    assert.ok(db.calls.execs.includes('VACUUM'));
    // It switched to INCREMENTAL auto-vacuum first.
    assert.equal(db.state.autoVacuum, 2);
    assert.ok(res.after.fileBytes < before.fileBytes);
    // Live data is what remains (~12,769 pages).
    assert.equal(res.after.freeBytes, 0);
  });

  it('skips gracefully when no usable db handle is provided', () => {
    assert.equal(reclaimSpaceIfBloated(null).ran, false);
    assert.equal(reclaimSpaceIfBloated({}).ran, false);
  });

  it('incrementalVacuum is a no-op unless the DB is in INCREMENTAL mode', () => {
    const none = makeFakeDb({ pageCount: 100, freelistCount: 50, autoVacuum: 0 });
    assert.deepEqual(incrementalVacuum(none), { ran: false, reason: 'not_incremental' });
    assert.ok(!none.calls.execs.includes('PRAGMA incremental_vacuum'));
  });

  it('incrementalVacuum reclaims freed pages when INCREMENTAL', () => {
    const inc = makeFakeDb({ pageCount: 100, freelistCount: 50, autoVacuum: 2 });
    const res = incrementalVacuum(inc);
    assert.equal(res.ran, true);
    assert.ok(inc.calls.execs.includes('PRAGMA incremental_vacuum'));
    assert.equal(inc.state.freelistCount, 0);
  });

  it('repairBloatedCalendarReminders resets oversized reminders rows', () => {
    const db = makeFakeDb({ calendarRows: [20, 9000, 100] });
    const res = repairBloatedCalendarReminders(db);
    assert.equal(res.repaired, 1);
    assert.ok(db.calls.updates.length > 0);
  });
});
