/* eslint-disable no-console */

/**
 * Pipeline service — shared main-process operations for pipelines, reused by
 * the Many agent tools (tool-dispatcher) and available to other callers. Keeps
 * the data logic in one place; UI/IPC broadcasting is handled by the caller
 * (or by pipeline-runner for run-related transitions).
 */

const crypto = require('crypto');
const database = require('../core/database.cjs');
const pipelineRunner = require('./pipeline-runner.cjs');
const pipelineCalendarSync = require('./pipeline-calendar-sync.cjs');

function q() {
  return database.getQueries();
}

function nowMs() {
  return Date.now();
}

function parseJson(v, fb = null) {
  if (v == null || v === '') return fb;
  try {
    return JSON.parse(v);
  } catch {
    return fb;
  }
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    stageId: row.stage_id,
    title: row.title,
    execStatus: row.exec_status,
    assignedKind: row.assigned_kind,
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
    data: parseJson(row.data_json, null),
  };
}

function mapStage(row) {
  if (!row) return null;
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    title: row.title,
    position: row.position,
    executionPolicy: row.execution_policy,
    assignedAgentId: row.assigned_agent_id ?? null,
    isTerminal: !!row.is_terminal,
  };
}

function listPipelines(projectId = 'default') {
  return q().listPipelinesByProject.all(projectId).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
  }));
}

function getPipeline(pipelineId) {
  const queries = q();
  const pipeline = queries.getPipelineById.get(pipelineId);
  if (!pipeline) return null;
  return {
    id: pipeline.id,
    name: pipeline.name,
    stages: queries.listStagesByPipeline.all(pipelineId).map(mapStage),
    items: queries.listItemsByPipeline.all(pipelineId).map(mapItem),
  };
}

async function createCard({ pipelineId, stageId, title, data, startAt, endAt }) {
  const queries = q();
  const pipeline = queries.getPipelineById.get(pipelineId);
  if (!pipeline) throw new Error('Pipeline not found');
  // Default to the first stage when not provided.
  const stage = stageId
    ? queries.getPipelineStageById.get(stageId)
    : queries.listStagesByPipeline.all(pipelineId)[0];
  if (!stage) throw new Error('Stage not found (pipeline has no stages)');
  const now = nowMs();
  const id = crypto.randomUUID();
  const count = queries.listItemsByStage.all(stage.id).length;
  queries.createPipelineItem.run(
    id, pipelineId, pipeline.project_id, stage.id, null,
    title || 'Nueva tarjeta', count,
    data != null ? JSON.stringify(data) : null,
    'pending', 'unassigned', null, null, null,
    Number.isInteger(startAt) ? startAt : null,
    Number.isInteger(endAt) ? endAt : null,
    null, null, now, now,
  );
  await pipelineCalendarSync.syncItemCalendar(queries.getPipelineItemById.get(id));
  return mapItem(queries.getPipelineItemById.get(id));
}

async function moveCard({ itemId, toStageId }) {
  const queries = q();
  const item = queries.getPipelineItemById.get(itemId);
  if (!item) throw new Error('Item not found');
  const targetStage = queries.getPipelineStageById.get(toStageId);
  if (!targetStage) throw new Error('Target stage not found');
  const now = nowMs();
  const count = queries.listItemsByStage.all(toStageId).filter((r) => r.id !== itemId).length;
  queries.updatePipelineItemStageAndPosition.run(toStageId, count, now, itemId);
  if (targetStage.execution_policy === 'auto_agent' && item.stage_id !== toStageId) {
    await pipelineRunner.triggerStageRun(itemId).catch(() => {});
  }
  return mapItem(queries.getPipelineItemById.get(itemId));
}

async function runCard({ itemId }) {
  const updated = await pipelineRunner.triggerStageRun(itemId, { force: true });
  if (!updated) {
    const item = q().getPipelineItemById.get(itemId);
    if (!item) throw new Error('Item not found');
    return mapItem(item);
  }
  return updated;
}

function addStage({ pipelineId, title, executionPolicy, assignedAgentId }) {
  const queries = q();
  const pipeline = queries.getPipelineById.get(pipelineId);
  if (!pipeline) throw new Error('Pipeline not found');
  const now = nowMs();
  const id = crypto.randomUUID();
  const position = queries.listStagesByPipeline.all(pipelineId).length;
  queries.createPipelineStage.run(
    id, pipelineId, pipeline.project_id, title || 'Nueva fase', position,
    executionPolicy || 'manual_resolve', assignedAgentId ?? null, null, null,
    null, null, 0, null, null, now, now,
  );
  return mapStage(queries.getPipelineStageById.get(id));
}

module.exports = { listPipelines, getPipeline, createCard, moveCard, runCard, addStage };
