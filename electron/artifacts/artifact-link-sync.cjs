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
function buildExcelGetOpts(queries, linkedResourceId, syncHints) {
  const getOpts = /** @type {Record<string, unknown>} */ ({});
  const hint = syncHints && typeof syncHints.sheetName === 'string' ? syncHints.sheetName.trim() : '';
  if (hint) {
    getOpts.sheet_name = hint;
    return getOpts;
  }
  try {
    const rowsPeek = queries.getArtifactsLinkedToResource.all(linkedResourceId);
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

function resolveSheetKey(xl) {
  if (xl.sheet_name != null && String(xl.sheet_name).trim()) {
    return String(xl.sheet_name).trim();
  }
  if (Array.isArray(xl.sheet_names) && xl.sheet_names[0] != null) {
    return String(xl.sheet_names[0]);
  }
  return 'Sheet1';
}

function buildLinkedDataPayload(xl, linkedResourceId) {
  const data = Array.isArray(xl.data) ? xl.data : [];
  const sheetKey = resolveSheetKey(xl);
  /** @type {Record<string, unknown[][]>} */
  const sheets = { [sheetKey]: data };
  return {
    resource_id: linkedResourceId,
    title: xl.title,
    sheet_names: xl.sheet_names,
    sheet_name: xl.sheet_name,
    data,
    sheets,
    synced_at: Date.now(),
  };
}

function errorMessage(e) {
  return e?.message || e;
}

function broadcastArtifactUpdate(windowManager, serialized) {
  if (serialized && windowManager?.broadcast) {
    windowManager.broadcast('artifact:updated', serialized);
  }
}

function writeVaultMirrorIfEnabled(rid, database, fileStorage) {
  if (!fileStorage) return;
  try {
    const vaultStore = require('../storage/vault-store.cjs');
    vaultStore.writeArtifactHtmlMirror({ id: rid }, { database, fileStorage });
  } catch (e) {
    console.warn('[artifact-link-sync] vault mirror failed', errorMessage(e));
  }
}

function syncArtifactRow(art, linkedData, now, ctx) {
  const { queries, windowManager, database, fileStorage } = ctx;
  const rid = art.resource_id;
  const state = parseJsonState(art.state);
  state.linkedData = linkedData;
  queries.updateArtifactState.run(JSON.stringify(state), now, rid);
  const resource = queries.getResourceById.get(rid);
  const updated = queries.getArtifactByResourceId.get(rid);
  const serialized = serializeArtifactRecord(updated, resource, queries);
  broadcastArtifactUpdate(windowManager, serialized);
  writeVaultMirrorIfEnabled(rid, database, fileStorage);
}

function syncLinkedRows(rows, linkedData, now, ctx) {
  for (const art of rows) {
    try {
      syncArtifactRow(art, linkedData, now, ctx);
    } catch (e) {
      console.warn('[artifact-link-sync] row failed', errorMessage(e));
    }
  }
}

/**
 * Snapshot the linked workbook into every artifact pointing at linkedResourceId.
 * @param {{ sheetName?: string } | null | undefined} [syncHints] — e.g. active sheet after excelSetCell so sync matches the edited tab, not always worksheets[0]
 */
async function syncLinkedArtifactsForResource(database, windowManager, linkedResourceId, syncHints, fileStorage) {
  if (!database || !linkedResourceId) return;
  const queries = database.getQueries();

  const linkedRes = queries.getResourceById.get(linkedResourceId);
  if (!linkedRes || !isExcelLinkedResource(linkedRes)) return;

  if (!_excelGet || typeof _excelGet !== 'function') {
    console.warn('[artifact-link-sync] excel_get stub — link sync skipped');
    return;
  }

  const getOpts = buildExcelGetOpts(queries, linkedResourceId, syncHints);
  /** @type {{ success?: boolean } & Record<string, unknown>} */
  const xl = await _excelGet(linkedResourceId, getOpts);
  if (!xl || xl.success !== true) return;

  const linkedData = buildLinkedDataPayload(xl, linkedResourceId);
  const rows = queries.getArtifactsLinkedToResource.all(linkedResourceId);
  const now = Date.now();
  syncLinkedRows(rows, linkedData, now, { queries, windowManager, database, fileStorage });
}

module.exports = {
  setExcelGet,
  syncLinkedArtifactsForResource,
};