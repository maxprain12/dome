/* eslint-disable no-console */

const crypto = require('crypto');
const database = require('../core/database.cjs');
const { parseJsonSafely, toJson } = require('./run-store.cjs');

const OUTPUT_MODES = new Set(['chat_only', 'note', 'studio_output', 'mixed']);

function getQueries() {
  return database.getQueries?.();
}

function now() {
  return Date.now();
}

function normalizeAutomationArtifactBindingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    automationId: row.automation_id,
    artifactResourceId: row.artifact_resource_id,
    slot: row.slot || 'default',
    updatePolicy: row.update_policy,
    transformHint: row.transform_hint ?? null,
    extractMode: row.extract_mode || 'json_fence',
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function attachAutomationArtifactBindings(automation) {
  if (!automation) return null;
  const queries = getQueries();
  const rows = queries.listAutomationArtifactBindings.all(automation.id);
  const artifactBindings = rows.map(normalizeAutomationArtifactBindingRow);
  return { ...automation, artifactBindings };
}

function replaceAutomationArtifactBindings(automationId, rawBindings) {
  const queries = getQueries();
  const ts = now();
  queries.deleteAutomationArtifactBindingsByAutomation.run(automationId);
  if (!Array.isArray(rawBindings)) return;
  for (const b of rawBindings) {
    if (!b || !b.artifactResourceId) continue;
    const res = queries.getResourceById.get(String(b.artifactResourceId));
    if (!res || res.type !== 'artifact') continue;
    const policy = ['replace', 'merge_shallow', 'merge_deep', 'append_array'].includes(b.updatePolicy)
      ? b.updatePolicy
      : 'replace';
    const extract = ['json_fence', 'full_output'].includes(b.extractMode) ? b.extractMode : 'json_fence';
    queries.insertAutomationArtifactBinding.run(
      typeof b.id === 'string' && b.id.length >= 32 ? b.id : crypto.randomUUID(),
      automationId,
      String(b.artifactResourceId),
      String(b.slot || 'default'),
      policy,
      b.transformHint != null ? String(b.transformHint) : null,
      extract,
      b.enabled === false ? 0 : 1,
      ts,
      ts,
    );
  }
}

function normalizeAutomationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? 'default',
    title: row.title,
    description: row.description ?? '',
    targetType: row.target_type,
    targetId: row.target_id,
    triggerType: row.trigger_type,
    schedule: parseJsonSafely(row.schedule_json, null),
    inputTemplate: parseJsonSafely(row.input_template_json, null),
    outputMode: row.output_mode,
    enabled: !!row.enabled,
    legacySource: row.legacy_source ?? null,
    lastRunAt: row.last_run_at ?? null,
    lastRunStatus: row.last_run_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAutomationInput(input, existingRow = null) {
  const timestamp = now();
  const projectId =
    input?.projectId ??
    input?.project_id ??
    existingRow?.project_id ??
    'default';
  return {
    id: input.id ?? crypto.randomUUID(),
    projectId: String(projectId || 'default'),
    title: String(input.title || 'Automatización').trim(),
    description: input.description ? String(input.description) : '',
    targetType: ['many', 'agent', 'workflow', 'feeder'].includes(input.targetType) ? input.targetType : 'agent',
    targetId: String(input.targetId || '').trim(),
    triggerType: ['manual', 'schedule', 'contextual'].includes(input.triggerType) ? input.triggerType : 'manual',
    schedule: input.schedule ?? null,
    inputTemplate: input.inputTemplate ?? null,
    outputMode: OUTPUT_MODES.has(input.outputMode) ? input.outputMode : 'chat_only',
    enabled: !!input.enabled,
    legacySource: input.legacySource ? String(input.legacySource) : null,
    lastRunAt: input.lastRunAt ?? null,
    lastRunStatus: input.lastRunStatus ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function upsertAutomation(input) {
  const queries = getQueries();
  const id = input?.id ?? crypto.randomUUID();
  const existing = queries.getAutomationDefinitionById.get(id);
  const normalized = normalizeAutomationInput({ ...input, id }, existing);
  if (existing) {
    const previous = normalizeAutomationRow(existing);
    queries.updateAutomationDefinition.run(
      normalized.projectId,
      normalized.title,
      normalized.description,
      normalized.targetType,
      normalized.targetId,
      normalized.triggerType,
      toJson(normalized.schedule),
      toJson(normalized.inputTemplate),
      normalized.outputMode,
      normalized.enabled ? 1 : 0,
      normalized.legacySource,
      normalized.lastRunAt ?? previous.lastRunAt ?? null,
      normalized.lastRunStatus ?? previous.lastRunStatus ?? null,
      normalized.updatedAt,
      normalized.id,
    );
  } else {
    queries.createAutomationDefinition.run(
      normalized.id,
      normalized.projectId,
      normalized.title,
      normalized.description,
      normalized.targetType,
      normalized.targetId,
      normalized.triggerType,
      toJson(normalized.schedule),
      toJson(normalized.inputTemplate),
      normalized.outputMode,
      normalized.enabled ? 1 : 0,
      normalized.legacySource,
      normalized.lastRunAt,
      normalized.lastRunStatus,
      normalized.createdAt,
      normalized.updatedAt,
    );
  }
  if (input.artifactBindings !== undefined) {
    replaceAutomationArtifactBindings(normalized.id, input.artifactBindings);
  }
  return attachAutomationArtifactBindings(normalizeAutomationRow(queries.getAutomationDefinitionById.get(normalized.id)));
}

module.exports = {
  upsertAutomation,
  normalizeAutomationRow,
  attachAutomationArtifactBindings,
};
