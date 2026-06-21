'use strict';

/* eslint-disable no-console */

const { serializeArtifactRecord, parseJsonState } = require('./artifact-serialize.cjs');

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
 * Prefer an explicit sheet from the tool / caller, else the sheet stored in any linked artifact, else {} (first sheet).
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {string} linkedResourceId
 * @param {{ sheetName?: string } | null | undefined} syncHints
 */
async function buildExcelGetOpts(queries, linkedResourceId, syncHints) {
  const getOpts = /** @type {Record<string, unknown>} */ ({});
  const hint = syncHints && typeof syncHints.sheetName === 'string' ? syncHints.sheetName.trim() : '';
  if (hint) {
    getOpts.sheet_name = hint;
    return getOpts;
  }
  try {
    const rowsPeek = await queries.getArtifactsLinkedToResource.all(linkedResourceId);
    for (const art of rowsPeek) {
      const st = parseJsonState(art.state);
      const ld = st.linkedData;
      if (ld && typeof ld === 'object' && ld.sheet_name != null && String(ld.sheet_name).trim()) {
        getOpts.sheet_name = String(ld.sheet_name).trim();
        return getOpts;
      }
    }
  } catch {
    /* ignore */
  }
  return getOpts;
}

/**
 * Snapshot the linked workbook into every artifact pointing at linkedResourceId.
 * @param {{ sheetName?: string } | null | undefined} [syncHints] — e.g. active sheet after excelSetCell so sync matches the edited tab, not always worksheets[0]
 */
async function syncLinkedArtifactsForResource(database, windowManager, linkedResourceId, syncHints) {
  if (!database || !linkedResourceId) return;
  const queries = database.getQueries();

  const linkedRes = await queries.getResourceById.get(linkedResourceId);
  if (!linkedRes || !isExcelLinkedResource(linkedRes)) return;

  if (!_excelGet || typeof _excelGet !== 'function') {
    console.warn('[artifact-link-sync] excel_get stub — link sync skipped');
    return;
  }

  const getOpts = await buildExcelGetOpts(queries, linkedResourceId, syncHints);
  /** @type {{ success?: boolean } & Record<string, unknown>} */
  const xl = await _excelGet(linkedResourceId, getOpts);
  if (!xl || xl.success !== true) return;

  const data = Array.isArray(xl.data) ? xl.data : [];
  const sheetKey =
    (xl.sheet_name != null && String(xl.sheet_name).trim()) ||
    (Array.isArray(xl.sheet_names) && xl.sheet_names[0] != null && String(xl.sheet_names[0])) ||
    'Sheet1';
  /** @type {Record<string, unknown[][]>} */
  const sheets = {};
  sheets[sheetKey] = data;

  const linkedData = {
    resource_id: linkedResourceId,
    title: xl.title,
    sheet_names: xl.sheet_names,
    sheet_name: xl.sheet_name,
    data,
    sheets,
    synced_at: Date.now(),
  };

  const rows = await queries.getArtifactsLinkedToResource.all(linkedResourceId);
  const now = Date.now();

  for (const art of rows) {
    try {
      const rid = art.resource_id;
      const state = parseJsonState(art.state);
      state.linkedData = linkedData;
      await queries.updateArtifactState.run(JSON.stringify(state), now, rid);
      const resource = await queries.getResourceById.get(rid);
      const updated = await queries.getArtifactByResourceId.get(rid);
      const serialized = await serializeArtifactRecord(updated, resource, queries);
      if (serialized && windowManager?.broadcast) {
        windowManager.broadcast('artifact:updated', serialized);
      }
      // linkedData mirror only — buildArtifactIndexPayload uses html+data, not linkedData (resource-text.cjs)
    } catch (e) {
      console.warn('[artifact-link-sync] row failed', e?.message || e);
    }
  }
}

module.exports = {
  setExcelGet,
  syncLinkedArtifactsForResource,
};
