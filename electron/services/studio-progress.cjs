/* eslint-disable no-console */

const crypto = require('crypto');

/** @type {Map<string, { cancelled: boolean }>} */
const activeRuns = new Map();

function createRunId() {
  return crypto.randomUUID();
}

function registerRun(runId) {
  activeRuns.set(runId, { cancelled: false });
  return runId;
}

function cancelRun(runId) {
  const run = activeRuns.get(runId);
  if (run) run.cancelled = true;
}

function isRunCancelled(runId) {
  return activeRuns.get(runId)?.cancelled ?? false;
}

function clearRun(runId) {
  activeRuns.delete(runId);
}

function emitProgress(windowManager, payload) {
  if (!windowManager?.broadcast) return;
  windowManager.broadcast('studio:progress', payload);
}

function progress(windowManager, runId, phase, message, extra = {}) {
  emitProgress(windowManager, {
    runId,
    phase,
    message,
    ...extra,
  });
}

module.exports = {
  createRunId,
  registerRun,
  cancelRun,
  isRunCancelled,
  clearRun,
  emitProgress,
  progress,
};
