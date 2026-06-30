'use strict';

const crypto = require('crypto');

const { serializeArtifactRecord, parseJsonState } = require('./artifact-serialize.cjs');
const { afterArtifactMutation } = require('./artifact-index-sync.cjs');
const { extractJsonFromOutput, applyUpdatePolicy } = require('../services/artifact-data-merge.cjs');

/**
 * Consume automation bindings and persist model JSON into artifact runtime slots.
 * @param {import('../core/database.cjs')} database
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
    try {
      const fileStorage = require('../storage/file-storage.cjs');
      const vaultStore = require('../storage/vault-store.cjs');
      vaultStore.writeArtifactHtmlMirror({ id: artifactResourceId }, { database, fileStorage });
    } catch (e) {
      console.warn('[artifact-sink] vault mirror failed', e?.message || e);
    }
    afterArtifactMutation(database, artifactResourceId);
  }
}

module.exports = { applyArtifactSinksForCompletedRun };
