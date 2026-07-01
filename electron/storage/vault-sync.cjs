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

/**
 * Best-effort markdown for a note's DB content: markdown/plain passes through,
 * Tiptap JSON is converted with the basic walker, HTML falls back to null
 * (mirrors renderer conversion quality; see loadNoteMarkdown.ts).
 */
function noteContentToMarkdown(resource) {
  const raw = String(resource.content || '').trim();
  if (raw) {
    if (raw.startsWith('{')) return vaultStore.tiptapJsonToMarkdownBasic(raw);
    if (raw.startsWith('<')) return null;
    return raw;
  }
  const cached = String(resource.content_text || '').trim();
  return cached || '';
}

/**
 * Make sure a resource has its on-disk representation in the vault — the
 * workspace tree must be identical to the filesystem. Used after create and
 * by the boot doctor. Returns true when a mirror exists (or was written).
 */
function ensureResourceMirror(resourceId, { database, fileStorage }) {
  const queries = database.getQueries();
  const resource = queries.getResourceById.get(resourceId);
  if (!resource) return false;

  try {
    switch (resource.type) {
      case 'folder': {
        if (!resource.vault_path) {
          return vaultStore.createFolderOnDisk(resourceId, { database, fileStorage }).success === true;
        }
        return true;
      }
      case 'note': {
        if (resource.vault_path) return true;
        const md = noteContentToMarkdown(resource);
        if (md === null) return false; // HTML legacy — converted on first editor save
        return vaultStore.writeNoteMarkdown({ id: resourceId, markdown: md }, { database, fileStorage }).success === true;
      }
      case 'url': {
        if (resource.vault_path) return true;
        return vaultStore.writeUrlMirror({ id: resourceId }, { database, fileStorage }).success === true;
      }
      case 'notebook': {
        if (resource.vault_path) return true;
        return vaultStore.writeNotebookMirror({ id: resourceId }, { database, fileStorage }).success === true;
      }
      case 'artifact': {
        if (resource.vault_path) return true;
        return vaultStore.writeArtifactHtmlMirror({ id: resourceId }, { database, fileStorage }).success === true;
      }
      default: {
        // Binary types: copy the legacy internal file into the vault.
        if (resource.vault_path) return true;
        if (!resource.internal_path) return false;
        const fs = require('fs');
        const src = fileStorage.getFullPath(resource.internal_path);
        if (!fs.existsSync(src)) return false;
        const imported = vaultStore.importFileToVault(src, resource, { database, fileStorage });
        database.getDB()
          .prepare('UPDATE resources SET vault_path = ?, content_hash = ?, file_size = ? WHERE id = ?')
          .run(imported.vaultPath, imported.contentHash, imported.size, resourceId);
        return true;
      }
    }
  } catch (e) {
    console.warn('[VaultSync] ensureResourceMirror failed:', e?.message);
    return false;
  }
}

module.exports = {
  ensureFolderChainOnDisk,
  syncVaultAfterMoveToFolder,
  ensureResourceMirror,
  noteContentToMarkdown,
};
