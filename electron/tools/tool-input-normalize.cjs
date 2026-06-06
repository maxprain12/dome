'use strict';

/** Tools that accept resource_id and can fall back to the active tab resource. */
const ARTIFACT_RESOURCE_ID_TOOLS = new Set([
  'artifact_update_state',
  'artifact_get',
  'artifact_merge_data',
  'artifact_delete',
]);

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function tryParseJsonObject(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * Normalize model tool kwargs before dispatch (inject context, coerce JSON strings).
 * @param {string} toolName
 * @param {Record<string, unknown>} input
 * @param {{ runtimeContext?: { activeResourceId?: string | null } } | null | undefined} toolContext
 * @returns {Record<string, unknown>}
 */
function normalizeToolInput(toolName, input, toolContext) {
  const out =
    input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};

  const activeId = toolContext?.runtimeContext?.activeResourceId;
  if (activeId && typeof activeId === 'string') {
    if (ARTIFACT_RESOURCE_ID_TOOLS.has(toolName) && !out.resource_id && !out.resourceId) {
      out.resource_id = activeId;
    }
    if (toolName === 'artifact_link_resource' && !out.artifact_resource_id && !out.artifactResourceId) {
      out.artifact_resource_id = activeId;
    }
  }

  if (out.resourceId && !out.resource_id) out.resource_id = out.resourceId;
  if (out.artifactResourceId && !out.artifact_resource_id) {
    out.artifact_resource_id = out.artifactResourceId;
  }
  if (out.dataPatch && !out.data_patch) out.data_patch = out.dataPatch;

  if (out.data !== undefined) out.data = tryParseJsonObject(out.data);
  if (out.data_patch !== undefined) out.data_patch = tryParseJsonObject(out.data_patch);
  if (out.state !== undefined) out.state = tryParseJsonObject(out.state);

  if (toolName === 'task') {
    if (!out.description && out.task) out.description = String(out.task);
    if (!out.subagent_type) {
      out.subagent_type =
        out.subagentType || out.name || (typeof out.agent === 'string' ? out.agent : 'general-purpose');
    }
  }

  return out;
}

/**
 * @param {Record<string, unknown> | undefined} parameters OpenAI-style parameters object
 * @param {Record<string, unknown>} input
 * @returns {string[]}
 */
function getMissingRequiredFields(parameters, input) {
  const required = parameters?.required;
  if (!Array.isArray(required) || required.length === 0) return [];
  return required.filter((key) => {
    const v = input[key];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}

/**
 * @param {string} toolName
 * @param {string[]} missing
 * @returns {string}
 */
function formatToolValidationError(toolName, missing) {
  const hints = [];
  if (missing.includes('resource_id') && ARTIFACT_RESOURCE_ID_TOOLS.has(toolName)) {
    hints.push(
      'Include resource_id from artifact_create/artifact_list, or open the artifact tab so activeResourceId is available.',
    );
  }
  if (missing.includes('artifact_resource_id') && toolName === 'artifact_link_resource') {
    hints.push('Include artifact_resource_id or open the artifact tab.');
  }
  const hintText = hints.length ? ` ${hints.join(' ')}` : '';
  return `Missing required parameter(s): ${missing.join(', ')}.${hintText}`;
}

module.exports = {
  ARTIFACT_RESOURCE_ID_TOOLS,
  normalizeToolInput,
  getMissingRequiredFields,
  formatToolValidationError,
  tryParseJsonObject,
};
