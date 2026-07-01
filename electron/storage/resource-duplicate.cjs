/* eslint-disable no-console */
/**
 * Resource duplication — Finder-style "Duplicate" for the workspace.
 *
 * Clones the SQLite row(s) AND the on-disk vault representation:
 *   - folders duplicate recursively (children keep their titles),
 *   - notes/artifacts/urls/notebooks rewrite their mirror for the copy,
 *   - binaries copy the vault file (legacy internal files are copied into the
 *     vault for the duplicate — the vault is the source of truth).
 */

const crypto = require('crypto');
const fs = require('fs');
const vaultStore = require('./vault-store.cjs');
const { noteContentToMarkdown } = require('./vault-sync.cjs');

function duplicateTitle(title, suffix) {
  const t = String(title || 'Untitled');
  const m = t.match(/^(.*)(\.[A-Za-z0-9]{1,5})$/);
  if (m && m[1].trim()) return `${m[1]} (${suffix})${m[2]}`;
  return `${t} (${suffix})`;
}

/**
 * @param {string} srcId resource to duplicate
 * @param {{ database, fileStorage, windowManager }} deps
 * @param {{ suffix?: string, _parentFolderId?: string, _keepTitle?: boolean }} [opts]
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
function duplicateResourceTree(srcId, deps, opts = {}) {
  const { database, fileStorage, windowManager } = deps;
  const db = database.getDB();
  const queries = database.getQueries();
  const src = queries.getResourceById.get(srcId);
  if (!src) return { success: false, error: 'Resource not found' };

  const suffix = opts.suffix || 'copy';
  const now = Date.now();
  const newId = crypto.randomUUID();
  const title = opts._keepTitle ? src.title : duplicateTitle(src.title, suffix);
  const folderId = opts._parentFolderId !== undefined ? opts._parentFolderId : (src.folder_id ?? null);

  db.prepare(
    `INSERT INTO resources (
       id, project_id, type, title, content, file_path, internal_path,
       file_mime_type, file_size, file_hash, original_filename, folder_id,
       vault_path, content_text, content_hash, metadata, thumbnail_data,
       created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    newId, src.project_id, src.type, title, src.content ?? null, null, null,
    src.file_mime_type ?? null, src.file_size ?? null, src.file_hash ?? null,
    src.original_filename ?? null, folderId,
    null, src.content_text ?? null, null, src.metadata ?? null, src.thumbnail_data ?? null,
    now, now,
  );
  const copy = queries.getResourceById.get(newId);

  try {
    switch (src.type) {
      case 'folder': {
        vaultStore.createFolderOnDisk(newId, { database, fileStorage });
        const children = queries.getResourcesByFolder.all(srcId);
        for (const child of children) {
          duplicateResourceTree(child.id, deps, { suffix, _parentFolderId: newId, _keepTitle: true });
        }
        break;
      }
      case 'note': {
        let md = null;
        const srcAbs = vaultStore.vaultAbsPathForResource(src, queries, fileStorage);
        if (srcAbs && fs.existsSync(srcAbs)) {
          md = vaultStore.stripFrontmatter(fs.readFileSync(srcAbs, 'utf8'));
        }
        if (md == null) md = noteContentToMarkdown(src) ?? '';
        vaultStore.writeNoteMarkdown({ id: newId, markdown: md }, { database, fileStorage });
        break;
      }
      case 'artifact': {
        const artifact = queries.getArtifactByResourceId.get(srcId);
        if (artifact) {
          queries.createArtifact.run(
            crypto.randomUUID(), newId, artifact.artifact_type, artifact.template,
            artifact.state, artifact.linked_resource_id ?? null, now, now,
          );
          vaultStore.writeArtifactHtmlMirror({ id: newId }, { database, fileStorage });
        }
        break;
      }
      case 'url':
        vaultStore.writeUrlMirror({ id: newId }, { database, fileStorage });
        break;
      case 'notebook':
        vaultStore.writeNotebookMirror({ id: newId }, { database, fileStorage });
        break;
      default: {
        const srcAbs = vaultStore.getResourceFilePath(src, queries, fileStorage);
        if (srcAbs && fs.existsSync(srcAbs)) {
          const imported = vaultStore.importFileToVault(srcAbs, copy, { database, fileStorage });
          db.prepare('UPDATE resources SET vault_path = ?, content_hash = ?, file_size = ? WHERE id = ?')
            .run(imported.vaultPath, imported.contentHash, imported.size, newId);
        }
        break;
      }
    }
  } catch (e) {
    console.warn('[ResourceDuplicate] mirror copy failed:', e?.message);
  }

  try {
    windowManager.broadcast('resource:created', {
      id: newId,
      type: src.type,
      project_id: src.project_id,
      folder_id: folderId,
      title,
    });
  } catch { /* non-fatal */ }

  return { success: true, id: newId };
}

module.exports = { duplicateResourceTree };
