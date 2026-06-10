/* eslint-disable no-console */
/**
 * Retention policy for run history (docs/auditoria/05-datos-rendimiento/T04).
 *
 * Purges terminal automation/workflow runs older than `runs_retention_days`
 * (settings key; default 90, <= 0 disables). Steps and links cascade via FK.
 * Workflow runs own per-node JSONL sessions (`${runId}_${nodeId}`) that are
 * hidden from the Many history by matching run ids — those sessions are
 * deleted BEFORE the SQLite rows so a failed session delete never leaves an
 * orphan JSONL that would resurface in the chat history.
 */

const logger = require('../core/logger.cjs');

const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = DAY_MS;
const STARTUP_DELAY_MS = 30 * 1000;

let _startupTimer = null;
let _intervalId = null;

function defaultDeps() {
  // Lazy requires keep this module testable outside Electron.
  const database = require('../core/database.cjs');
  const bridge = require('./dome-harness-bridge.cjs');
  return {
    getDB: () => database.getDB(),
    getSetting: (key) => database.getQueries().getSetting.get(key)?.value,
    getSessionRepo: () => bridge.getSessionRepo(),
    sessionCwd: bridge.SESSION_CWD,
  };
}

function resolveRetentionDays(deps) {
  try {
    const value = deps.getSetting('runs_retention_days');
    if (value != null && String(value).trim() !== '') {
      const days = Number(value);
      if (Number.isFinite(days)) return days;
    }
  } catch (error) {
    logger.warn('run-retention', 'Failed to read runs_retention_days setting', {
      error: error?.message,
    });
  }
  return DEFAULT_RETENTION_DAYS;
}

/**
 * Delete the per-node JSONL sessions of the given workflow run ids.
 * Returns the set of run ids whose sessions are all gone (safe to purge).
 */
async function deleteWorkflowRunSessions(deps, workflowRunIds) {
  const safeToPurge = new Set(workflowRunIds);
  if (safeToPurge.size === 0) return { safeToPurge, deletedSessions: 0 };
  let deletedSessions = 0;
  const repo = await deps.getSessionRepo();
  const sessions = await repo.list({ cwd: deps.sessionCwd });
  for (const meta of sessions) {
    const sep = typeof meta.id === 'string' ? meta.id.indexOf('_') : -1;
    if (sep <= 0) continue;
    const runId = meta.id.slice(0, sep);
    if (!safeToPurge.has(runId)) continue;
    try {
      await repo.delete(meta);
      deletedSessions += 1;
    } catch (error) {
      // Keep the run row so the session stays hidden; retried on next purge.
      safeToPurge.delete(runId);
      logger.warn('run-retention', 'Failed to delete workflow node session', {
        sessionId: meta.id,
        error: error?.message,
      });
    }
  }
  return { safeToPurge, deletedSessions };
}

async function purgeExpiredRuns({ now = Date.now(), deps = defaultDeps() } = {}) {
  const retentionDays = resolveRetentionDays(deps);
  const result = { retentionDays, purgedRuns: 0, purgedFeederRuns: 0, purgedSessions: 0 };
  if (!(retentionDays > 0)) return result;
  const cutoff = now - retentionDays * DAY_MS;
  const db = deps.getDB();

  const expired = db.prepare(`
    SELECT id, owner_type FROM automation_runs
    WHERE status IN ('completed', 'failed', 'cancelled') AND updated_at < ?
  `).all(cutoff);

  const workflowRunIds = expired
    .filter((run) => run.owner_type === 'workflow')
    .map((run) => run.id);
  const { safeToPurge, deletedSessions } = await deleteWorkflowRunSessions(deps, workflowRunIds);
  result.purgedSessions = deletedSessions;

  const purgeable = expired
    .filter((run) => run.owner_type !== 'workflow' || safeToPurge.has(run.id))
    .map((run) => run.id);

  if (purgeable.length > 0) {
    const deleteRun = db.prepare('DELETE FROM automation_runs WHERE id = ?');
    const deleteRuns = db.transaction((ids) => {
      for (const id of ids) deleteRun.run(id);
    });
    deleteRuns(purgeable);
    result.purgedRuns = purgeable.length;
  }

  const feederResult = db.prepare(`
    DELETE FROM feeder_runs
    WHERE status IN ('completed', 'failed') AND started_at < ?
  `).run(cutoff);
  result.purgedFeederRuns = feederResult?.changes ?? 0;

  if (result.purgedRuns > 0 || result.purgedFeederRuns > 0 || result.purgedSessions > 0) {
    logger.info('run-retention', 'Purged expired run history', result);
  }
  return result;
}

function init() {
  stop();
  _startupTimer = setTimeout(() => {
    purgeExpiredRuns().catch((error) => {
      logger.error('run-retention', 'Startup purge failed', { error: error?.message });
    });
  }, STARTUP_DELAY_MS);
  _intervalId = setInterval(() => {
    purgeExpiredRuns().catch((error) => {
      logger.error('run-retention', 'Scheduled purge failed', { error: error?.message });
    });
  }, PURGE_INTERVAL_MS);
}

function stop() {
  if (_startupTimer) {
    clearTimeout(_startupTimer);
    _startupTimer = null;
  }
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = {
  init,
  stop,
  purgeExpiredRuns,
  DEFAULT_RETENTION_DAYS,
};
