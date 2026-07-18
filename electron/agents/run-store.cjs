/* eslint-disable no-console */
/**
 * Run persistence layer (04/T05 — extracted from run-engine.cjs).
 * Owns the SQLite rows of automation_runs / steps / links, their renderer
 * events (runs:updated / runs:step) and the note-resource side effect.
 * run-engine.cjs re-exports this API unchanged.
 */

const crypto = require('crypto');
const { safeStringify } = require('../tools/tool-result-cap.cjs');

const RUN_EVENT_CHANNEL = 'runs:updated';
const RUN_STEP_CHANNEL = 'runs:step';
const RUN_CHUNK_CHANNEL = 'runs:chunk';
const RUN_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

let _database = null;
let _windowManager = null;
let _hooks = {};

/**
 * @param {object} database
 * @param {object} windowManager
 * @param {{ onTerminalAutomationStatus?: (automationId: string, status: string) => void, onRunTerminal?: (run: object) => void }} hooks
 */
function init(database, windowManager, hooks = {}) {
  _database = database;
  _windowManager = windowManager;
  _hooks = hooks;
}

function getQueries() {
  return _database?.getQueries?.();
}

function now() {
  return Date.now();
}

function parseJsonSafely(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  // Backstop against ELECTRON-7: a raw JSON.stringify of run/step metadata (e.g.
  // metadata.toolCalls with large tool results) that grew past the heap would
  // OOM the main process inside V8's JsonStringify. safeStringify bounds the
  // serialization and degrades to a small notice instead of crashing. Strings
  // and normal-sized objects pass through unchanged.
  return value == null ? null : safeStringify(value);
}

function emit(channel, payload) {
  _windowManager?.broadcast?.(channel, payload);
}

function normalizeRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? 'default',
    automationId: row.automation_id ?? null,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    title: row.title ?? '',
    status: row.status,
    sessionId: row.session_id ?? null,
    workflowId: row.workflow_id ?? null,
    workflowExecutionId: row.workflow_execution_id ?? null,
    threadId: row.thread_id ?? null,
    outputText: row.output_text ?? '',
    summary: row.summary ?? null,
    error: row.error ?? null,
    metadata: parseJsonSafely(row.metadata, {}),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? null,
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
  };
}

function normalizeStepRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    parentStepId: row.parent_step_id ?? null,
    stepType: row.step_type,
    title: row.title,
    status: row.status,
    content: row.content ?? null,
    metadata: parseJsonSafely(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function updateStoredRun(run) {
  const queries = getQueries();
  if (!queries?.updateAutomationRun) {
    throw new Error('Database queries unavailable');
  }
  queries.updateAutomationRun.run(
    run.projectId ?? 'default',
    run.automationId ?? null,
    run.ownerType,
    run.ownerId,
    run.title ?? null,
    run.status,
    run.sessionId ?? null,
    run.workflowId ?? null,
    run.workflowExecutionId ?? null,
    run.threadId ?? null,
    run.outputText ?? '',
    run.summary ?? null,
    run.error ?? null,
    toJson(run.metadata ?? {}),
    run.updatedAt,
    run.finishedAt ?? null,
    run.lastHeartbeatAt ?? null,
    run.id,
  );
}

function createRun(params) {
  const queries = getQueries();
  const timestamp = now();
  const run = {
    id: params.id ?? crypto.randomUUID(),
    projectId: params.projectId ?? 'default',
    automationId: params.automationId ?? null,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    title: params.title ?? '',
    status: params.status ?? 'queued',
    sessionId: params.sessionId ?? null,
    workflowId: params.workflowId ?? null,
    workflowExecutionId: params.workflowExecutionId ?? null,
    threadId: params.threadId ?? null,
    outputText: params.outputText ?? '',
    summary: params.summary ?? null,
    error: params.error ?? null,
    metadata: params.metadata ?? {},
    startedAt: params.startedAt ?? timestamp,
    updatedAt: params.updatedAt ?? timestamp,
    finishedAt: params.finishedAt ?? null,
    lastHeartbeatAt: params.lastHeartbeatAt ?? timestamp,
  };
  queries.createAutomationRun.run(
    run.id,
    run.projectId,
    run.automationId,
    run.ownerType,
    run.ownerId,
    run.title,
    run.status,
    run.sessionId,
    run.workflowId,
    run.workflowExecutionId,
    run.threadId,
    run.outputText,
    run.summary,
    run.error,
    toJson(run.metadata),
    run.startedAt,
    run.updatedAt,
    run.finishedAt,
    run.lastHeartbeatAt,
  );
  emit(RUN_EVENT_CHANNEL, { run: run });
  return run;
}

function patchRun(runId, patch) {
  const queries = getQueries();
  const current = normalizeRunRow(queries.getAutomationRunById.get(runId));
  if (!current) {
    console.warn('[RunEngine] patchRun skipped — run not found:', runId);
    return null;
  }
  const next = {
    ...current,
    ...patch,
    metadata: { ...(current.metadata ?? {}), ...(patch.metadata ?? {}) },
    updatedAt: patch.updatedAt ?? now(),
    lastHeartbeatAt:
      Object.prototype.hasOwnProperty.call(patch, 'lastHeartbeatAt')
        ? patch.lastHeartbeatAt
        : (patch.status === 'running' ? now() : current.lastHeartbeatAt),
  };
  updateStoredRun(next);
  const patchKeys = Object.keys(patch);
  const heartbeatOnly =
    patchKeys.length > 0 &&
    patchKeys.every((key) => key === 'lastHeartbeatAt' || key === 'updatedAt');
  if (!heartbeatOnly) {
    emit(RUN_EVENT_CHANNEL, { run: next });
  }
  if (next.automationId && RUN_TERMINAL_STATUSES.has(next.status)) {
    try {
      _hooks.onTerminalAutomationStatus?.(next.automationId, next.status);
    } catch (e) {
      console.warn('[RunStore] onTerminalAutomationStatus failed:', e?.message);
    }
  }
  // Generic terminal hook (any owner). Used by the pipeline runner to close the
  // run → pipeline_item loop without coupling the core engine to pipelines.
  if (RUN_TERMINAL_STATUSES.has(next.status) && current.status !== next.status) {
    try {
      _hooks.onRunTerminal?.(next);
    } catch (e) {
      console.warn('[RunStore] onRunTerminal failed:', e?.message);
    }
  }
  const becameCompleted =
    next.status === 'completed' &&
    current.status !== 'completed' &&
    next.automationId &&
    typeof next.outputText === 'string' &&
    next.outputText.trim() !== '';
  if (becameCompleted && _database && _windowManager) {
    try {
      const { applyArtifactSinksForCompletedRun } = require('../artifacts/artifact-sink.cjs');
      applyArtifactSinksForCompletedRun(_database, _windowManager, {
        automationId: next.automationId,
        runId,
        outputText: next.outputText,
      });
    } catch (e) {
      console.warn('[RunEngine] artifact sink failed:', e?.message);
    }
  }
  return next;
}

function appendRunStep(params) {
  const queries = getQueries();
  if (!queries.getAutomationRunById.get(params.runId)) {
    console.warn('[RunEngine] appendRunStep skipped — run not found:', params.runId);
    return null;
  }
  const timestamp = now();
  const step = {
    id: params.id ?? crypto.randomUUID(),
    runId: params.runId,
    parentStepId: params.parentStepId ?? null,
    stepType: params.stepType ?? 'info',
    title: params.title ?? 'Paso',
    status: params.status ?? 'done',
    content: params.content ?? null,
    metadata: params.metadata ?? {},
    createdAt: params.createdAt ?? timestamp,
    updatedAt: params.updatedAt ?? timestamp,
  };
  try {
    queries.createAutomationRunStep.run(
      step.id,
      step.runId,
      step.parentStepId,
      step.stepType,
      step.title,
      step.status,
      step.content,
      toJson(step.metadata),
      step.createdAt,
      step.updatedAt,
    );
  } catch (error) {
    console.warn('[RunEngine] appendRunStep failed:', error?.message || error);
    return null;
  }
  emit(RUN_STEP_CHANNEL, { step });
  return step;
}

function updateRunStep(stepId, patch, existingStep = null) {
  const queries = getQueries();
  const mergedMetadata = existingStep
    ? { ...(existingStep.metadata ?? {}), ...(patch.metadata ?? {}) }
    : (patch.metadata ?? {});
  const nextStep = existingStep
    ? {
      ...existingStep,
      ...patch,
      metadata: mergedMetadata,
      updatedAt: patch.updatedAt ?? now(),
    }
    : null;
  queries.updateAutomationRunStep.run(
    patch.status ?? 'done',
    patch.content ?? null,
    toJson(mergedMetadata),
    nextStep?.updatedAt ?? patch.updatedAt ?? now(),
    stepId,
  );
  if (nextStep) emit(RUN_STEP_CHANNEL, { step: nextStep });
  return nextStep;
}

function resolveStepStatus(runTerminalStatus) {
  if (runTerminalStatus === 'completed') return 'done';
  if (runTerminalStatus === 'cancelled') return 'cancelled';
  return 'failed';
}

function resolveToolCallStatus(runTerminalStatus) {
  if (runTerminalStatus === 'completed') return 'success';
  if (runTerminalStatus === 'cancelled') return 'cancelled';
  return 'error';
}

function finalizeContextToolSteps(context, stepStatus) {
  if (!context?.toolSteps || !(context.toolSteps instanceof Map)) return;
  for (const [toolCallId, step] of context.toolSteps.entries()) {
    if (!step || step.status !== 'running') continue;
    const next = updateRunStep(step.id, {
      status: stepStatus,
      metadata: { ...(step.metadata ?? {}), autoFinalized: true },
    }, step);
    if (next) context.toolSteps.set(toolCallId, next);
  }
}

function finalizeDbSteps(queries, runId, stepStatus) {
  if (!queries.getAutomationRunById.get(runId)) return;
  const steps = queries.getAutomationRunSteps.all(runId).map(normalizeStepRow);
  for (const step of steps) {
    if (step.status !== 'running') continue;
    updateRunStep(step.id, {
      status: stepStatus,
      metadata: { ...(step.metadata ?? {}), autoFinalized: true },
    }, step);
  }
}

function finalizeContextToolCalls(context, runTerminalStatus) {
  if (!Array.isArray(context?.toolCalls)) return;
  const newStatus = resolveToolCallStatus(runTerminalStatus);
  for (const entry of context.toolCalls) {
    if (entry.status === 'running') entry.status = newStatus;
  }
}

function finalizeRunningRunSteps(runId, runTerminalStatus, context = null) {
  const stepStatus = resolveStepStatus(runTerminalStatus);
  finalizeContextToolSteps(context, stepStatus);

  const queries = getQueries();
  finalizeDbSteps(queries, runId, stepStatus);

  finalizeContextToolCalls(context, runTerminalStatus);
}

function getRun(runId) {
  const queries = getQueries();
  const run = normalizeRunRow(queries.getAutomationRunById.get(runId));
  if (!run) return null;
  const steps = queries.getAutomationRunSteps.all(runId).map(normalizeStepRow);
  const links = queries.getAutomationRunLinks.all(runId).map((row) => ({
    id: row.id,
    runId: row.run_id,
    linkType: row.link_type,
    linkId: row.link_id,
    createdAt: row.created_at,
  }));
  return { ...run, steps, links };
}

function listRuns(filters = {}) {
  const queries = getQueries();
  const limit = Math.max(1, Math.min(Number(filters.limit ?? 20), 100));
  if (filters.sessionId) {
    const row = queries.getActiveRunBySession.get(filters.sessionId);
    return row ? [normalizeRunRow(row)] : [];
  }
  if (filters.automationId) {
    return queries.getAutomationRunsByAutomation.all(filters.automationId, limit).map(normalizeRunRow);
  }
  if (filters.ownerType && filters.ownerId) {
    return queries.getAutomationRunsByOwner.all(filters.ownerType, filters.ownerId, limit).map(normalizeRunRow);
  }
  // Studio "Ejecuciones": only runs that belong to an automation (not Many/agent ad-hoc).
  if (filters.automationLinkedOnly) {
    if (filters.projectId) {
      return queries.getLatestLinkedAutomationRunsByProject
        .all(filters.projectId, limit)
        .map(normalizeRunRow);
    }
    return queries.getLatestLinkedAutomationRuns.all(limit).map(normalizeRunRow);
  }
  if (filters.projectId) {
    return queries.getLatestAutomationRunsByProject.all(filters.projectId, limit).map(normalizeRunRow);
  }
  return queries.getLatestAutomationRuns.all(limit).map(normalizeRunRow);
}

function getActiveRunBySession(sessionId) {
  const queries = getQueries();
  return normalizeRunRow(queries.getActiveRunBySession.get(sessionId));
}

function createNoteResource(projectId, title, content, metadata = {}) {
  const queries = getQueries();
  const timestamp = now();
  const id = crypto.randomUUID();
  queries.createResource.run(
    id,
    projectId || 'default',
    'note',
    title,
    content,
    null,
    null,
    JSON.stringify(metadata),
    timestamp,
    timestamp,
  );
  const resource = {
    id,
    project_id: projectId || 'default',
    type: 'note',
    title,
    content,
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };
  emit('resource:created', resource);
  return resource;
}

module.exports = {
  init,
  RUN_EVENT_CHANNEL,
  RUN_STEP_CHANNEL,
  RUN_CHUNK_CHANNEL,
  RUN_TERMINAL_STATUSES,
  parseJsonSafely,
  toJson,
  normalizeRunRow,
  normalizeStepRow,
  updateStoredRun,
  createRun,
  patchRun,
  appendRunStep,
  updateRunStep,
  finalizeRunningRunSteps,
  getRun,
  listRuns,
  getActiveRunBySession,
  createNoteResource,
};
