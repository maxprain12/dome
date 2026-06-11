/**
 * Run context registry + abort (04/T05 fase 2 — extracted from run-engine.cjs).
 * Owns the in-memory state of active runs; persistence lives in run-store.cjs.
 */

const runStore = require('./run-store.cjs');
const { getRun, patchRun, finalizeRunningRunSteps, RUN_TERMINAL_STATUSES } = runStore;

function now() {
  return Date.now();
}

const activeRunContexts = new Map();

function releaseRunContext(runId, { force = false } = {}) {
  const ctx = activeRunContexts.get(runId);
  if (!ctx) return;
  if (!force) {
    const run = getRun(runId);
    if (run?.status === 'waiting_approval') return;
  }
  if (ctx.apiKey) ctx.apiKey = undefined;
  activeRunContexts.delete(runId);
}

function abortRun(runId) {
  const context = activeRunContexts.get(runId);
  if (context?.controller) {
    context.controller.abort();
  }
  const current = getRun(runId);
  if (current && !RUN_TERMINAL_STATUSES.has(current.status)) {
    const ctx = activeRunContexts.get(runId);
    patchRun(runId, {
      status: 'cancelled',
      finishedAt: now(),
      error: null,
      summary: current.summary || 'Run cancelado',
      metadata: {
        ...(current.metadata ?? {}),
        ...(ctx?.llmUsage ? { usage: ctx.llmUsage } : {}),
      },
    });
    finalizeRunningRunSteps(runId, 'cancelled', context);
  }
}

/** Abort every active run (app shutdown). */
function abortAllRunContexts() {
  for (const context of activeRunContexts.values()) {
    context.controller?.abort?.();
  }
  activeRunContexts.clear();
}

module.exports = {
  activeRunContexts,
  releaseRunContext,
  abortRun,
  abortAllRunContexts,
};
