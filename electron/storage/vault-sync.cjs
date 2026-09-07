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

  if (moved.type === 'note') {
    ensureResourceMirror(resourceId, { database, fileStorage });
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

/**
 * Make sure a resource has its on-disk representation in the vault — the
 * workspace tree must be identical to the filesystem. Used after create and
 * when creating parent folders. Returns true when a vault path is assigned.
 */
function ensureResourceMirror(resourceId, { database, fileStorage }) {
  const queries = database.getQueries();
  const resource = queries.getResourceById.get(resourceId);
  if (!resource) return false;
  const ctx = { database, fileStorage };
  if (resource.vault_path) return true;
  let result;
  switch (resource.type) {
    case 'folder': result = vaultStore.createFolderOnDisk(resourceId, ctx); break;
    case 'note': result = vaultStore.writeNoteMarkdown({ id: resourceId, markdown: String(resource.content ?? '') }, ctx); break;
    case 'url': result = vaultStore.writeUrlMirror({ id: resourceId }, ctx); break;
    case 'notebook': result = vaultStore.writeNotebookMirror({ id: resourceId }, ctx); break;
    case 'artifact': result = vaultStore.writeArtifactHtmlMirror({ id: resourceId }, ctx); break;
    default: return false;
  }
  return result.success === true;
}

module.exports = {
  ensureFolderChainOnDisk,
  syncVaultAfterMoveToFolder,
  ensureResourceMirror,
};
