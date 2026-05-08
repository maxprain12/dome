'use strict';

/* eslint-disable no-console */

const { serializeArtifactRecord, parseJsonState } = require('./artifact-serialize.cjs');
const { afterArtifactMutation } = require('./artifact-index-sync.cjs');

/** @type {null | ((resourceId: string, opts?: Record<string, unknown>) => Promise<unknown>)} */
let _excelGet = null;

function setExcelGet(fn) {
  _excelGet = fn;
}

function isExcelLinkedResource(resource) {
  if (!resource) return false;
  const mime = String(resource.file_mime_type || '');
  const fname = String(resource.original_filename || resource.title || '').toLowerCase();
  return (
    resource.type === 'excel' ||
    resource.type === 'document' ||
    mime.includes('spreadsheetml') ||
    mime.includes('ms-excel') ||
    fname.endsWith('.xlsx') ||
    fname.endsWith('.xls') ||
    fname.endsWith('.csv')
  );
}

/**
 * Snapshot the linked workbook into every artifact pointing at linkedResourceId.
 */
async function syncLinkedArtifactsForResource(database, windowManager, linkedResourceId) {
  if (!database || !linkedResourceId) return;
  const queries = database.getQueries();

  const linkedRes = queries.getResourceById.get(linkedResourceId);
  if (!linkedRes || !isExcelLinkedResource(linkedRes)) return;

  if (!_excelGet || typeof _excelGet !== 'function') {
    console.warn('[artifact-link-sync] excel_get stub — link sync skipped');
    return;
  }

  /** @type {{ success?: boolean } & Record<string, unknown>} */
  const xl = await _excelGet(linkedResourceId, {});
  if (!xl || xl.success !== true) return;

  const linkedData = {
    resource_id: linkedResourceId,
    title: xl.title,
    sheet_names: xl.sheet_names,
    sheet_name: xl.sheet_name,
    data: Array.isArray(xl.data) ? xl.data : [],
    synced_at: Date.now(),
  };

  const rows = queries.getArtifactsLinkedToResource.all(linkedResourceId);
  const now = Date.now();

  for (const art of rows) {
    try {
      const rid = art.resource_id;
      const state = parseJsonState(art.state);
      state.linkedData = linkedData;
      queries.updateArtifactState.run(JSON.stringify(state), now, rid);
      const resource = queries.getResourceById.get(rid);
      const updated = queries.getArtifactByResourceId.get(rid);
      const serialized = serializeArtifactRecord(updated, resource, queries);
      if (serialized && windowManager?.broadcast) {
        windowManager.broadcast('artifact:updated', serialized);
      }
      afterArtifactMutation(database, rid);
    } catch (e) {
      console.warn('[artifact-link-sync] row failed', e?.message || e);
    }
  }
}

module.exports = {
  setExcelGet,
  syncLinkedArtifactsForResource,
};
