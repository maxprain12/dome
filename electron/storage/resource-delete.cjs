/* eslint-disable no-console */
/**
 * Unified resource deletion — the single pipeline behind `resource:delete`,
 * `db:resources:delete` and `db:resources:bulkDelete`.
 *
 * Every delete expands folder subtrees and removes, deepest-first:
 *   1. the legacy internal file (dome-files/) when present,
 *   2. the vault mirror (`.md` / `.html` / binary) or the folder directory,
 *   3. the SQLite row,
 * broadcasting `resource:deleted` per id so all windows stay in sync.
 *
 * Vault removals are marked as self-writes so the VaultWatcher never
 * reconciles them as external deletes.
 */

const vaultStore = require('./vault-store.cjs');

/** Collect a resource id and all its descendants (folder tree, breadth-first). */
function collectSubtreeIds(queries, rootId) {
  const ids = [];
  const queue = [rootId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    const children = queries.getResourcesByFolder.all(id);
    for (const child of children) queue.push(child.id);
  }
  return ids;
}

/**
 * Delete one or more resources (cascading folder subtrees).
 * @param {string[]} resourceIds roots to delete
 * @param {{ database: object, fileStorage: object, windowManager: object }} deps
 * @returns {{ success: boolean, deletedIds: string[] }}
 */
function deleteResourcesCascade(resourceIds, { database, fileStorage, windowManager }) {
  const queries = database.getQueries();

  const deleteSet = new Set();
  for (const rid of resourceIds) {
    if (typeof rid !== 'string' || !rid) continue;
    for (const id of collectSubtreeIds(queries, rid)) deleteSet.add(id);
  }

  // Children before parents so folder directories empty out naturally.
  const memo = new Map();
  function depthInDeleteSet(id) {
    if (memo.has(id)) return memo.get(id);
    const row = queries.getResourceById.get(id);
    if (!row?.folder_id || !deleteSet.has(row.folder_id)) {
      memo.set(id, 0);
      return 0;
    }
    const v = depthInDeleteSet(row.folder_id) + 1;
    memo.set(id, v);
    return v;
  }
  const ordered = [...deleteSet].sort((a, b) => depthInDeleteSet(b) - depthInDeleteSet(a));

  const deletedIds = [];
  for (const id of ordered) {
    const resource = queries.getResourceById.get(id);
    if (!resource) continue;

    if (resource.internal_path) {
      try {
        fileStorage.deleteFile(resource.internal_path);
      } catch (e) {
        console.warn('[ResourceDelete] internal file:', e?.message);
      }
    }

    // Remove the vault mirror BEFORE dropping the DB row. Without this the
    // file lingers in the vault and the VaultWatcher re-imports it as a new
    // resource. Must run before deleteResource (it reads vault_path via the row).
    if (resource.type === 'folder') {
      try {
        vaultStore.removeFolderFromDisk(id, { database, fileStorage });
      } catch (e) {
        console.warn('[ResourceDelete] removeFolderFromDisk:', e?.message);
      }
    } else {
      try {
        vaultStore.removeMirrorForResource(id, { database, fileStorage });
      } catch (e) {
        console.warn('[ResourceDelete] removeMirrorForResource:', e?.message);
      }
    }

    queries.deleteResource.run(id);
    deletedIds.push(id);
    try {
      windowManager.broadcast('resource:deleted', { id });
    } catch {
      /* window gone — non-fatal */
    }
  }

  return { success: true, deletedIds };
}

module.exports = { collectSubtreeIds, deleteResourcesCascade };
