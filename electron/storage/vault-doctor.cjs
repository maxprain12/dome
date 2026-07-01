/* eslint-disable no-console */
/**
 * Vault Doctor — boot-time reconciliation so the workspace tree in Dome is
 * IDENTICAL to the filesystem under each project's vault root.
 *
 * Runs before the VaultWatcher starts:
 *   1. Repair orphaned folder_id references (non-cascading deletes of the past).
 *   2. Backfill vault_path + on-disk presence for folders, notes, urls,
 *      notebooks, artifacts and legacy binaries (internal_path → vault copy).
 *   3. Restore mirrors whose file disappeared from disk while Dome was closed:
 *      rewrite from SQLite where we hold the content; for binaries re-import
 *      from the legacy internal file, else clear vault_path so the row doesn't
 *      point at a ghost path.
 *
 * The watcher covers the opposite direction (files on disk unknown to SQLite)
 * with its initial scanRoot pass.
 */

const path = require('path');
const fs = require('fs');
const vaultStore = require('./vault-store.cjs');
const { ensureResourceMirror, noteContentToMarkdown } = require('./vault-sync.cjs');

/** Restore a single missing mirror from DB state. Returns 'restored' | 'cleared' | 'skipped'. */
function restoreMissingMirror(resource, { database, fileStorage }) {
  const deps = { database, fileStorage };
  const db = database.getDB();

  switch (resource.type) {
    case 'folder': {
      const r = vaultStore.relocateFolder(resource.id, deps);
      return r.vaultPath ? 'restored' : 'skipped';
    }
    case 'note': {
      const md = noteContentToMarkdown(resource);
      if (md === null) return 'skipped';
      return vaultStore.writeNoteMarkdown({ id: resource.id, markdown: md }, deps).success
        ? 'restored'
        : 'skipped';
    }
    case 'url':
      return vaultStore.writeUrlMirror({ id: resource.id }, deps).success ? 'restored' : 'skipped';
    case 'notebook':
      return vaultStore.writeNotebookMirror({ id: resource.id }, deps).success ? 'restored' : 'skipped';
    case 'artifact':
      return vaultStore.writeArtifactHtmlMirror({ id: resource.id }, deps).success ? 'restored' : 'skipped';
    default: {
      if (resource.internal_path) {
        const src = fileStorage.getFullPath(resource.internal_path);
        if (fs.existsSync(src)) {
          const imported = vaultStore.importFileToVault(src, resource, deps);
          db.prepare('UPDATE resources SET vault_path = ?, content_hash = ?, file_size = ? WHERE id = ?')
            .run(imported.vaultPath, imported.contentHash, imported.size, resource.id);
          return 'restored';
        }
      }
      // File is gone and we have no copy — stop pointing at a ghost path.
      db.prepare('UPDATE resources SET vault_path = NULL WHERE id = ?').run(resource.id);
      return 'cleared';
    }
  }
}

/**
 * Full boot reconciliation. Synchronous (better-sqlite3) — call before the
 * watcher starts so its scan sees a consistent tree.
 */
function runBootReconcile({ database, fileStorage }) {
  const stats = { repairedRefs: 0, backfilled: 0, restored: 0, cleared: 0 };
  const deps = { database, fileStorage };

  try {
    stats.repairedRefs = vaultStore.repairFolderIntegrity({ database });
  } catch (e) {
    console.warn('[VaultDoctor] repairFolderIntegrity:', e?.message);
  }

  const db = database.getDB();
  const queries = database.getQueries();

  // 2. Backfill rows without any on-disk representation.
  let missingMirror = [];
  try {
    missingMirror = db
      .prepare("SELECT id FROM resources WHERE vault_path IS NULL OR trim(vault_path) = ''")
      .all();
  } catch (e) {
    console.warn('[VaultDoctor] backfill query:', e?.message);
  }
  for (const row of missingMirror) {
    try {
      if (ensureResourceMirror(row.id, deps)) stats.backfilled += 1;
    } catch (e) {
      console.warn('[VaultDoctor] backfill', row.id, e?.message);
    }
  }

  // 3. Restore mirrors whose file vanished from disk.
  let mirrored = [];
  try {
    mirrored = db
      .prepare("SELECT id FROM resources WHERE vault_path IS NOT NULL AND trim(vault_path) != ''")
      .all();
  } catch (e) {
    console.warn('[VaultDoctor] restore query:', e?.message);
  }
  for (const row of mirrored) {
    try {
      const resource = queries.getResourceById.get(row.id);
      if (!resource) continue;
      const root = vaultStore.getProjectVaultRoot(resource.project_id, queries, fileStorage);
      const abs = path.join(root, resource.vault_path);
      if (fs.existsSync(abs)) continue;
      const outcome = restoreMissingMirror(resource, deps);
      if (outcome === 'restored') stats.restored += 1;
      else if (outcome === 'cleared') stats.cleared += 1;
    } catch (e) {
      console.warn('[VaultDoctor] restore', row.id, e?.message);
    }
  }

  const total = stats.repairedRefs + stats.backfilled + stats.restored + stats.cleared;
  if (total > 0) {
    console.log(
      `[VaultDoctor] reconciled vault↔DB — refs:${stats.repairedRefs} backfilled:${stats.backfilled} restored:${stats.restored} cleared:${stats.cleared}`,
    );
  }
  return stats;
}

module.exports = { runBootReconcile };
