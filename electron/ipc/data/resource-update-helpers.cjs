/**
 * Helpers for db:resources:update (cognitive-complexity extraction).
 * Behavior must stay identical to the pre-refactor inline logic.
 */

/**
 * Partial merge of title/content/metadata/updated_at for resources:update.
 * @param {object} resource incoming partial update
 * @param {object} current existing DB row
 * @param {{ untitledTitleFallback?: boolean }} [opts]
 *   When true (happy path + first repair retry), nullish title becomes 'Untitled'.
 *   Second aggressive repair omits that fallback (historical behavior).
 */
function mergeResourceUpdateFields(resource, current, opts = {}) {
  const { untitledTitleFallback = true } = opts;
  const titleBase = resource.title !== undefined ? resource.title : current.title;
  const mergedTitle = untitledTitleFallback ? (titleBase ?? 'Untitled') : titleBase;
  const mergedContent =
    resource.content !== undefined ? (resource.content || null) : (current.content || null);
  let mergedMetadata = null;
  if (resource.metadata !== undefined) {
    mergedMetadata =
      typeof resource.metadata === 'object' && resource.metadata !== null
        ? JSON.stringify(resource.metadata)
        : resource.metadata;
  } else {
    mergedMetadata = current.metadata;
  }
  const mergedUpdatedAt =
    resource.updated_at !== undefined ? resource.updated_at : current.updated_at;
  return { mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt };
}

function buildMergedResource(current, fields) {
  return {
    ...current,
    title: fields.mergedTitle,
    content: fields.mergedContent,
    metadata: fields.mergedMetadata,
    updated_at: fields.mergedUpdatedAt,
  };
}

function refreshNoteContentTextFromMerged(mergedContent, resourceId, database) {
  try {
    const { extractPlainTextFromProseMirror, stripTags } = require('../../services/resource-text.cjs');
    const raw = String(mergedContent || '');
    let text = '';
    if (raw.trim().startsWith('{')) {
      try {
        text = extractPlainTextFromProseMirror(JSON.parse(raw));
      } catch {
        /* fall through */
      }
    }
    if (!text) text = stripTags(raw);
    database.getDB().prepare('UPDATE resources SET content_text = ? WHERE id = ?').run(text, resourceId);
  } catch {
    /* non-fatal */
  }
}

function reconcileFolderVault(resource, current, { database, fileStorage, vaultStore }) {
  if (
    (resource.title !== undefined && resource.title !== current.title)
    || (resource.folder_id !== undefined && resource.folder_id !== current.folder_id)
  ) {
    vaultStore.relocateFolder(resource.id, { database, fileStorage });
  }
}

function reconcileNoteVault(resource, current, mergedContent, { database, fileStorage, vaultStore }) {
  // AI agent writes markdown to vault mirror directly via writeNoteMarkdownFromAgent;
  // refresh content_text from vault on the next mirror write or editor save.
  if (resource.content !== undefined) {
    refreshNoteContentTextFromMerged(mergedContent, resource.id, database);
  }
  if (resource.title !== undefined && resource.title !== current.title) {
    vaultStore.relocateResource(resource.id, { database, fileStorage });
  }
}

function reconcileUrlVault(resource, current, { database, fileStorage, vaultStore }) {
  // Rewrites the .url file at the title-derived path (rename + content).
  if (
    (resource.title !== undefined && resource.title !== current.title)
    || (resource.content !== undefined && resource.content !== current.content)
  ) {
    vaultStore.writeUrlMirror({ id: resource.id }, { database, fileStorage });
  }
}

function reconcileNotebookVault(resource, current, { database, fileStorage, vaultStore }) {
  if (
    (resource.title !== undefined && resource.title !== current.title)
    || (resource.content !== undefined && resource.content !== current.content)
  ) {
    vaultStore.writeNotebookMirror({ id: resource.id }, { database, fileStorage });
  }
}

function reconcileArtifactVault(resource, current, { database, fileStorage, vaultStore }) {
  // Title-derived path; relocateResource also moves the .dome sidecar.
  if (resource.title !== undefined && resource.title !== current.title) {
    vaultStore.relocateResource(resource.id, { database, fileStorage });
  }
}

function reconcileBinaryVault(resource, current, { database, fileStorage, vaultStore }) {
  // Binary file types: renaming in Dome renames the file on disk too.
  if (resource.title !== undefined && resource.title !== current.title) {
    vaultStore.renameResourceFileToTitle(resource.id, { database, fileStorage });
  }
}

/**
 * Vault reconciliation: keep the on-disk Markdown tree + search caches in
 * sync with this DB write (covers AI/tool edits as well as renderer saves).
 */
function reconcileVaultAfterResourceUpdate(resource, current, mergedContent, deps) {
  try {
    if (current.type === 'folder') {
      reconcileFolderVault(resource, current, deps);
    } else if (current.type === 'note') {
      reconcileNoteVault(resource, current, mergedContent, deps);
    } else if (current.type === 'url') {
      reconcileUrlVault(resource, current, deps);
    } else if (current.type === 'notebook') {
      reconcileNotebookVault(resource, current, deps);
    } else if (current.type === 'artifact') {
      reconcileArtifactVault(resource, current, deps);
    } else if (current.vault_path) {
      reconcileBinaryVault(resource, current, deps);
    }
  } catch (e) {
    console.warn('[DB] vault reconcile (update) failed:', e?.message);
  }
}

function broadcastResourceUpdatedAndReindex({
  resourceId,
  mergedResource,
  current,
  windowManager,
  maybeScheduleKbReindex,
  semanticIndexScheduler,
}) {
  windowManager.broadcast('resource:updated', {
    id: resourceId,
    updates: mergedResource,
  });
  maybeScheduleKbReindex(resourceId, mergedResource, current);
  semanticIndexScheduler.scheduleSemanticReindex(resourceId);
}

function persistMergedResourceUpdate(queries, resource, current, mergeOpts) {
  const fields = mergeResourceUpdateFields(resource, current, mergeOpts);
  queries.updateResource.run(
    fields.mergedTitle,
    fields.mergedContent,
    fields.mergedMetadata,
    fields.mergedUpdatedAt,
    resource.id,
  );
  return { fields, mergedResource: buildMergedResource(current, fields) };
}

/**
 * Happy-path update: merge → DB write → vault reconcile → broadcast + reindex.
 */
function executeResourcesUpdate(resource, deps) {
  const {
    database,
    fileStorage,
    windowManager,
    maybeScheduleKbReindex,
    semanticIndexScheduler,
    vaultStore,
  } = deps;
  const queries = database.getQueries();
  const current = queries.getResourceById.get(resource.id);
  if (!current) {
    return { success: false, error: 'Resource not found' };
  }

  const { fields, mergedResource } = persistMergedResourceUpdate(
    queries,
    resource,
    current,
    { untitledTitleFallback: true },
  );

  reconcileVaultAfterResourceUpdate(resource, current, fields.mergedContent, {
    database,
    fileStorage,
    vaultStore,
  });

  broadcastResourceUpdatedAndReindex({
    resourceId: resource.id,
    mergedResource,
    current,
    windowManager,
    maybeScheduleKbReindex,
    semanticIndexScheduler,
  });

  return { success: true, data: mergedResource };
}

/**
 * Single repair retry without vault reconcile (matches pre-refactor paths).
 */
function attemptResourceUpdateAfterRepair(resource, deps, mergeOpts) {
  const {
    database,
    windowManager,
    maybeScheduleKbReindex,
    semanticIndexScheduler,
  } = deps;
  const queries = database.getQueries();
  const current = queries.getResourceById.get(resource.id);
  if (!current) return { success: false, error: 'Resource not found' };

  const { mergedResource } = persistMergedResourceUpdate(
    queries,
    resource,
    current,
    mergeOpts,
  );

  broadcastResourceUpdatedAndReindex({
    resourceId: resource.id,
    mergedResource,
    current,
    windowManager,
    maybeScheduleKbReindex,
    semanticIndexScheduler,
  });

  return { success: true, data: mergedResource };
}

/**
 * SQLITE_CORRUPT / SQLITE_CORRUPT_VTAB repair+retry, including second repair cycle.
 */
function retryResourcesUpdateAfterCorruption(resource, deps) {
  try {
    return attemptResourceUpdateAfterRepair(resource, deps, { untitledTitleFallback: true });
  } catch (retryError) {
    console.error('[DB] Error retrying after repair:', retryError);
    if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
      console.warn('[DB] Corruption persists, attempting more aggressive repair...');
      deps.database.invalidateQueries();
      const repairedAgain = deps.database.repairFTSTables();
      if (repairedAgain) {
        try {
          return attemptResourceUpdateAfterRepair(resource, deps, {
            untitledTitleFallback: false,
          });
        } catch (finalError) {
          console.error('[DB] Error after second repair attempt:', finalError);
          return { success: false, error: finalError.message };
        }
      }
    }
    return { success: false, error: retryError.message };
  }
}

module.exports = {
  mergeResourceUpdateFields,
  buildMergedResource,
  refreshNoteContentTextFromMerged,
  reconcileFolderVault,
  reconcileNoteVault,
  reconcileUrlVault,
  reconcileNotebookVault,
  reconcileArtifactVault,
  reconcileBinaryVault,
  reconcileVaultAfterResourceUpdate,
  broadcastResourceUpdatedAndReindex,
  persistMergedResourceUpdate,
  executeResourcesUpdate,
  attemptResourceUpdateAfterRepair,
  retryResourcesUpdateAfterCorruption,
};
