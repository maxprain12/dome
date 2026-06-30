/* eslint-disable no-console */
/**
 * Shared vault sync helpers — keep SQLite folder_id / vault_path aligned with
 * on-disk layout for both IPC (database.cjs) and agent tools (ai-tools-handler).
 */
const vaultStore = require('./vault-store.cjs');

/**
 * Ensure a folder and every ancestor have a physical directory + vault_path.
 * Walks root → leaf so parent paths exist before child mkdir.
 */
function ensureFolderChainOnDisk(folderId, { database, fileStorage }) {
  if (!folderId) return;
  const queries = database.getQueries();
  const chain = [];
  let currentId = folderId;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = queries.getResourceById.get(currentId);
    if (!folder || folder.type !== 'folder') break;
    chain.unshift(currentId);
    currentId = folder.folder_id || null;
  }
  for (const id of chain) {
    const row = queries.getResourceById.get(id);
    const missing = !row?.vault_path || String(row.vault_path).trim() === '';
    if (missing) {
      vaultStore.createFolderOnDisk(id, { database, fileStorage });
    }
  }
}

/**
 * After SQL folder_id update: backfill target folder chain, seed note mirror if
 * needed, then relocate on disk.
 */
function syncVaultAfterMoveToFolder(resourceId, { database, fileStorage }) {
  const queries = database.getQueries();
  const moved = queries.getResourceById.get(resourceId);
  if (!moved) return;

  if (moved.folder_id) {
    ensureFolderChainOnDisk(moved.folder_id, { database, fileStorage });
  }

  if (moved.type === 'note' && (!moved.vault_path || String(moved.vault_path).trim() === '')) {
    const fresh = queries.getResourceById.get(resourceId);
    const body = fresh?.content_text || fresh?.content || '';
    if (body && String(body).trim()) {
      try {
        vaultStore.writeNoteMarkdown({ id: resourceId, markdown: String(body) }, { database, fileStorage });
      } catch (e) {
        console.warn('[VaultSync] writeNoteMarkdown before relocate failed:', e?.message);
      }
    }
  }

  const after = queries.getResourceById.get(resourceId);
  if (!after) return;

  try {
    if (after.type === 'folder') {
      vaultStore.relocateFolder(resourceId, { database, fileStorage });
    } else {
      vaultStore.relocateResource(resourceId, { database, fileStorage });
    }
  } catch (e) {
    console.warn('[VaultSync] relocate after move failed:', e?.message);
  }
}

/** Remove vault mirror (and folder directory) before deleting the DB row. */
function syncVaultBeforeDelete(resourceId, { database, fileStorage }) {
  const queries = database.getQueries();
  const resource = queries.getResourceById.get(resourceId);
  if (!resource) return;

  try {
    vaultStore.removeMirrorForResource(resourceId, { database, fileStorage });
  } catch (e) {
    console.warn('[VaultSync] removeMirrorForResource failed:', e?.message);
  }
  if (resource.type === 'folder') {
    try {
      vaultStore.removeFolderFromDisk(resourceId, { database, fileStorage });
    } catch (e) {
      console.warn('[VaultSync] removeFolderFromDisk failed:', e?.message);
    }
  }
}

module.exports = {
  ensureFolderChainOnDisk,
  syncVaultAfterMoveToFolder,
  syncVaultBeforeDelete,
};
