'use strict';

/* eslint-disable no-console */

const crypto = require('crypto');

const { serializeArtifactRecord, parseJsonState } = require('./artifact-serialize.cjs');
const { afterArtifactMutation } = require('./artifact-index-sync.cjs');

function extractJsonFromOutput(outputText, mode) {
  const text = String(outputText || '').trim();
  if (!text) return null;
  if (mode === 'full_output') {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  const re = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = text.match(re);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

function applyUpdatePolicy(current, incoming, policy) {
  if (incoming == null) return current;
  if (policy === 'replace') return incoming;
  if (policy === 'append_array') {
    const cur = Array.isArray(current) ? current : [];
    const inc = Array.isArray(incoming) ? incoming : [incoming];
    return cur.concat(inc);
  }
  const curObj = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const incObj = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  if (policy === 'merge_shallow') {
    return { ...curObj, ...incObj };
  }
  // merge_deep — single-level recursive merge on object children
  if (policy === 'merge_deep') {
    /** @type {Record<string, unknown>} */
    const out = { ...curObj };
    for (const [k, v] of Object.entries(incObj)) {
      const a = out[k];
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        a &&
        typeof a === 'object' &&
        !Array.isArray(a)
      ) {
        out[k] = { .../** @type {Record<string, unknown>} */ (a), .../** @type {Record<string, unknown>} */ (v) };
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return incObj;
}

/**
 * Consume automation bindings and persist model JSON into artifact runtime slots.
 * @param {import('./database.cjs')} database
 * @param {{ broadcast?: Function }} windowManager
 * @param {{ automationId?: string|null, runId?: string|null, outputText?: string|null }} opts
 */
function applyArtifactSinksForCompletedRun(database, windowManager, opts) {
  if (!database || !opts?.automationId) return;
  const outputText = typeof opts.outputText === 'string' ? opts.outputText : '';
  if (!outputText.trim()) return;

  const queries = database.getQueries();
  const bindings = queries.listAutomationArtifactBindings.all(opts.automationId);
  const now = Date.now();

  for (const row of bindings) {
    if (!row || row.enabled === 0) continue;
    const artifactResourceId = row.artifact_resource_id;
    const slot = row.slot || 'default';
    const policy = row.update_policy || 'replace';
    const mode = row.extract_mode || 'json_fence';

    const art = queries.getArtifactByResourceId.get(artifactResourceId);
    if (!art) continue;

    const extracted = extractJsonFromOutput(outputText, mode);
    if (extracted == null) continue;

    let state = parseJsonState(art.state);
    const prevData =
      state.data !== undefined && state.data !== null && typeof state.data === 'object' && !Array.isArray(state.data)
        ? /** @type {Record<string, unknown>} */ (state.data)
        : {};
    const nextData = applyUpdatePolicy(prevData, extracted, policy);
    state = { ...state, data: nextData };

    try {
      queries.updateArtifactState.run(JSON.stringify(state), now, artifactResourceId);
    } catch (e) {
      console.warn('[artifact-sink] updateArtifactState', e?.message || e);
      continue;
    }

    const rtExisting = queries.getArtifactRuntimeDataByArtifactSlot.get(art.id, slot);
    const rtId = rtExisting?.id || crypto.randomUUID();
    queries.upsertArtifactRuntimeData.run(
      rtId,
      art.id,
      slot,
      JSON.stringify(nextData),
      rtExisting?.schema_version ?? 1,
      opts.runId ?? null,
      opts.automationId ?? null,
      now,
    );

    const resource = queries.getResourceById.get(artifactResourceId);
    const updatedArt = queries.getArtifactByResourceId.get(artifactResourceId);
    const serialized = serializeArtifactRecord(updatedArt, resource, queries);
    if (serialized && windowManager?.broadcast) {
      windowManager.broadcast('artifact:updated', serialized);
    }
    afterArtifactMutation(database, artifactResourceId);
  }
}

module.exports = { applyArtifactSinksForCompletedRun };
