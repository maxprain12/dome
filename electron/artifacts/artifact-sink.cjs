'use strict';

const crypto = require('crypto');

const { serializeArtifactRecord, parseJsonState } = require('./artifact-serialize.cjs');
const { afterArtifactMutation } = require('./artifact-index-sync.cjs');
const { extractJsonFromOutput, applyUpdatePolicy } = require('../services/artifact-data-merge.cjs');

function isRecordObject(value) {
  return value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function writeArtifactVaultMirror(database, artifactResourceId) {
  try {
    const fileStorage = require('../storage/file-storage.cjs');
    const vaultStore = require('../storage/vault-store.cjs');
    vaultStore.writeArtifactHtmlMirror({ id: artifactResourceId }, { database, fileStorage });
  } catch (e) {
    console.warn('[artifact-sink] vault mirror failed', e?.message || e);
  }
}

/**
 * Apply a single automation binding row to the artifact runtime.
 * @param {import('../core/database.cjs')} database
 * @param {Record<string, any>} binding
 * @param {string} outputText
 * @param {{ runId?: string|null, automationId?: string|null }} opts
 * @param {{ broadcast?: Function }|null|undefined} windowManager
 * @param {number} now
 */
function applyArtifactSinkForBinding(database, binding, outputText, opts, windowManager, now) {
  if (!binding || binding.enabled === 0) return;
  const artifactResourceId = binding.artifact_resource_id;
  const slot = binding.slot || 'default';
  const policy = binding.update_policy || 'replace';
  const mode = binding.extract_mode || 'json_fence';

  const queries = database.getQueries();
  const art = queries.getArtifactByResourceId.get(artifactResourceId);
  if (!art) return;

  const extracted = extractJsonFromOutput(outputText, mode);
  if (extracted == null) return;

  const parsedState = parseJsonState(art.state);
  const prevData = isRecordObject(parsedState.data)
    ? /** @type {Record<string, unknown>} */ (parsedState.data)
    : {};
  const nextData = applyUpdatePolicy(prevData, extracted, policy);
  const newState = { ...parsedState, data: nextData };

  try {
    queries.updateArtifactState.run(JSON.stringify(newState), now, artifactResourceId);
  } catch (e) {
    console.warn('[artifact-sink] updateArtifactState', e?.message || e);
    return;
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
  writeArtifactVaultMirror(database, artifactResourceId);
  afterArtifactMutation(database, artifactResourceId);
}

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
    applyArtifactSinkForBinding(database, row, outputText, opts, windowManager, now);
  }
}

module.exports = { applyArtifactSinksForCompletedRun };
