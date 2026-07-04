/* eslint-disable no-console */

/**
 * Pipeline runner — bridges pipeline_items to the existing run engine.
 *
 * It does NOT implement a new execution engine: it builds an input from the
 * stage's template + the item's data, calls run-engine's startAgentRun /
 * startWorkflowRun, stores the resulting run id on the item, and (via the
 * run-store `onRunTerminal` hook) reflects the terminal run status back onto
 * the item (pending → running → ready/failed). The board updates live through
 * the `pipelines:item:updated` broadcast.
 */

const { buildRunInput, buildPipelineRunToolOptions } = require('./pipeline-card-context.cjs');

let _database = null;
let _windowManager = null;
let _runEngine = null;
let _logEvent = null;

/** Serializes concurrent triggerStageRun calls for the same item. */
const _triggerLocks = new Map();

function init({ database, windowManager, runEngine, logEvent }) {
  _database = database;
  _windowManager = windowManager;
  _runEngine = runEngine;
  _logEvent = logEvent;
}

function queries() {
  return _database?.getQueries?.();
}

function emitItem(item) {
  try {
    _windowManager?.broadcast?.('pipelines:item:updated', { item });
  } catch (e) {
    console.warn('[PipelineRunner] broadcast failed:', e?.message);
  }
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Camel-case mapper kept local to avoid a require cycle with the IPC handler. */
function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    stageId: row.stage_id,
    sourceId: row.source_id ?? null,
    title: row.title,
    position: row.position ?? 0,
    data: parseJson(row.data_json, null),
    execStatus: row.exec_status,
    assignedKind: row.assigned_kind,
    assignedAgentId: row.assigned_agent_id ?? null,
    currentRunId: row.current_run_id ?? null,
    lastOutput: row.last_output ?? null,
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
    calendarEventId: row.calendar_event_id ?? null,
    metadata: parseJson(row.metadata_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Trigger a run for an item that just entered (or was asked to run in) a stage.
 * Idempotent: if the item already has a live run, it is not relaunched.
 * Returns the updated item (mapped) or null if nothing was triggered.
 */
async function triggerStageRun(itemId, { force = false } = {}) {
  if (_triggerLocks.has(itemId)) {
    return _triggerLocks.get(itemId);
  }
  const promise = triggerStageRunInner(itemId, { force });
  _triggerLocks.set(itemId, promise);
  try {
    return await promise;
  } finally {
    _triggerLocks.delete(itemId);
  }
}

async function triggerStageRunInner(itemId, { force = false } = {}) {
  const q = queries();
  if (!q || !_runEngine) return null;
  const item = q.getPipelineItemById.get(itemId);
  if (!item) return null;
  const stage = q.getPipelineStageById.get(item.stage_id);
  if (!stage) return null;

  // Skip if already marked running with an active run.
  if (item.exec_status === 'running' && item.current_run_id) {
    const active = q.getAutomationRunById.get(item.current_run_id);
    if (active && ['queued', 'running', 'waiting_approval'].includes(active.status)) {
      return mapItem(item);
    }
  }

  // "Use Many" is stored as a config flag (config.useMany), not in
  // assigned_agent_id — that column has a FK to many_agents and 'many' is not
  // a real agent row.
  const stageConfig = parseJson(stage.config_json, {}) || {};
  const useMany = stageConfig.useMany === true;
  const hasExecutor = stage.assigned_agent_id || stage.assigned_workflow_id || useMany;
  if (!hasExecutor) return null;
  if (stage.execution_policy === 'manual_resolve') return null;
  // auto vs manual: auto runs on drop; manual only when explicitly forced.
  if (stage.execution_policy === 'manual_agent' && !force) return null;

  // Idempotency: skip if there is already an active run for this item.
  if (item.current_run_id) {
    const existing = q.getAutomationRunById.get(item.current_run_id);
    if (existing && ['queued', 'running', 'waiting_approval'].includes(existing.status)) {
      return mapItem(item);
    }
  }

  const now = Date.now();
  // Mark running immediately so the board doesn't show a stale "ready" status
  // while buildRunInput / startAgentRun are still in progress.
  q.updatePipelineItemExecStatus.run('running', item.assigned_kind ?? 'auto', item.current_run_id, item.last_output, now, item.id);
  emitItem(mapItem(q.getPipelineItemById.get(item.id)));

  let runInput;
  try {
    runInput = await buildRunInput(stage, item, q, { database: _database });
  } catch (e) {
    console.error('[PipelineRunner] buildRunInput failed:', e?.message);
    q.updatePipelineItemExecStatus.run('failed', item.assigned_kind, item.current_run_id, e?.message || 'Run failed', now, item.id);
    if (_logEvent) _logEvent(item.id, 'run_failed', { actor: 'system', summary: e?.message || 'Run failed' });
    emitItem(mapItem(q.getPipelineItemById.get(item.id)));
    return null;
  }

  const messages = [{ role: 'user', content: runInput }];
  const toolOpts = buildPipelineRunToolOptions(stage, q);
  const agentRunBase = {
    projectId: item.project_id,
    title: item.title,
    messages,
    provider: stage.provider || undefined,
    model: stage.model || undefined,
    skipHitl: true,
    toolDefinitions: toolOpts.toolDefinitions,
    toolIds: toolOpts.toolIds,
    ...(toolOpts.subagentIds !== undefined ? { subagentIds: toolOpts.subagentIds } : {}),
  };

  try {
    let run;
    if (stage.assigned_workflow_id) {
      run = _runEngine.startWorkflowRun({
        workflowId: stage.assigned_workflow_id,
        projectId: item.project_id,
        title: item.title,
        inputs: { prompt: runInput },
      });
    } else if (useMany) {
      // Run the stage with Many (the default assistant) instead of a custom
      // agent row. Mirrors the automation 'many' path (full tool catalog).
      run = await _runEngine.startAgentRun({
        ownerType: 'many',
        ownerId: 'many',
        ...agentRunBase,
      });
    } else {
      run = await _runEngine.startAgentRun({
        ownerType: 'agent',
        ownerId: stage.assigned_agent_id,
        ...agentRunBase,
      });
    }
    // Mark running and remember the run id so the terminal hook can map back.
    q.updatePipelineItemExecStatus.run('running', 'auto', run?.id ?? null, item.last_output, now, item.id);
    if (_logEvent) _logEvent(item.id, 'run_started', { actor: 'system', summary: (stage.assigned_workflow_id ? 'Workflow' : 'Agent') + ' run started', runId: run?.id });
    const updated = mapItem(q.getPipelineItemById.get(item.id));
    emitItem(updated);
    return updated;
  } catch (e) {
    console.error('[PipelineRunner] triggerStageRun failed:', e?.message);
    q.updatePipelineItemExecStatus.run('failed', item.assigned_kind, item.current_run_id, e?.message || 'Run failed', now, item.id);
    if (_logEvent) _logEvent(item.id, 'run_failed', { actor: 'system', summary: e?.message || 'Run failed' });
    emitItem(mapItem(q.getPipelineItemById.get(item.id)));
    return null;
  }
}

/**
 * run-store `onRunTerminal` hook. Maps the finished run back to its pipeline
 * item (by current_run_id) and updates exec_status + last_output. Optionally
 * auto-advances the item to the next stage when configured.
 */
function onRunTerminal(run) {
  // Report runs (Many-generated card reports) are handled by a dedicated
  // module; if this run was one of them, stop here.
  try {
    if (require('./pipeline-report.cjs').handleTerminal(run)) return;
  } catch (e) {
    console.warn('[PipelineRunner] report terminal hook failed:', e?.message);
  }
  const q = queries();
  if (!q || !run?.id) return;
  const item = q.getPipelineItemByRunId.get(run.id);
  if (!item) return;
  const now = Date.now();
  const status = run.status === 'completed' ? 'ready' : 'failed';
  // Prefer the agent's FULL response (outputText) over the short summary, so the
  // card's last_output / report / activity carry the complete answer — the
  // summary alone was hiding most of the agent's output.
  const fullOutput = run.outputText && run.outputText.trim()
    ? run.outputText
    : (run.summary || item.last_output);
  const output = run.status === 'completed'
    ? fullOutput
    : (run.error || item.last_output);
  q.updatePipelineItemExecStatus.run(status, 'auto', run.id, output ?? null, now, item.id);
  if (_logEvent) {
    // Keep `summary` short for the collapsed row; stash the full markdown
    // output in `detail.output` so the Activity tab can render it in full.
    _logEvent(item.id, status === 'ready' ? 'run_completed' : 'run_failed', {
      actor: 'system',
      summary: (output || '').slice(0, 140),
      detail: output ? { output } : undefined,
      runId: run.id,
    });
  }

  if (status === 'ready') {
    try {
      const stage = q.getPipelineStageById.get(item.stage_id);
      const config = parseJson(stage?.config_json, {});
      if (config && config.advanceOnComplete && !stage.is_terminal) {
        const stages = q.listStagesByPipeline.all(item.pipeline_id);
        const idx = stages.findIndex((s) => s.id === item.stage_id);
        const next = stages[idx + 1];
        if (next) {
          const destCount = q.listItemsByStage.all(next.id).length;
          q.updatePipelineItemStageAndPosition.run(next.id, destCount, now, item.id);
          if (_logEvent) _logEvent(item.id, 'auto_advanced', { actor: 'system', summary: 'Auto-advanced to: ' + (next.title || '') });
          if (next.execution_policy === 'auto_agent') { triggerStageRun(item.id).catch((e) => {
              console.warn('[PipelineRunner] auto-run after advance failed:', e?.message);
            });
          }
        }
      }
    } catch (e) {
      console.warn('[PipelineRunner] auto-advance failed:', e?.message);
    }
  }

  emitItem(mapItem(q.getPipelineItemById.get(item.id)));
}

module.exports = { init, triggerStageRun, onRunTerminal };
