'use strict';

/**
 * Parse artifact.state JSON safely.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseJsonState(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ ({ .../** @type {Record<string, unknown>} */ (raw) });
  }
  try {
    const v = JSON.parse(String(raw || '{}'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Merge persisted JSON state + default runtime slot (iframe / automation payload).
 */
function mergeRuntimeIntoState(queries, artifactRow, baseState) {
  const merged = /** @type {Record<string, unknown>} */ ({ ...baseState });
  if (!queries?.getArtifactRuntimeDataByArtifactSlot?.get || !artifactRow?.id) return merged;
  const rt = queries.getArtifactRuntimeDataByArtifactSlot.get(artifactRow.id, 'default');
  if (!rt?.data_json) return merged;
  let runtimeData = {};
  try {
    const parsed = JSON.parse(rt.data_json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      runtimeData = parsed;
    }
  } catch {
    runtimeData = {};
  }
  const prevData =
    merged.data !== undefined &&
    merged.data !== null &&
    typeof merged.data === 'object' &&
    !Array.isArray(merged.data)
      ? /** @type {Record<string, unknown>} */ (merged.data)
      : {};
  merged.data = { ...prevData, ...runtimeData };
  return merged;
}

/**
 * Canonical merged state blob for FTS / indexing.
 */
function getResolvedStateForArtifactRow(queries, artifactRow) {
  const base = parseJsonState(artifactRow?.state ?? '{}');
  return mergeRuntimeIntoState(queries, artifactRow, base);
}

/**
 * Map SQLite rows → renderer ArtifactRecord ({@link ArtifactRecord} in app/types/index.ts`).
 */
function serializeArtifactRecord(artifactRow, resourceRow, queries) {
  if (!artifactRow || !resourceRow) return null;
  const state = queries ? mergeRuntimeIntoState(queries, artifactRow, parseJsonState(artifactRow.state)) : parseJsonState(artifactRow.state);
  return {
    id: artifactRow.id,
    resourceId: artifactRow.resource_id,
    artifactType: artifactRow.artifact_type,
    template: artifactRow.template ?? null,
    state,
    linkedResourceId: artifactRow.linked_resource_id ?? null,
    version: Number(artifactRow.version ?? 0),
    title: resourceRow.title ?? 'Untitled',
    projectId: resourceRow.project_id ?? 'default',
    createdAt: artifactRow.created_at,
    updatedAt: artifactRow.updated_at,
  };
}

module.exports = {
  parseJsonState,
  getResolvedStateForArtifactRow,
  serializeArtifactRecord,
};
