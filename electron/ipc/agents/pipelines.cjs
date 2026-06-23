/* eslint-disable no-console */

/**
 * Pipelines IPC — CRUD for the unified Kanban model (migration 52).
 *
 * Tables: pipelines, pipeline_stages, pipeline_items, pipeline_sources.
 * Execution wiring (auto_agent runs, source sync, calendar mirror) is layered
 * on top in later phases via electron/agents/pipeline-runner.cjs; this module
 * owns the data layer and broadcasts `pipelines:*` events for the renderer.
 */

const crypto = require('crypto');
const fs = require('fs');
const { dialog } = require('electron');
const pipelineRunner = require('../../agents/pipeline-runner.cjs');
const pipelineCalendarSync = require('../../agents/pipeline-calendar-sync.cjs');
const pipelineSourceSync = require('../../agents/pipeline-source-sync.cjs');
const pipelineEventLog = require('../../agents/pipeline-event-log.cjs');

function generateId() {
  return crypto.randomUUID();
}

function nowMs() {
  return Date.now();
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/* ----------------------------- row mappers ------------------------------ */

function mapPipeline(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? null,
    iconIndex: row.icon_index ?? 0,
    color: row.color ?? null,
    folderId: row.folder_id ?? null,
    archived: !!row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStage(row) {
  if (!row) return null;
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    title: row.title,
    position: row.position ?? 0,
    executionPolicy: row.execution_policy,
    assignedAgentId: row.assigned_agent_id ?? null,
    assignedWorkflowId: row.assigned_workflow_id ?? null,
    runInputTemplate: row.run_input_template ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    isTerminal: !!row.is_terminal,
    wipLimit: row.wip_limit ?? null,
    config: parseJson(row.config_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

function mapSource(row) {
  if (!row) return null;
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    name: row.name,
    sourceType: row.source_type,
    config: parseJson(row.config_json, null),
    targetStageId: row.target_stage_id ?? null,
    enabled: !!row.enabled,
    lastSyncAt: row.last_sync_at ?? null,
    lastSyncStatus: row.last_sync_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* --------------------------- position helpers --------------------------- */

/** Rewrite positions of every item in a stage to a dense 0..n-1 sequence. */
function renumberStage(queries, stageId, now) {
  const items = queries.listItemsByStage.all(stageId);
  items.forEach((row, idx) => {
    if (row.position !== idx) {
      queries.updatePipelineItemStageAndPosition.run(row.stage_id, idx, now, row.id);
    }
  });
}

function register({ ipcMain, windowManager, database, validateSender }) {
  const ensure = (event) => {
    if (typeof validateSender === 'function') {
      validateSender(event, windowManager);
    } else if (!windowManager.isAuthorized(event.sender.id)) {
      throw new Error('Unauthorized');
    }
  };

  const emit = (channel, payload) => {
    try {
      windowManager.broadcast(channel, payload);
    } catch (e) {
      console.warn('[Pipelines] broadcast failed:', channel, e?.message);
    }
  };

  /* ------------------------------ pipelines ----------------------------- */

  ipcMain.handle('pipelines:list', (event, projectId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const rows = queries.listPipelinesByProject.all(projectId || 'default');
      return { success: true, data: rows.map(mapPipeline) };
    } catch (error) {
      console.error('[Pipelines] list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:get', (event, pipelineId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const pipeline = mapPipeline(queries.getPipelineById.get(pipelineId));
      if (!pipeline) return { success: false, error: 'Pipeline not found' };
      const stages = queries.listStagesByPipeline.all(pipelineId).map(mapStage);
      const items = queries.listItemsByPipeline.all(pipelineId).map(mapItem);
      const sources = queries.listSourcesByPipeline.all(pipelineId).map(mapSource);
      return { success: true, data: { pipeline, stages, items, sources } };
    } catch (error) {
      console.error('[Pipelines] get error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:create', (event, input) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const now = nowMs();
      const id = generateId();
      const projectId = input?.projectId || 'default';
      queries.createPipeline.run(
        id,
        projectId,
        input?.name || 'Untitled pipeline',
        input?.description ?? null,
        Number.isInteger(input?.iconIndex) ? input.iconIndex : 0,
        input?.color ?? null,
        input?.folderId ?? null,
        0,
        now,
        now,
      );
      const data = mapPipeline(queries.getPipelineById.get(id));
      emit('pipelines:updated', { pipeline: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] create error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:update', (event, { id, ...fields }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const existing = queries.getPipelineById.get(id);
      if (!existing) return { success: false, error: 'Pipeline not found' };
      const now = nowMs();
      queries.updatePipeline.run(
        fields.name ?? existing.name,
        fields.description ?? existing.description,
        Number.isInteger(fields.iconIndex) ? fields.iconIndex : existing.icon_index,
        fields.color ?? existing.color,
        fields.folderId ?? existing.folder_id,
        fields.archived != null ? (fields.archived ? 1 : 0) : existing.archived,
        now,
        id,
      );
      const data = mapPipeline(queries.getPipelineById.get(id));
      emit('pipelines:updated', { pipeline: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] update error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:delete', (event, pipelineId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      queries.deletePipeline.run(pipelineId);
      emit('pipelines:updated', { deletedId: pipelineId });
      return { success: true };
    } catch (error) {
      console.error('[Pipelines] delete error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Export a pipeline's definition (meta + stages + sources) to a JSON file.
   * Runtime cards (items), run ids and calendar links are intentionally not
   * exported — the bundle is a reusable pipeline template. Stages carry a
   * private `_exportId` so sources can remap `targetStageId` on import.
   */
  ipcMain.handle('pipelines:export', async (event, pipelineId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const pipeline = queries.getPipelineById.get(pipelineId);
      if (!pipeline) return { success: false, error: 'Pipeline not found' };
      const stages = queries.listStagesByPipeline.all(pipelineId).map(mapStage);
      const sources = queries.listSourcesByPipeline.all(pipelineId).map(mapSource);

      const bundle = {
        version: 1,
        kind: 'dome-pipeline',
        exportedAt: new Date().toISOString(),
        pipeline: {
          name: pipeline.name,
          description: pipeline.description ?? null,
          iconIndex: pipeline.icon_index ?? 0,
          color: pipeline.color ?? null,
        },
        stages: stages.map((s) => ({
          _exportId: s.id,
          title: s.title,
          position: s.position,
          executionPolicy: s.executionPolicy,
          assignedAgentId: s.assignedAgentId,
          assignedWorkflowId: s.assignedWorkflowId,
          runInputTemplate: s.runInputTemplate,
          provider: s.provider,
          model: s.model,
          isTerminal: s.isTerminal,
          wipLimit: s.wipLimit,
          config: s.config,
        })),
        sources: sources.map((src) => ({
          name: src.name,
          sourceType: src.sourceType,
          config: src.config,
          targetStageId: src.targetStageId,
          enabled: src.enabled,
        })),
      };

      const result = await dialog.showSaveDialog({
        defaultPath: `${(pipeline.name || 'pipeline').replace(/[\\/:*?"<>|]/g, '_')}.dome-pipeline.json`,
        filters: [{ name: 'Dome Pipeline', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { success: true, data: { cancelled: true } };
      fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf8');
      return { success: true, data: { filePath: result.filePath } };
    } catch (error) {
      console.error('[Pipelines] export error:', error);
      return { success: false, error: error.message };
    }
  });

  /** Import a pipeline bundle from a JSON file into the given project. */
  ipcMain.handle('pipelines:import', async (event, projectId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const db = database.getDB();

      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Dome Pipeline', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return { success: true, data: { cancelled: true } };

      const bundle = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      if (!bundle || bundle.kind !== 'dome-pipeline' || !bundle.pipeline) {
        return { success: false, error: 'Invalid pipeline bundle' };
      }

      const pid = projectId || 'default';
      const now = nowMs();
      const newPipelineId = generateId();
      const stageIdMap = new Map();

      const tx = db.transaction(() => {
        queries.createPipeline.run(
          newPipelineId,
          pid,
          bundle.pipeline.name || 'Imported pipeline',
          bundle.pipeline.description ?? null,
          Number.isInteger(bundle.pipeline.iconIndex) ? bundle.pipeline.iconIndex : 0,
          bundle.pipeline.color ?? null,
          null,
          0,
          now,
          now,
        );

        const stages = Array.isArray(bundle.stages) ? bundle.stages : [];
        stages.forEach((s, idx) => {
          const newStageId = generateId();
          if (s._exportId) stageIdMap.set(s._exportId, newStageId);
          queries.createPipelineStage.run(
            newStageId,
            newPipelineId,
            pid,
            s.title || 'Stage',
            Number.isInteger(s.position) ? s.position : idx,
            s.executionPolicy || 'manual_resolve',
            s.assignedAgentId ?? null,
            s.assignedWorkflowId ?? null,
            s.runInputTemplate ?? null,
            s.provider ?? null,
            s.model ?? null,
            s.isTerminal ? 1 : 0,
            Number.isInteger(s.wipLimit) ? s.wipLimit : null,
            stringifyJson(s.config),
            now,
            now,
          );
        });

        const sources = Array.isArray(bundle.sources) ? bundle.sources : [];
        sources.forEach((src) => {
          queries.createPipelineSource.run(
            generateId(),
            newPipelineId,
            pid,
            src.name || 'Source',
            src.sourceType || 'manual',
            stringifyJson(src.config),
            src.targetStageId ? (stageIdMap.get(src.targetStageId) ?? null) : null,
            src.enabled === false ? 0 : 1,
            null,
            null,
            now,
            now,
          );
        });
      });
      tx();

      const data = mapPipeline(queries.getPipelineById.get(newPipelineId));
      emit('pipelines:updated', { pipeline: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] import error:', error);
      return { success: false, error: error.message };
    }
  });

  /* -------------------------------- stages ------------------------------ */

  ipcMain.handle('pipelines:stages:list', (event, pipelineId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      return { success: true, data: queries.listStagesByPipeline.all(pipelineId).map(mapStage) };
    } catch (error) {
      console.error('[Pipelines] stages:list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:stages:create', (event, input) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const pipeline = queries.getPipelineById.get(input?.pipelineId);
      if (!pipeline) return { success: false, error: 'Pipeline not found' };
      const now = nowMs();
      const id = generateId();
      const existing = queries.listStagesByPipeline.all(input.pipelineId);
      const position = Number.isInteger(input?.position) ? input.position : existing.length;
      queries.createPipelineStage.run(
        id,
        input.pipelineId,
        pipeline.project_id,
        input?.title || 'Nueva fase',
        position,
        input?.executionPolicy || 'manual_resolve',
        input?.assignedAgentId ?? null,
        input?.assignedWorkflowId ?? null,
        input?.runInputTemplate ?? null,
        input?.provider ?? null,
        input?.model ?? null,
        input?.isTerminal ? 1 : 0,
        Number.isInteger(input?.wipLimit) ? input.wipLimit : null,
        stringifyJson(input?.config),
        now,
        now,
      );
      const data = mapStage(queries.getPipelineStageById.get(id));
      emit('pipelines:stage:updated', { stage: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] stages:create error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:stages:update', (event, { id, ...fields }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const existing = queries.getPipelineStageById.get(id);
      if (!existing) return { success: false, error: 'Stage not found' };
      const now = nowMs();
      queries.updatePipelineStage.run(
        fields.title ?? existing.title,
        Number.isInteger(fields.position) ? fields.position : existing.position,
        fields.executionPolicy ?? existing.execution_policy,
        fields.assignedAgentId !== undefined ? fields.assignedAgentId : existing.assigned_agent_id,
        fields.assignedWorkflowId !== undefined ? fields.assignedWorkflowId : existing.assigned_workflow_id,
        fields.runInputTemplate !== undefined ? fields.runInputTemplate : existing.run_input_template,
        fields.provider !== undefined ? fields.provider : existing.provider,
        fields.model !== undefined ? fields.model : existing.model,
        fields.isTerminal != null ? (fields.isTerminal ? 1 : 0) : existing.is_terminal,
        fields.wipLimit !== undefined ? fields.wipLimit : existing.wip_limit,
        fields.config !== undefined ? stringifyJson(fields.config) : existing.config_json,
        now,
        id,
      );
      const data = mapStage(queries.getPipelineStageById.get(id));
      emit('pipelines:stage:updated', { stage: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] stages:update error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:stages:reorder', (event, { pipelineId, orderedStageIds }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const db = database.getDB();
      const now = nowMs();
      const ids = Array.isArray(orderedStageIds) ? orderedStageIds : [];
      const tx = db.transaction(() => {
        ids.forEach((stageId, idx) => {
          queries.updatePipelineStagePosition.run(idx, now, stageId);
        });
      });
      tx();
      const data = queries.listStagesByPipeline.all(pipelineId).map(mapStage);
      emit('pipelines:stage:updated', { pipelineId, reordered: true });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] stages:reorder error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:stages:delete', (event, stageId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const stage = queries.getPipelineStageById.get(stageId);
      queries.deletePipelineStage.run(stageId);
      emit('pipelines:stage:updated', { deletedId: stageId, pipelineId: stage?.pipeline_id });
      return { success: true };
    } catch (error) {
      console.error('[Pipelines] stages:delete error:', error);
      return { success: false, error: error.message };
    }
  });

  /* -------------------------------- items ------------------------------- */

  ipcMain.handle('pipelines:items:list', (event, { pipelineId }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      return { success: true, data: queries.listItemsByPipeline.all(pipelineId).map(mapItem) };
    } catch (error) {
      console.error('[Pipelines] items:list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:create', async (event, input) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const pipeline = queries.getPipelineById.get(input?.pipelineId);
      if (!pipeline) return { success: false, error: 'Pipeline not found' };
      const stage = queries.getPipelineStageById.get(input?.stageId);
      if (!stage) return { success: false, error: 'Stage not found' };
      const now = nowMs();
      const id = generateId();
      const existing = queries.listItemsByStage.all(input.stageId);
      queries.createPipelineItem.run(
        id,
        input.pipelineId,
        pipeline.project_id,
        input.stageId,
        input?.sourceId ?? null,
        input?.title || 'Nueva tarjeta',
        existing.length,
        stringifyJson(input?.data),
        'pending',
        input?.assignedKind || 'unassigned',
        input?.assignedAgentId ?? null,
        null,
        null,
        Number.isInteger(input?.startAt) ? input.startAt : null,
        Number.isInteger(input?.endAt) ? input.endAt : null,
        null,
        stringifyJson(input?.metadata),
        now,
        now,
      );
      await pipelineCalendarSync.syncItemCalendar(queries.getPipelineItemById.get(id));
      const data = mapItem(queries.getPipelineItemById.get(id));
      emit('pipelines:item:updated', { item: data });
      pipelineEventLog.logEvent(id, 'card_created', { actor: 'user', summary: 'Card created: ' + (input?.title || 'Nueva tarjeta') });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] items:create error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:update', async (event, { id, ...fields }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const existing = queries.getPipelineItemById.get(id);
      if (!existing) return { success: false, error: 'Item not found' };
      const now = nowMs();
      queries.updatePipelineItem.run(
        fields.stageId ?? existing.stage_id,
        fields.sourceId !== undefined ? fields.sourceId : existing.source_id,
        fields.title ?? existing.title,
        Number.isInteger(fields.position) ? fields.position : existing.position,
        fields.data !== undefined ? stringifyJson(fields.data) : existing.data_json,
        fields.execStatus ?? existing.exec_status,
        fields.assignedKind ?? existing.assigned_kind,
        fields.assignedAgentId !== undefined ? fields.assignedAgentId : existing.assigned_agent_id,
        fields.currentRunId !== undefined ? fields.currentRunId : existing.current_run_id,
        fields.lastOutput !== undefined ? fields.lastOutput : existing.last_output,
        fields.startAt !== undefined ? fields.startAt : existing.start_at,
        fields.endAt !== undefined ? fields.endAt : existing.end_at,
        fields.calendarEventId !== undefined ? fields.calendarEventId : existing.calendar_event_id,
        fields.metadata !== undefined ? stringifyJson(fields.metadata) : existing.metadata_json,
        now,
        id,
      );
      // Reconcile the mirrored calendar event when dates/title changed.
      if (fields.startAt !== undefined || fields.endAt !== undefined || fields.title !== undefined) {
        await pipelineCalendarSync.syncItemCalendar(queries.getPipelineItemById.get(id));
      }
      const data = mapItem(queries.getPipelineItemById.get(id));
      emit('pipelines:item:updated', { item: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] items:update error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:move', (event, { id, toStageId, toPosition }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const db = database.getDB();
      const item = queries.getPipelineItemById.get(id);
      if (!item) return { success: false, error: 'Item not found' };
      const targetStage = queries.getPipelineStageById.get(toStageId);
      if (!targetStage) return { success: false, error: 'Target stage not found' };
      const fromStageId = item.stage_id;
      const now = nowMs();

      const tx = db.transaction(() => {
        // Build the destination order: existing items (minus the moved one) with
        // the moved item spliced in at toPosition.
        const dest = queries.listItemsByStage.all(toStageId).filter((r) => r.id !== id);
        const insertAt = Number.isInteger(toPosition)
          ? Math.max(0, Math.min(toPosition, dest.length))
          : dest.length;
        dest.splice(insertAt, 0, { id });
        dest.forEach((r, idx) => {
          queries.updatePipelineItemStageAndPosition.run(toStageId, idx, now, r.id);
        });
        if (fromStageId !== toStageId) {
          renumberStage(queries, fromStageId, now);
        }
      });
      tx();

      const data = mapItem(queries.getPipelineItemById.get(id));
      emit('pipelines:item:updated', { item: data, movedFrom: fromStageId });
      if (fromStageId !== toStageId) {
        pipelineEventLog.logEvent(id, 'card_moved', { actor: 'user', summary: 'Moved to: ' + (targetStage.title || '') });
      }

      // If the destination stage auto-runs an agent, fire it (fire-and-forget;
      // the runner broadcasts its own pipelines:item:updated as status changes).
      if (targetStage.execution_policy === 'auto_agent' && fromStageId !== toStageId) {
        void pipelineRunner.triggerStageRun(id).catch((e) => {
          console.warn('[Pipelines] auto-run trigger failed:', e?.message);
        });
      }
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] items:move error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:run', async (event, { id }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const item = queries.getPipelineItemById.get(id);
      if (!item) return { success: false, error: 'Item not found' };
      const updated = await pipelineRunner.triggerStageRun(id, { force: true });
      return { success: true, data: updated ?? mapItem(item) };
    } catch (error) {
      console.error('[Pipelines] items:run error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:get', (event, itemId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const row = queries.getPipelineItemById.get(itemId);
      if (!row) return { success: false, error: 'Item not found' };
      const item = mapItem(row);
      const stage = queries.getPipelineStageById.get(row.stage_id);
      const pipeline = queries.getPipelineById.get(row.pipeline_id);
      return {
        success: true,
        data: { item, stageTitle: stage?.title ?? null, pipelineName: pipeline?.name ?? null },
      };
    } catch (error) {
      console.error('[Pipelines] items:get error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:generateReport', async (event, { id }) => {
    try {
      ensure(event);
      const pipelineReport = require('../../agents/pipeline-report.cjs');
      const res = await pipelineReport.generateReport(id);
      if (!res?.success) return { success: false, error: res?.error || 'Report failed' };
      return { success: true, data: { runId: res.runId } };
    } catch (error) {
      console.error('[Pipelines] items:generateReport error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:resolve', (event, { id }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const item = queries.getPipelineItemById.get(id);
      if (!item) return { success: false, error: 'Item not found' };
      const now = nowMs();
      queries.updatePipelineItemExecStatus.run('ready', 'manual', item.current_run_id, item.last_output, now, id);
      const data = mapItem(queries.getPipelineItemById.get(id));
      emit('pipelines:item:updated', { item: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] items:resolve error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:delete', async (event, itemId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const item = queries.getPipelineItemById.get(itemId);
      if (item) await pipelineCalendarSync.removeItemCalendar(item);
      queries.deletePipelineItem.run(itemId);
      if (item) renumberStage(queries, item.stage_id, nowMs());
      emit('pipelines:item:updated', { deletedId: itemId, stageId: item?.stage_id });
      return { success: true };
    } catch (error) {
      console.error('[Pipelines] items:delete error:', error);
      return { success: false, error: error.message };
    }
  });

  /* ------------------------------- sources ------------------------------ */

  ipcMain.handle('pipelines:sources:list', (event, pipelineId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      return { success: true, data: queries.listSourcesByPipeline.all(pipelineId).map(mapSource) };
    } catch (error) {
      console.error('[Pipelines] sources:list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:sources:create', (event, input) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const pipeline = queries.getPipelineById.get(input?.pipelineId);
      if (!pipeline) return { success: false, error: 'Pipeline not found' };
      const now = nowMs();
      const id = generateId();
      queries.createPipelineSource.run(
        id,
        input.pipelineId,
        pipeline.project_id,
        input?.name || 'Fuente',
        input?.sourceType || 'manual',
        stringifyJson(input?.config),
        input?.targetStageId ?? null,
        input?.enabled === false ? 0 : 1,
        null,
        null,
        now,
        now,
      );
      const data = mapSource(queries.getPipelineSourceById.get(id));
      emit('pipelines:source:updated', { source: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] sources:create error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:sources:update', (event, { id, ...fields }) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const existing = queries.getPipelineSourceById.get(id);
      if (!existing) return { success: false, error: 'Source not found' };
      const now = nowMs();
      queries.updatePipelineSource.run(
        fields.name ?? existing.name,
        fields.sourceType ?? existing.source_type,
        fields.config !== undefined ? stringifyJson(fields.config) : existing.config_json,
        fields.targetStageId !== undefined ? fields.targetStageId : existing.target_stage_id,
        fields.enabled != null ? (fields.enabled ? 1 : 0) : existing.enabled,
        now,
        id,
      );
      const data = mapSource(queries.getPipelineSourceById.get(id));
      emit('pipelines:source:updated', { source: data });
      return { success: true, data };
    } catch (error) {
      console.error('[Pipelines] sources:update error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:sources:delete', (event, sourceId) => {
    try {
      ensure(event);
      const queries = database.getQueries();
      const source = queries.getPipelineSourceById.get(sourceId);
      queries.deletePipelineSource.run(sourceId);
      emit('pipelines:source:updated', { deletedId: sourceId, pipelineId: source?.pipeline_id });
      return { success: true };
    } catch (error) {
      console.error('[Pipelines] sources:delete error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:sources:sync', async (event, sourceId) => {
    try {
      ensure(event);
      const result = await pipelineSourceSync.syncSource(sourceId);
      // Refresh source row (last_sync_at/status updated inside syncSource).
      const queries = database.getQueries();
      emit('pipelines:source:updated', { source: mapSource(queries.getPipelineSourceById.get(sourceId)) });
      return { success: true, data: result };
    } catch (error) {
      console.error('[Pipelines] sources:sync error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:sources:testConnection', (event) => {
    try {
      ensure(event);
      // External DB connectors are not enabled in this build yet.
      return { success: false, error: 'External DB connections are not enabled in this build yet.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // --- item events (activity log) -----------------------------------------

  ipcMain.handle('pipelines:items:listEvents', (event, itemId) => {
    try {
      ensure(event);
      if (typeof itemId !== 'string') return { success: false, error: 'Invalid itemId' };
      const q = database.getQueries();
      const rows = q.listPipelineItemEvents.all(itemId);
      const events = rows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        eventType: r.event_type,
        actor: r.actor,
        summary: r.summary,
        detail: r.detail_json ? parseJson(r.detail_json) : null,
        runId: r.run_id,
        createdAt: r.created_at,
      }));
      return { success: true, data: events };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipelines:items:addEvent', (event, { itemId, eventType, actor, summary, detail, runId }) => {
    try {
      ensure(event);
      if (typeof itemId !== 'string' || typeof eventType !== 'string') return { success: false, error: 'Invalid args' };
      const q = database.getQueries();
      const item = q.getPipelineItemById.get(itemId);
      if (!item) return { success: false, error: 'Item not found' };
      const id = generateId();
      const projectId = item.project_id || 'default';
      q.createPipelineItemEvent.run(
        id, itemId, projectId, eventType,
        actor || null, summary || null,
        detail ? JSON.stringify(detail) : null,
        runId || null, nowMs(),
      );
      return { success: true, data: { id } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
