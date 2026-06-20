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

/** Find or create the folder chain (under a project) for a list of segments. */
function ensureFolderChain(projectId, folderSegs, deps) {
  const db = deps.database.getDB();
  const now = Date.now();
  let parentId = null;
  for (const seg of folderSegs) {
    const candidates = db
      .prepare(
        parentId
          ? "SELECT id, title FROM resources WHERE type='folder' AND project_id=? AND folder_id=?"
          : "SELECT id, title FROM resources WHERE type='folder' AND project_id=? AND folder_id IS NULL",
      )
      .all(...(parentId ? [projectId, parentId] : [projectId]));
    let folder = candidates.find((c) => vaultStore.sanitizeSegment(c.title || '', 'Folder') === seg);
    if (!folder) {
      const fid = crypto.randomUUID();
      db.prepare(
        'INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(fid, projectId, 'folder', seg, null, null, parentId, null, now, now);
      deps.windowManager.broadcast('resource:created', {
        id: fid, type: 'folder', project_id: projectId, folder_id: parentId, title: seg,
      });
      folder = { id: fid };
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

function handleChange(absPath, deps) {
  const { database, semanticIndexScheduler, windowManager } = deps;
  const ext = path.extname(absPath).toLowerCase();
  const isMd = ext === '.md';
  let buf;
  try { buf = fs.readFileSync(absPath); } catch { return; }
  const hash = vaultStore.contentHash(buf);
  if (vaultStore.isSelfWrite(absPath, hash)) return;

  const ctx = resolvePathContext(absPath, deps);
  if (!ctx) return;
  const db = database.getDB();

  let row = db.prepare('SELECT id, type, content_hash, vault_path FROM resources WHERE project_id = ? AND vault_path = ?').get(ctx.projectId, ctx.relPath);
  if (!row && isMd) {
    const fid = vaultStore.parseFrontmatterId(buf.toString('utf8'));
    if (fid) {
      const byId = db.prepare("SELECT id, type, content_hash, vault_path FROM resources WHERE id = ? AND type = 'note'").get(fid);
      if (byId) row = byId;
    }
  }
  if (!row) {
    if (isMd) importExternalNote(buf.toString('utf8'), ctx, deps);
    else importExternalBinary(absPath, buf, ext, ctx, deps);
    return;
  }

  if (row.content_hash === hash) {
    if (row.vault_path !== ctx.relPath) db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(ctx.relPath, row.id);
    return;
  }

  const now = Date.now();
  if (isMd) {
    const text = vaultStore.markdownToPlainText(vaultStore.stripFrontmatter(buf.toString('utf8')));
    db.prepare('UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ?, updated_at = ? WHERE id = ?')
      .run(ctx.relPath, text, hash, now, row.id);
  } else {
    db.prepare('UPDATE resources SET vault_path = ?, content_hash = ?, file_size = ?, updated_at = ? WHERE id = ?')
      .run(ctx.relPath, hash, buf.length, now, row.id);
    void enrichImportedFile(row.id, absPath, row.type, deps.fileStorage.getMimeType(ext), deps);
  }
  try { semanticIndexScheduler.scheduleSemanticReindex?.(row.id); } catch { /* */ }
  try { windowManager.broadcast('resource:updated', { id: row.id, updates: { updated_at: now }, fromVault: true }); } catch { /* */ }
  console.log('[VaultWatcher] external edit reconciled:', ctx.relPath);
}

function handleAddDir(absPath, deps) {
  try {
    const ctx = resolvePathContext(absPath, deps);
    if (!ctx || !ctx.relPath) return;
    ensureFolderChain(ctx.projectId, ctx.relPath.split('/').filter(Boolean), deps);
  } catch (err) {
    console.warn('[VaultWatcher] addDir failed:', err.message);
  }
}

function handleUnlink(absPath, deps) {
  const { database, windowManager } = deps;
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
  const db = deps.database.getDB();
  const stack = [rootAbs];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { handleAddDir(abs, deps); stack.push(abs); continue; }
      const ctx = resolvePathContext(abs, deps);
      if (!ctx) continue;
      const known = db.prepare('SELECT id FROM resources WHERE project_id = ? AND vault_path = ?').get(ctx.projectId, ctx.relPath);
      if (known) continue;
      const ext = path.extname(abs).toLowerCase();
      let buf;
      try { buf = fs.readFileSync(abs); } catch { continue; }
      if (ext === '.md') {
        const raw = buf.toString('utf8');
        const fid = vaultStore.parseFrontmatterId(raw);
        if (fid && db.prepare('SELECT id FROM resources WHERE id=?').get(fid)) continue;
        try { importExternalNote(raw, ctx, deps); } catch (err) { console.warn('[VaultWatcher] scan note import failed:', err.message); }
      } else {
        try { importExternalBinary(abs, buf, ext, ctx, deps); } catch (err) { console.warn('[VaultWatcher] scan file import failed:', err.message); }
      }
    }
  }
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
  _deps = null;
}

module.exports = { start, stop, addRoot };
