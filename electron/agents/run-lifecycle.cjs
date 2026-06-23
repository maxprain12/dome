/**
 * Run context registry + abort (04/T05 fase 2 — extracted from run-engine.cjs).
 * Owns the in-memory state of active runs; persistence lives in run-store.cjs.
 *
 * Memory safety: activeRunContexts is an unbounded Map that retains each run's
 * steps, AbortController and API key. A long session with periodic automations
 * (which can themselves trigger GitHub syncs) grows it without limit. To avoid
 * the leak documented in docs/auditoria/04-harness-agentes/T04-cleanup-run-contexts.md
 * we sweep periodically:
 *   - contexts whose run is already terminal (or gone from the store) are
 *     force-released;
 *   - contexts paused on human-in-the-loop approval for longer than
 *     HITL_STALE_MS are force-released (the user is gone; the run can be
 *     resumed later, which recreates the context).
 */

const runStore = require('./run-store.cjs');
const { getRun, patchRun, finalizeRunningRunSteps, RUN_TERMINAL_STATUSES } = runStore;

function now() {
  return Date.now();
}

const activeRunContexts = new Map();

// A run waiting for approval for more than 1 day is effectively abandoned.
const HITL_STALE_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let _sweepIntervalId = null;

/**
 * Reclaim memory by dropping contexts that no longer correspond to a live run.
 * Safe to call at any time. Returns the number of contexts reclaimed.
 */
function sweepStaleRunContexts() {
  let reclaimed = 0;
  for (const [runId, ctx] of activeRunContexts) {
    const run = getRun(runId);
    // Run is gone or already in a terminal status → context is stale.
    if (!run || RUN_TERMINAL_STATUSES.has(run.status)) {
      if (ctx.apiKey) ctx.apiKey = undefined;
      activeRunContexts.delete(runId);
      reclaimed += 1;
      continue;
    }
    // Run is paused on human approval but has been idle too long → abandon the
    // in-memory context (keeps the secret out of RAM; the run record stays).
    if (run.status === 'waiting_approval' && ctx.createdAt) {
      if (now() - ctx.createdAt > HITL_STALE_MS) {
        if (ctx.apiKey) ctx.apiKey = undefined;
        activeRunContexts.delete(runId);
        reclaimed += 1;
      }
    }
  }
  if (reclaimed > 0) {
    console.log(`[run-lifecycle] swept ${reclaimed} stale run context(s); ${activeRunContexts.size} remaining`);
  }
  return reclaimed;
}

/** Current number of in-memory run contexts (diagnostic metric). */
function activeRunContextsSize() {
  return activeRunContexts.size;
}

/** Start the periodic stale-context sweep. Call once from main.cjs. */
function startRunContextSweep() {
  if (_sweepIntervalId) return;
  _sweepIntervalId = setInterval(() => {
    try {
      sweepStaleRunContexts();
    } catch (err) {
      console.error('[run-lifecycle] sweep error:', err?.message || err);
    }
  }, SWEEP_INTERVAL_MS);
  if (_sweepIntervalId.unref) _sweepIntervalId.unref();
}

function stopRunContextSweep() {
  if (_sweepIntervalId) {
    clearInterval(_sweepIntervalId);
    _sweepIntervalId = null;
  }
}

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
  sweepStaleRunContexts,
  activeRunContextsSize,
  startRunContextSweep,
  stopRunContextSweep,
};
