/* eslint-disable no-console */
/**
 * Vault Watcher - Main Process
 *
 * Watches every project's vault root for EXTERNAL changes made outside Dome
 * (Obsidian, an editor, Finder). The vault is the source of truth for ALL
 * resource types (notes `.md` AND binaries: PDF, images, audio, video, Office).
 *
 *   - add of an UNKNOWN file       → import as a resource of the classified type
 *                                    (notes parse markdown; binaries get thumbnail
 *                                    + text extraction). Folders mirror the tree.
 *   - change of a KNOWN file       → notes: refresh text/index; binaries: refresh
 *                                    thumbnail/extraction. Always update content_hash.
 *   - addDir                       → create the folder resource (empty folders too).
 *   - unlink                       → after a debounce, if the resource still points
 *                                    there and the file is gone, delete it.
 *
 * Our own writes are ignored via the self-write registry + a hash check against
 * resources.content_hash, so this never reacts to in-app saves.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const vaultStore = require('./vault-store.cjs');

let _watcher = null;
let _deps = null;
const _pendingUnlinks = new Map();
const _pendingDirUnlinks = new Map();
const UNLINK_DEBOUNCE_MS = 1500;

function toRelPath(rootDir, absPath) {
  return path.relative(rootDir, absPath).split(path.sep).join('/');
}

/** Resolve which project + project-relative path an absolute file belongs to. */
function resolvePathContext(absPath, deps) {
  const queries = deps.database.getQueries();
  const roots = vaultStore.getProjectRoots(queries, deps.fileStorage);
  let best = null;
  for (const r of roots) {
    if (absPath === r.root || absPath.startsWith(r.root + path.sep)) {
      if (!best || r.root.length > best.root.length) best = r;
    }
  }
  if (!best) return null;
  const relPath = toRelPath(best.root, absPath);
  if (!relPath || relPath.startsWith('..')) return null;
  return { projectId: best.projectId, relPath };
}

/** Find or create the folder chain (under a project) for a list of path segments. */
function ensureFolderChain(projectId, folderSegs, deps) {
  const db = deps.database.getDB();
  const now = Date.now();
  let parentId = null;
  let currentRel = '';
  for (const seg of folderSegs) {
    currentRel = currentRel ? `${currentRel}/${seg}` : seg;
    let folder = db
      .prepare("SELECT id, title, vault_path FROM resources WHERE type='folder' AND project_id=? AND vault_path=?")
      .get(projectId, currentRel);
    if (!folder) {
      const fid = crypto.randomUUID();
      db.prepare(
        'INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, vault_path, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ).run(fid, projectId, 'folder', seg, null, null, parentId, currentRel, null, now, now);
      deps.windowManager.broadcast('resource:created', {
        id: fid, type: 'folder', project_id: projectId, folder_id: parentId, title: seg, vault_path: currentRel,
      });
      folder = { id: fid };
    } else if (folder.title !== seg) {
      db.prepare('UPDATE resources SET title = ?, updated_at = ? WHERE id = ?').run(seg, now, folder.id);
    }
    parentId = folder.id;
  }
  return parentId;
}

/** Best-effort thumbnail + text extraction for a freshly-imported binary. */
async function enrichImportedFile(id, absPath, type, mime, deps) {
  try {
    const thumbnail = require('../documents/thumbnail.cjs');
    const db = deps.database.getDB();
    try {
      const thumb = await thumbnail.generateThumbnail(absPath, type, mime);
      if (thumb) db.prepare('UPDATE resources SET thumbnail_data = ? WHERE id = ?').run(thumb, id);
    } catch { /* non-fatal */ }
    let text = null;
    try {
      const extractor = require('../documents/document-extractor.cjs');
      if (type === 'document' || type === 'excel' || type === 'ppt') {
        text = await extractor.extractDocumentText(absPath, mime);
      } else if (type === 'pdf' || (mime || '').includes('pdf')) {
        text = await extractor.extractTextFromPDF(absPath, 50000);
      }
    } catch { /* non-fatal */ }
    if (text) {
      db.prepare('UPDATE resources SET content = ?, content_text = ? WHERE id = ?').run(text, text, id);
    }
    try { deps.semanticIndexScheduler.scheduleSemanticReindex?.(id); } catch { /* */ }
  } catch (err) {
    console.warn('[VaultWatcher] enrich failed:', err.message);
  }
}

/** Import an unknown external `.md` as a new note. */
function importExternalNote(raw, ctx, deps) {
  const { database, semanticIndexScheduler, windowManager } = deps;
  const db = database.getDB();
  const segments = ctx.relPath.split('/').filter(Boolean);
  if (segments.length === 0) return;
  const folderId = ensureFolderChain(ctx.projectId, segments.slice(0, -1), deps);

  let noteId = vaultStore.parseFrontmatterId(raw);
  if (!noteId || !/^[\w-]+$/.test(noteId) || db.prepare('SELECT id FROM resources WHERE id=?').get(noteId)) {
    noteId = crypto.randomUUID();
  }
  const fileBase = segments[segments.length - 1].replace(/\.md$/i, '');
  const title = (vaultStore.parseFrontmatterTitle(raw) || fileBase || 'Untitled').trim();
  const text = vaultStore.markdownToPlainText(vaultStore.stripFrontmatter(raw));
  const hash = vaultStore.contentHash(raw);
  const now = Date.now();
  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, vault_path, content_text, content_hash, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(noteId, ctx.projectId, 'note', title, null, null, folderId, ctx.relPath, text, hash, null, now, now);
  try { semanticIndexScheduler.scheduleSemanticReindex?.(noteId); } catch { /* */ }
  windowManager.broadcast('resource:created', {
    id: noteId, type: 'note', project_id: ctx.projectId, folder_id: folderId, title, vault_path: ctx.relPath,
  });
  console.log('[VaultWatcher] imported external note:', ctx.relPath);
}

/** Import an unknown external binary file as a resource of its classified type. */
function importExternalBinary(absPath, buf, ext, ctx, deps) {
  const { database, fileStorage, windowManager } = deps;
  const db = database.getDB();
  const segments = ctx.relPath.split('/').filter(Boolean);
  if (segments.length === 0) return;
  const folderId = ensureFolderChain(ctx.projectId, segments.slice(0, -1), deps);
  const filename = segments[segments.length - 1];
  const type = fileStorage.classifyFileType(ext, 'document');
  const mime = fileStorage.getMimeType(ext);
  const hash = vaultStore.contentHash(buf);
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, content, file_path, internal_path, file_mime_type, file_size, file_hash, original_filename, folder_id, vault_path, content_hash, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(id, ctx.projectId, type, filename, null, null, null, mime, buf.length, hash, filename, folderId, ctx.relPath, hash, null, now, now);
  windowManager.broadcast('resource:created', {
    id, type, project_id: ctx.projectId, folder_id: folderId, title: filename, vault_path: ctx.relPath,
  });
  void enrichImportedFile(id, absPath, type, mime, deps);
  console.log('[VaultWatcher] imported external file:', ctx.relPath);
}

/** Import an unknown external `.url` (InternetShortcut) file as a url resource. */
function importExternalUrlFile(raw, ctx, deps) {
  const { database, windowManager } = deps;
  const url = vaultStore.parseUrlFile(raw);
  if (!url) return false;
  const db = database.getDB();
  const segments = ctx.relPath.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  const folderId = ensureFolderChain(ctx.projectId, segments.slice(0, -1), deps);
  const title = segments[segments.length - 1].replace(/\.url$/i, '') || url;
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, vault_path, content_text, content_hash, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(id, ctx.projectId, 'url', title, url, null, folderId, ctx.relPath, url, vaultStore.contentHash(raw), null, now, now);
  windowManager.broadcast('resource:created', {
    id, type: 'url', project_id: ctx.projectId, folder_id: folderId, title, vault_path: ctx.relPath,
  });
  console.log('[VaultWatcher] imported external url:', ctx.relPath);
  return true;
}

/** Import an unknown external `.dnb` (Dome notebook JSON) file as a notebook. */
function importExternalNotebook(raw, ctx, deps) {
  const { database, windowManager } = deps;
  let cells;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cells)) return false;
    cells = parsed;
  } catch {
    return false;
  }
  const db = database.getDB();
  const segments = ctx.relPath.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  const folderId = ensureFolderChain(ctx.projectId, segments.slice(0, -1), deps);
  const title = segments[segments.length - 1].replace(/\.dnb$/i, '') || 'Untitled Notebook';
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, vault_path, content_hash, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(id, ctx.projectId, 'notebook', title, JSON.stringify(cells), null, folderId, ctx.relPath, vaultStore.contentHash(raw), null, now, now);
  windowManager.broadcast('resource:created', {
    id, type: 'notebook', project_id: ctx.projectId, folder_id: folderId, title, vault_path: ctx.relPath,
  });
  console.log('[VaultWatcher] imported external notebook:', ctx.relPath);
  return true;
}

/** Import an unknown external Dome artifact HTML as a persisted artifact resource. */
function importExternalArtifact(raw, ctx, deps) {
  const { database, semanticIndexScheduler, windowManager } = deps;
  const parsed = vaultStore.parseArtifactHtmlDocument(raw);
  if (!parsed) return;

  const db = database.getDB();
  const queries = database.getQueries();
  const segments = ctx.relPath.split('/').filter(Boolean);
  if (segments.length === 0) return;
  const folderId = ensureFolderChain(ctx.projectId, segments.slice(0, -1), deps);
  const fileBase = segments[segments.length - 1].replace(/\.html$/i, '');

  let resourceId = parsed.resourceId;
  if (!resourceId || !/^[\w-]+$/.test(resourceId) || db.prepare('SELECT id FROM resources WHERE id=?').get(resourceId)) {
    resourceId = crypto.randomUUID();
  }
  const title = fileBase || 'Untitled Artifact';
  const hash = vaultStore.contentHash(raw);
  const now = Date.now();
  const state = {
    html: parsed.html,
    css: parsed.css,
    data: parsed.data,
    ...(parsed.linkedData ? { linkedData: parsed.linkedData } : {}),
  };

  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, vault_path, content_text, content_hash, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    resourceId,
    ctx.projectId,
    'artifact',
    title,
    null,
    null,
    folderId,
    ctx.relPath,
    vaultStore.markdownToPlainText(parsed.html),
    hash,
    null,
    now,
    now,
  );

  const artifactId = crypto.randomUUID();
  queries.createArtifact.run(
    artifactId,
    resourceId,
    parsed.artifactType || 'custom',
    null,
    JSON.stringify(state),
    parsed.linkedResourceId,
    now,
    now,
  );

  try { semanticIndexScheduler.scheduleSemanticReindex?.(resourceId); } catch { /* */ }
  windowManager.broadcast('resource:created', {
    id: resourceId,
    type: 'artifact',
    project_id: ctx.projectId,
    folder_id: folderId,
    title,
    vault_path: ctx.relPath,
  });
  console.log('[VaultWatcher] imported external artifact:', ctx.relPath);
}

function reconcileExternalArtifactEdit(row, raw, ctx, hash, deps) {
  const { database, semanticIndexScheduler, windowManager } = deps;
  const parsed = vaultStore.parseArtifactHtmlDocument(raw);
  if (!parsed) return false;

  const db = database.getDB();
  const queries = database.getQueries();
  const now = Date.now();
  const nextState = {
    html: parsed.html,
    css: parsed.css,
    data: parsed.data,
    ...(parsed.linkedData ? { linkedData: parsed.linkedData } : {}),
  };
  queries.updateArtifactState.run(JSON.stringify(nextState), now, row.id);
  const artifact = queries.getArtifactByResourceId.get(row.id);
  if (artifact && parsed.linkedResourceId !== (artifact.linked_resource_id ?? null)) {
    db.prepare(
      'UPDATE artifacts SET linked_resource_id = ?, version = version + 1, updated_at = ? WHERE resource_id = ?',
    ).run(parsed.linkedResourceId, now, row.id);
  }
  db.prepare(
    'UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ?, updated_at = ? WHERE id = ?',
  ).run(ctx.relPath, vaultStore.markdownToPlainText(parsed.html), hash, now, row.id);
  try { semanticIndexScheduler.scheduleSemanticReindex?.(row.id); } catch { /* */ }
  try {
    const updated = queries.getArtifactByResourceId.get(row.id);
    const resource = queries.getResourceById.get(row.id);
    const { serializeArtifactRecord } = require('../artifacts/artifact-serialize.cjs');
    const serialized = serializeArtifactRecord(updated, resource, queries);
    windowManager.broadcast('artifact:updated', serialized);
    windowManager.broadcast('resource:updated', { id: row.id, updates: { updated_at: now }, fromVault: true });
  } catch { /* */ }
  console.log('[VaultWatcher] external artifact edit reconciled:', ctx.relPath);
  return true;
}

function handleChange(absPath, deps) {
  if (/\.dome([/\\]|$)/.test(absPath)) return;

  const { database, semanticIndexScheduler, windowManager } = deps;
  const ext = path.extname(absPath).toLowerCase();
  const isMd = ext === '.md';
  const isHtml = ext === '.html';
  let buf;
  try { buf = fs.readFileSync(absPath); } catch { return; }
  const hash = vaultStore.contentHash(buf);
  if (vaultStore.isSelfWrite(absPath, hash)) return;

  const ctx = resolvePathContext(absPath, deps);
  if (!ctx) return;
  const db = database.getDB();
  const rawText = buf.toString('utf8');
  const isArtifactHtml = isHtml && vaultStore.isDomeArtifactHtml(rawText);

  const row = findExistingResourceRow(db, ctx, isMd, isArtifactHtml, rawText);
  if (!row) {
    importByExtension(absPath, buf, ext, isMd, isArtifactHtml, rawText, ctx, deps);
    return;
  }

  if (row.content_hash === hash) {
    if (row.vault_path !== ctx.relPath) db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(ctx.relPath, row.id);
    return;
  }

  const now = Date.now();
  if (!applyResourceUpdate(row, absPath, buf, ext, isMd, isArtifactHtml, rawText, ctx, hash, deps, now)) return;
  try { semanticIndexScheduler.scheduleSemanticReindex?.(row.id); } catch { /* */ }
  try { windowManager.broadcast('resource:updated', { id: row.id, updates: { updated_at: now }, fromVault: true }); } catch { /* */ }
  console.log('[VaultWatcher] external edit reconciled:', ctx.relPath);
}

/** Resolve an existing row via vault_path first, then frontmatter id / artifact resourceId. */
function findExistingResourceRow(db, ctx, isMd, isArtifactHtml, rawText) {
  let row = db
    .prepare('SELECT id, type, content_hash, vault_path FROM resources WHERE project_id = ? AND vault_path = ?')
    .get(ctx.projectId, ctx.relPath);
  if (!row && isMd) {
    const fid = vaultStore.parseFrontmatterId(rawText);
    if (fid) {
      row = db.prepare("SELECT id, type, content_hash, vault_path FROM resources WHERE id = ? AND type = 'note'").get(fid);
    }
  }
  if (!row && isArtifactHtml) {
    const parsed = vaultStore.parseArtifactHtmlDocument(rawText);
    if (parsed?.resourceId) {
      row = db.prepare("SELECT id, type, content_hash, vault_path FROM resources WHERE id = ? AND type = 'artifact'").get(parsed.resourceId);
    }
  }
  return row;
}

/** Dispatch a freshly-discovered file to its typed importer. */
function importByExtension(absPath, buf, ext, isMd, isArtifactHtml, rawText, ctx, deps) {
  if (isMd) { importExternalNote(rawText, ctx, deps); return; }
  if (isArtifactHtml) { importExternalArtifact(rawText, ctx, deps); return; }
  if (ext === '.url' && importExternalUrlFile(rawText, ctx, deps)) return;
  if (ext === '.dnb' && importExternalNotebook(rawText, ctx, deps)) return;
  importExternalBinary(absPath, buf, ext, ctx, deps);
}

/** Apply an external edit to the row that already exists. Returns false when no broadcast should happen. */
function applyResourceUpdate(row, absPath, buf, ext, isMd, isArtifactHtml, rawText, ctx, hash, deps, now) {
  const db = deps.database.getDB();
  if (isMd) {
    applyNoteUpdate(db, row, ctx, rawText, hash, now);
    return true;
  }
  if (row.type === 'url' && ext === '.url') return applyUrlUpdate(db, row, ctx, rawText, hash, now);
  if (row.type === 'notebook' && ext === '.dnb') return applyNotebookUpdate(db, row, ctx, rawText, hash, now);
  if (row.type === 'artifact' || isArtifactHtml) return !reconcileExternalArtifactEdit(row, rawText, ctx, hash, deps);
  applyBinaryUpdate(db, row, ctx, absPath, buf, ext, hash, deps, now);
  return true;
}

function applyNoteUpdate(db, row, ctx, rawText, hash, now) {
  const text = vaultStore.markdownToPlainText(vaultStore.stripFrontmatter(rawText));
  db.prepare('UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ?, updated_at = ? WHERE id = ?')
    .run(ctx.relPath, text, hash, now, row.id);
}

function applyUrlUpdate(db, row, ctx, rawText, hash, now) {
  const url = vaultStore.parseUrlFile(rawText);
  if (!url) return false;
  db.prepare('UPDATE resources SET vault_path = ?, content = ?, content_text = ?, content_hash = ?, updated_at = ? WHERE id = ?')
    .run(ctx.relPath, url, url, hash, now, row.id);
  return true;
}

function applyNotebookUpdate(db, row, ctx, rawText, hash, now) {
  let parsed;
  try { parsed = JSON.parse(rawText); } catch { return false; }
  if (!parsed || !Array.isArray(parsed.cells)) return false;
  db.prepare('UPDATE resources SET vault_path = ?, content = ?, content_hash = ?, updated_at = ? WHERE id = ?')
    .run(ctx.relPath, JSON.stringify(parsed), hash, now, row.id);
  return true;
}

function applyBinaryUpdate(db, row, ctx, absPath, buf, ext, hash, deps, now) {
  db.prepare('UPDATE resources SET vault_path = ?, content_hash = ?, file_size = ?, updated_at = ? WHERE id = ?')
    .run(ctx.relPath, hash, buf.length, now, row.id);
  void enrichImportedFile(row.id, absPath, row.type, deps.fileStorage.getMimeType(ext), deps);
}

function handleUnlinkDir(absPath, deps) {
  const { database, windowManager } = deps;
  // Directory removals performed by Dome itself (folder delete, empty-dir
  // pruning) are marked as self-writes — never reconcile those as external.
  if (vaultStore.isSelfWrite(absPath, null)) return;
  if (_pendingDirUnlinks.has(absPath)) clearTimeout(_pendingDirUnlinks.get(absPath));
  _pendingDirUnlinks.set(absPath, setTimeout(() => {
    _pendingDirUnlinks.delete(absPath);
    try {
      const ctx = resolvePathContext(absPath, deps);
      if (!ctx || !ctx.relPath) return;
      if (fs.existsSync(absPath)) return;
      const db = database.getDB();
      const row = db
        .prepare("SELECT id FROM resources WHERE project_id = ? AND vault_path = ? AND type = 'folder'")
        .get(ctx.projectId, ctx.relPath);
      if (!row) return;
      database.getQueries().deleteResource.run(row.id);
      windowManager.broadcast('resource:deleted', { id: row.id, fromVault: true });
      console.log('[VaultWatcher] external folder delete reconciled:', ctx.relPath);
    } catch (err) {
      console.warn('[VaultWatcher] unlinkDir reconcile failed:', err.message);
    }
  }, UNLINK_DEBOUNCE_MS));
}

function handleAddDir(absPath, deps) {
  try {
    const ctx = resolvePathContext(absPath, deps);
    if (!ctx || !ctx.relPath) return;
    const db = deps.database.getDB();
    const existing = db
      .prepare("SELECT id, vault_path FROM resources WHERE project_id = ? AND vault_path = ? AND type = 'folder'")
      .get(ctx.projectId, ctx.relPath);
    if (existing) return;
    // External rename: folder row still points at old path that no longer exists on disk.
    const parentRel = ctx.relPath.includes('/') ? ctx.relPath.slice(0, ctx.relPath.lastIndexOf('/')) : '';
    const parentId = parentRel
      ? db.prepare("SELECT id FROM resources WHERE project_id = ? AND vault_path = ? AND type = 'folder'").get(ctx.projectId, parentRel)?.id ?? null
      : null;
    const stale = db
      .prepare(
        parentId
          ? "SELECT id, vault_path FROM resources WHERE project_id = ? AND type = 'folder' AND folder_id = ? AND vault_path != ?"
          : "SELECT id, vault_path FROM resources WHERE project_id = ? AND type = 'folder' AND folder_id IS NULL AND vault_path != ?",
      )
      .all(...(parentId ? [ctx.projectId, parentId, ctx.relPath] : [ctx.projectId, ctx.relPath]));
    for (const s of stale) {
      const oldAbs = path.join(
        vaultStore.getProjectVaultRoot(ctx.projectId, deps.database.getQueries(), deps.fileStorage),
        s.vault_path,
      );
      if (fs.existsSync(oldAbs)) continue;
      const title = path.posix.basename(ctx.relPath);
      const now = Date.now();
      const oldPrefix = `${s.vault_path}/`;
      const newPrefix = `${ctx.relPath}/`;
      db.prepare('UPDATE resources SET title = ?, vault_path = ?, folder_id = ?, updated_at = ? WHERE id = ?')
        .run(title, ctx.relPath, parentId, now, s.id);
      const descendants = db
        .prepare("SELECT id, vault_path FROM resources WHERE project_id = ? AND vault_path LIKE ? ESCAPE '\\'")
        .all(ctx.projectId, `${s.vault_path}/%`);
      for (const d of descendants) {
        if (!d.vault_path.startsWith(oldPrefix)) continue;
        db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?')
          .run(newPrefix + d.vault_path.slice(oldPrefix.length), d.id);
      }
      deps.windowManager.broadcast('resource:updated', {
        id: s.id,
        updates: { title, vault_path: ctx.relPath, folder_id: parentId, updated_at: now },
        fromVault: true,
      });
      console.log('[VaultWatcher] external folder rename reconciled:', s.vault_path, '->', ctx.relPath);
      return;
    }
    ensureFolderChain(ctx.projectId, ctx.relPath.split('/').filter(Boolean), deps);
  } catch (err) {
    console.warn('[VaultWatcher] addDir failed:', err.message);
  }
}

function handleUnlink(absPath, deps) {
  const { database, windowManager } = deps;
  // File removals performed by Dome itself are marked as self-writes.
  if (vaultStore.isSelfWrite(absPath, null)) return;
  if (_pendingUnlinks.has(absPath)) clearTimeout(_pendingUnlinks.get(absPath));
  _pendingUnlinks.set(absPath, setTimeout(() => {
    _pendingUnlinks.delete(absPath);
    try {
      const ctx = resolvePathContext(absPath, deps);
      if (!ctx) return;
      const db = database.getDB();
      const row = db.prepare("SELECT id FROM resources WHERE project_id = ? AND vault_path = ? AND type != 'folder'").get(ctx.projectId, ctx.relPath);
      if (!row) return;                 // reassigned (moved) or already deleted
      if (fs.existsSync(absPath)) return; // came back (atomic external save)
      database.getQueries().deleteResource.run(row.id);
      windowManager.broadcast('resource:deleted', { id: row.id, fromVault: true });
      console.log('[VaultWatcher] external delete reconciled:', ctx.relPath);
    } catch (err) {
      console.warn('[VaultWatcher] unlink reconcile failed:', err.message);
    }
  }, UNLINK_DEBOUNCE_MS));
}

/** Walk a directory tree and import any file/folder not already known. */
function scanRoot(rootAbs, deps) {
  const stack = [rootAbs];
  while (stack.length) {
    const dir = stack.pop();
    const entries = readDirEntriesSafe(dir);
    if (!entries) continue;
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.endsWith('.dome')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { handleAddDir(abs, deps); stack.push(abs); continue; }
      scanImportUnknownFile(abs, deps);
    }
  }
}

function readDirEntriesSafe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
}

/** Resolve, lookup and dispatch a single file during the initial scanRoot walk. */
function scanImportUnknownFile(abs, deps) {
  if (/\.dome([/\\]|$)/.test(abs)) return;
  const ctx = resolvePathContext(abs, deps);
  if (!ctx) return;
  const db = deps.database.getDB();
  const known = db.prepare('SELECT id FROM resources WHERE project_id = ? AND vault_path = ?').get(ctx.projectId, ctx.relPath);
  if (known) return;
  let buf;
  try { buf = fs.readFileSync(abs); } catch { return; }
  const ext = path.extname(abs).toLowerCase();
  dispatchScanImport(abs, buf, ext, ctx, deps);
}

function dispatchScanImport(abs, buf, ext, ctx, deps) {
  const handlers = {
    '.md': { run: () => importScanNote(buf, ctx, deps), label: 'note' },
    '.html': { run: () => importScanHtmlArtifact(buf, ctx, deps), label: 'artifact' },
    '.url': { run: () => importScanUrl(abs, buf, ext, ctx, deps), label: 'url' },
    '.dnb': { run: () => importScanNotebook(abs, buf, ext, ctx, deps), label: 'notebook' },
  };
  const cfg = handlers[ext];
  if (cfg) {
    try { cfg.run(); }
    catch (err) { console.warn(`[VaultWatcher] scan ${cfg.label} import failed:`, err.message); }
    return;
  }
  try { importExternalBinary(abs, buf, ext, ctx, deps); }
  catch (err) { console.warn('[VaultWatcher] scan file import failed:', err.message); }
}

function importScanNote(buf, ctx, deps) {
  const raw = buf.toString('utf8');
  const fid = vaultStore.parseFrontmatterId(raw);
  if (fid && deps.database.getDB().prepare('SELECT id FROM resources WHERE id=?').get(fid)) return;
  importExternalNote(raw, ctx, deps);
}

function importScanHtmlArtifact(buf, ctx, deps) {
  if (!vaultStore.isDomeArtifactHtml(buf.toString('utf8'))) return;
  importExternalArtifact(buf.toString('utf8'), ctx, deps);
}

function importScanUrl(abs, buf, ext, ctx, deps) {
  const raw = buf.toString('utf8');
  if (!importExternalUrlFile(raw, ctx, deps)) importExternalBinary(abs, buf, ext, ctx, deps);
}

function importScanNotebook(abs, buf, ext, ctx, deps) {
  const raw = buf.toString('utf8');
  if (!importExternalNotebook(raw, ctx, deps)) importExternalBinary(abs, buf, ext, ctx, deps);
}

function watchTargets(deps) {
  const defaultDir = vaultStore.getDefaultVaultDir(deps.fileStorage);
  const targets = new Set([defaultDir]);
  try {
    for (const r of vaultStore.getProjectRoots(deps.database.getQueries(), deps.fileStorage)) {
      if (!r.root.startsWith(defaultDir)) targets.add(r.root);
    }
  } catch { /* */ }
  return [...targets];
}

function start(deps) {
  if (_watcher) return;
  _deps = deps;
  let chokidar;
  try { chokidar = require('chokidar'); } catch (err) {
    console.warn('[VaultWatcher] chokidar unavailable:', err.message);
    return;
  }
  const targets = watchTargets(deps);
  for (const t of targets) {
    try { if (!fs.existsSync(t)) fs.mkdirSync(t, { recursive: true }); } catch { /* */ }
  }

  _watcher = chokidar.watch(targets, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    depth: 20,
  });
  _watcher
    .on('add', (p) => handleChange(p, deps))
    .on('change', (p) => handleChange(p, deps))
    .on('addDir', (p) => handleAddDir(p, deps))
    .on('unlink', (p) => handleUnlink(p, deps))
    .on('unlinkDir', (p) => handleUnlinkDir(p, deps))
    .on('error', (err) => console.warn('[VaultWatcher] error:', err?.message || err));

  console.log('[VaultWatcher] watching', targets.join(', '));

  setTimeout(() => {
    try { for (const t of targets) scanRoot(t, deps); } catch (err) { console.warn('[VaultWatcher] scan failed:', err.message); }
  }, 4000);
}

function addRoot(absPath) {
  try {
    if (_watcher && absPath) {
      if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });
      _watcher.add(absPath);
      if (_deps) setTimeout(() => { try { scanRoot(absPath, _deps); } catch { /* */ } }, 1000);
    }
  } catch (err) { console.warn('[VaultWatcher] addRoot failed:', err.message); }
}

function stop() {
  if (_watcher) { try { _watcher.close(); } catch { /* */ } _watcher = null; }
  for (const t of _pendingUnlinks.values()) clearTimeout(t);
  _pendingUnlinks.clear();
  for (const t of _pendingDirUnlinks.values()) clearTimeout(t);
  _pendingDirUnlinks.clear();
  _deps = null;
}

module.exports = { start, stop, addRoot };
