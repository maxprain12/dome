/* eslint-disable no-console */
/**
 * Vault Store - Main Process
 *
 * Mirrors each note to a human-readable Markdown file inside its project's vault
 * root, keeping the folder tree on disk in sync with the virtual folder tree in
 * SQLite. The `.md` is the portable source of truth; SQLite holds metadata +
 * caches (`content_text` for search, `content_hash` to detect external edits,
 * `vault_path` = the note's path RELATIVE TO ITS PROJECT'S VAULT ROOT).
 *
 * Each project has a vault root:
 *   - custom: `projects.vault_root` (an absolute directory the user picked).
 *   - default: `dome-files/vault/<sanitized project name>`.
 * So a note's absolute path = projectVaultRoot(project) + '/' + vault_path.
 *
 * Tiptap → Markdown conversion is done in the renderer (Turndown needs a DOM);
 * the main process only handles already-serialized Markdown + plain-text. A
 * self-write registry lets the file watcher tell our own writes apart from
 * external edits without reacting to them.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const VAULT_DIR = 'vault';
const MD_EXT = '.md';

/** Characters illegal on Windows/macOS filesystems, plus control chars. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?* -]/g;
const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_SEGMENT_LEN = 120;

// ── Self-write registry ──────────────────────────────────────────────────────
const _selfWrites = new Map();
const SELF_WRITE_TTL_MS = 8000;

function markSelfWrite(absPath, hash) {
  _selfWrites.set(absPath, { hash, expires: Date.now() + SELF_WRITE_TTL_MS });
}

/** True if an fs event on absPath (with the given hash) was caused by us. */
function isSelfWrite(absPath, hash) {
  const entry = _selfWrites.get(absPath);
  if (!entry) return false;
  if (entry.expires < Date.now()) {
    _selfWrites.delete(absPath);
    return false;
  }
  if (entry.hash === null || entry.hash === hash) {
    _selfWrites.delete(absPath);
    return true;
  }
  return false;
}

// ── Names / paths ────────────────────────────────────────────────────────────

/**
 * Sanitize a single path segment (folder or file base name) so it is safe on
 * all platforms. Never returns an empty string.
 */
function sanitizeSegment(name, fallback = 'Untitled') {
  let out = String(name || '')
    .replace(ILLEGAL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!out) out = fallback;
  if (RESERVED_WIN.test(out)) out = `_${out}`;
  if (out.length > MAX_SEGMENT_LEN) out = out.slice(0, MAX_SEGMENT_LEN).trim();
  return out;
}

/** Default vault root for all projects without a custom root (dome-files/vault). */
function getDefaultVaultDir(fileStorage) {
  return path.join(fileStorage.getStorageDir(), VAULT_DIR);
}

/** Back-compat alias used by the watcher to cover all default-root projects. */
function getVaultDir(fileStorage) {
  return getDefaultVaultDir(fileStorage);
}

/**
 * Absolute vault root for a project: its custom `vault_root` if set, else
 * `dome-files/vault/<sanitized project name>`.
 */
async function getProjectVaultRoot(projectId, queries, fileStorage) {
  let project = null;
  try { project = await queries.getProjectById.get(projectId); } catch { /* */ }
  const custom = project && typeof project.vault_root === 'string' ? project.vault_root.trim() : '';
  if (custom) return custom;
  return path.join(getDefaultVaultDir(fileStorage), sanitizeSegment(project?.name || 'Library', 'Library'));
}

/** List every project's vault root (for the watcher to know where to look). */
async function getProjectRoots(queries, fileStorage) {
  const out = [];
  let projects = [];
  try { projects = await queries.getProjects.all(); } catch { /* */ }
  for (const p of projects) {
    out.push({ projectId: p.id, projectName: p.name, root: await getProjectVaultRoot(p.id, queries, fileStorage) });
  }
  return out;
}

/** Project-relative folder directory (POSIX) for a resource ('' at root). */
async function resolveFolderDir(resource, queries) {
  const segments = [];
  const visited = new Set();
  let folderId = resource.folder_id || null;
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = await queries.getResourceById.get(folderId);
    if (!folder || folder.type !== 'folder') break;
    segments.unshift(sanitizeSegment(folder.title, 'Folder'));
    folderId = folder.folder_id || null;
  }
  return segments.join('/');
}

/** Sanitize a filename while preserving its extension. */
function sanitizeFilename(name, fallback = 'file') {
  const raw = String(name || '');
  const ext = path.extname(raw);
  const base = sanitizeSegment(path.basename(raw, ext), fallback);
  const safeExt = ext.replace(/[^.\w]/g, '');
  return `${base}${safeExt}`;
}

/**
 * Project-relative path (POSIX, stored in vault_path) for any file-backed
 * resource: its folder chain + filename. Notes use `<title>.md`; other types
 * use the provided filename (import) or keep their current basename (relocate).
 */
async function buildRelPath(resource, queries, filename) {
  const dir = await resolveFolderDir(resource, queries);
  let file;
  if (resource.type === 'note') {
    file = `${sanitizeSegment(resource.title, 'Untitled')}${MD_EXT}`;
  } else {
    const fromExisting = resource.vault_path ? path.posix.basename(resource.vault_path) : null;
    file = sanitizeFilename(filename || fromExisting || resource.original_filename || sanitizeSegment(resource.title, 'file'), 'file');
  }
  return dir ? `${dir}/${file}` : file;
}

/** Notes-only convenience (title-based `.md` path). */
async function resolveRelPath(resource, queries) {
  return await buildRelPath(resource, queries, null);
}

/** Resolve the absolute on-disk path of a resource's file (vault or legacy). */
async function getResourceFilePath(resource, queries, fileStorage) {
  if (!resource) return null;
  if (resource.vault_path) {
    return path.join(await getProjectVaultRoot(resource.project_id, queries, fileStorage), resource.vault_path);
  }
  if (resource.internal_path) return fileStorage.getFullPath(resource.internal_path);
  if (resource.file_path) return resource.file_path;
  return null;
}

/**
 * Copy an external file into the project's vault at its logical path. Used when
 * importing a file from outside the vault (drag-drop, downloads). Returns the
 * project-relative vault_path + file metadata.
 * @returns {{ vaultPath: string, mimeType: string, size: number, contentHash: string }}
 */
async function importFileToVault(srcPath, resource, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const root = await getProjectVaultRoot(resource.project_id, queries, fileStorage);
  const filename = sanitizeFilename(path.basename(srcPath), 'file');
  const relPath = await ensureUniqueRelPath(await buildRelPath(resource, queries, filename), resource, db);
  const abs = path.join(root, relPath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buf = fs.readFileSync(srcPath);
  const hash = contentHash(buf);
  markSelfWrite(abs, hash);
  fs.writeFileSync(abs, buf);
  return {
    vaultPath: relPath,
    absPath: abs,
    mimeType: fileStorage.getMimeType(path.extname(srcPath)),
    size: buf.length,
    contentHash: hash,
  };
}

/** Ensure the relative path is unique within the project; else suffix an id. */
async function ensureUniqueRelPath(desiredRel, resource, db) {
  const owner = await db.get(
    'SELECT id FROM resources WHERE project_id = ? AND vault_path = ? LIMIT 1',
    [resource.project_id, desiredRel],
  );
  if (!owner || owner.id === resource.id) return desiredRel;
  const dir = path.posix.dirname(desiredRel);
  const ext = path.posix.extname(desiredRel);
  const base = path.posix.basename(desiredRel, ext);
  const shortId = String(resource.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'dup';
  const suffixed = `${base} (${shortId})${ext}`;
  return dir === '.' ? suffixed : `${dir}/${suffixed}`;
}

/** Absolute path of a note's mirror, resolving its project vault root. */
async function vaultAbsPathForResource(resource, queries, fileStorage) {
  if (!resource?.vault_path) return null;
  return path.join(await getProjectVaultRoot(resource.project_id, queries, fileStorage), resource.vault_path);
}

// ── Disk primitives ──────────────────────────────────────────────────────────

/** Write a file atomically (temp in same dir + rename), marking it self-written. */
function atomicWrite(fullPath, contents) {
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(fullPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, contents, 'utf8');
  markSelfWrite(fullPath, contentHash(contents));
  fs.renameSync(tmp, fullPath);
}

function buildFrontmatter(resource) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '\\"')}"`;
  const lines = ['---'];
  lines.push(`id: ${esc(resource.id)}`);
  lines.push(`title: ${esc(resource.title || 'Untitled')}`);
  if (resource.created_at) lines.push(`created: ${Number(resource.created_at)}`);
  if (resource.updated_at) lines.push(`updated: ${Number(resource.updated_at)}`);
  lines.push('---', '');
  return lines.join('\n');
}

/** SHA-256 of a file's contents (string or Buffer) — tracks external edits. */
function contentHash(data) {
  const h = crypto.createHash('sha256');
  if (Buffer.isBuffer(data)) h.update(data);
  else h.update(String(data || ''), 'utf8');
  return h.digest('hex');
}

/** Reduce Dome-flavored Markdown to plain text for FTS / semantic indexing. */
function markdownToPlainText(md) {
  let t = String(md || '');
  t = t.replace(/^:::[^\n]*$/gm, '');
  t = t.replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/```[^\n]*\n?/g, '').replace(/`([^`]*)`/g, '$1');
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  t = t.replace(/^\s{0,3}>\s?/gm, '');
  t = t.replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, '');
  t = t.replace(/^\s*\d+\.\s+/gm, '');
  t = t.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '');
  t = t.replace(/\|/g, ' ');
  t = t.replace(/(\*\*|\*|__|_|~~)/g, '');
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Strip a leading YAML frontmatter block, returning the Markdown body. */
function stripFrontmatter(raw) {
  return String(raw || '').replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/** Extract the `id: "..."` field from a note's frontmatter (or null). */
function parseFrontmatterId(raw) {
  const m = String(raw || '').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const idLine = m[1].match(/^\s*id:\s*"?([^"\n]+)"?\s*$/m);
  return idLine ? idLine[1].trim() : null;
}

/** Extract the `title: "..."` field from a note's frontmatter (or null). */
function parseFrontmatterTitle(raw) {
  const m = String(raw || '').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const line = m[1].match(/^\s*title:\s*"?([^"\n]+)"?\s*$/m);
  return line ? line[1].trim() : null;
}

/** Prune empty ancestor directories from startDir up to (not incl.) rootDir. */
function pruneEmptyDirs(startDir, rootDir) {
  let dir = startDir;
  while (dir && dir.startsWith(rootDir) && dir !== rootDir) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      else break;
    } catch { break; }
    dir = path.dirname(dir);
  }
}

/** Remove a mirror file (best-effort) and prune now-empty dirs up to rootDir. */
function removeMirrorAbs(absPath, rootDir) {
  if (!absPath) return;
  try {
    markSelfWrite(absPath, null);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    pruneEmptyDirs(path.dirname(absPath), rootDir);
  } catch (err) {
    console.warn('[VaultStore] removeMirrorAbs failed:', err.message);
  }
}

// ── High-level operations ────────────────────────────────────────────────────

async function writeNoteMarkdown({ id, markdown }, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const resource = await queries.getResourceById.get(id);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (resource.type !== 'note') return { success: false, error: 'Not a note' };

    const root = await getProjectVaultRoot(resource.project_id, queries, fileStorage);
    const desiredRel = await resolveRelPath(resource, queries);
    const relPath = await ensureUniqueRelPath(desiredRel, resource, db);
    const prevRel = resource.vault_path || null;

    const body = typeof markdown === 'string' ? markdown : '';
    const contents = `${buildFrontmatter(resource)}${body}\n`;
    atomicWrite(path.join(root, relPath), contents);

    if (prevRel && prevRel !== relPath) removeMirrorAbs(path.join(root, prevRel), root);

    const text = markdownToPlainText(body);
    const hash = contentHash(contents);
    await db.run(
      'UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ? WHERE id = ?',
      [relPath, text, hash, id],
    );
    return { success: true, vaultPath: relPath, contentHash: hash };
  } catch (err) {
    console.error('[VaultStore] writeNoteMarkdown failed:', err);
    return { success: false, error: err.message };
  }
}

async function readNoteMarkdown({ id }, { database, fileStorage }) {
  try {
    const queries = database.getQueries();
    const resource = await queries.getResourceById.get(id);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (!resource.vault_path) return { success: false, error: 'No mirror' };

    const full = await vaultAbsPathForResource(resource, queries, fileStorage);
    if (!full || !fs.existsSync(full)) return { success: false, error: 'Mirror missing' };
    const raw = fs.readFileSync(full, 'utf8');
    return { success: true, markdown: stripFrontmatter(raw), vaultPath: resource.vault_path };
  } catch (err) {
    console.error('[VaultStore] readNoteMarkdown failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Move a file-backed resource's file to the path implied by its current title
 * (notes) / filename (binaries) + folder chain, renaming on disk and updating
 * vault_path. Used after folder moves/renames.
 */
async function relocateResource(id, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const resource = await queries.getResourceById.get(id);
  if (!resource || resource.type === 'folder' || !resource.vault_path) {
    return { moved: false, vaultPath: resource?.vault_path || null };
  }

  const root = await getProjectVaultRoot(resource.project_id, queries, fileStorage);
  const prevRel = resource.vault_path || null;
  const desiredRel = await ensureUniqueRelPath(await buildRelPath(resource, queries, null), resource, db);
  if (prevRel === desiredRel) return { moved: false, vaultPath: prevRel };

  const newAbs = path.join(root, desiredRel);
  try {
    await db.run('UPDATE resources SET vault_path = ? WHERE id = ?', [desiredRel, id]);
    if (prevRel) {
      const oldAbs = path.join(root, prevRel);
      if (fs.existsSync(oldAbs)) {
        const dir = path.dirname(newAbs);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        markSelfWrite(oldAbs, null);
        try { markSelfWrite(newAbs, contentHash(fs.readFileSync(oldAbs, 'utf8'))); } catch { /* */ }
        fs.renameSync(oldAbs, newAbs);
        pruneEmptyDirs(path.dirname(oldAbs), root);
      }
    }
    return { moved: true, vaultPath: desiredRel };
  } catch (err) {
    console.warn('[VaultStore] relocateResource failed:', err.message);
    return { moved: false, vaultPath: prevRel };
  }
}

/** Relocate every file-backed resource inside a folder subtree (after move/rename). */
async function relocateDescendants(folderId, deps) {
  const db = deps.database.getDB();
  const folderIds = [folderId];
  for (let i = 0; i < folderIds.length; i++) {
    const subs = await db.all(
      "SELECT id FROM resources WHERE folder_id = ? AND type = 'folder'",
      [folderIds[i]],
    );
    for (const s of subs) folderIds.push(s.id);
  }
  const placeholders = folderIds.map(() => '?').join(',');
  const items = await db.all(
    `SELECT id FROM resources WHERE type != 'folder' AND vault_path IS NOT NULL AND folder_id IN (${placeholders})`,
    folderIds,
  );
  for (const n of items) await relocateResource(n.id, deps);
}

/** Remove the mirror file for a resource (on in-app delete). */
async function removeMirrorForResource(id, { database, fileStorage }) {
  try {
    const queries = database.getQueries();
    const resource = await queries.getResourceById.get(id);
    if (resource?.vault_path) {
      const root = await getProjectVaultRoot(resource.project_id, queries, fileStorage);
      removeMirrorAbs(path.join(root, resource.vault_path), root);
    }
  } catch (err) {
    console.warn('[VaultStore] removeMirrorForResource failed:', err.message);
  }
}

/**
 * Write a `.md` received from cloud sync to disk and reconcile the matching
 * resource (by frontmatter id). Self-write so the watcher ignores it.
 */
async function applyDownloadedMirror(relPath, contents, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const id = parseFrontmatterId(contents);
    const resource = id ? await queries.getResourceById.get(id) : null;
    const projectId = resource?.project_id;
    const root = projectId
      ? await getProjectVaultRoot(projectId, queries, fileStorage)
      : getDefaultVaultDir(fileStorage);
    atomicWrite(path.join(root, relPath), contents);
    if (id && resource) {
      const text = markdownToPlainText(stripFrontmatter(contents));
      await db.run(
        'UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ? WHERE id = ?',
        [relPath, text, contentHash(contents), id],
      );
    }
    return true;
  } catch (err) {
    console.warn('[VaultStore] applyDownloadedMirror failed:', err.message);
    return false;
  }
}

/**
 * Point a project at a new vault root, moving its existing note `.md` files
 * from the old root to the new one. `newRoot` empty/null = revert to default.
 * @returns {{ success: boolean, root?: string, error?: string }}
 */
async function setProjectVaultRoot(projectId, newRoot, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const project = await queries.getProjectById.get(projectId);
    if (!project) return { success: false, error: 'Project not found' };

    const oldRoot = await getProjectVaultRoot(projectId, queries, fileStorage);
    const cleanRoot = String(newRoot || '').trim() || null;
    const resolvedNew = cleanRoot
      || path.join(getDefaultVaultDir(fileStorage), sanitizeSegment(project.name || 'Library', 'Library'));

    if (path.resolve(resolvedNew) !== path.resolve(oldRoot)) {
      const notes = await db.all(
        "SELECT id, vault_path FROM resources WHERE project_id=? AND type='note' AND vault_path IS NOT NULL AND trim(vault_path)!=''",
        [projectId],
      );
      for (const n of notes) {
        try {
          const oldAbs = path.join(oldRoot, n.vault_path);
          if (!fs.existsSync(oldAbs)) continue;
          const newAbs = path.join(resolvedNew, n.vault_path);
          const dir = path.dirname(newAbs);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const contents = fs.readFileSync(oldAbs, 'utf8');
          markSelfWrite(newAbs, contentHash(contents));
          fs.writeFileSync(newAbs, contents, 'utf8');
          removeMirrorAbs(oldAbs, oldRoot);
        } catch (e) { console.warn('[VaultStore] move note to new root failed:', e.message); }
      }
    }

    await db.run('UPDATE projects SET vault_root = ? WHERE id = ?', [cleanRoot, projectId]);
    return { success: true, root: resolvedNew };
  } catch (err) {
    console.error('[VaultStore] setProjectVaultRoot failed:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getVaultDir,
  getDefaultVaultDir,
  getProjectVaultRoot,
  setProjectVaultRoot,
  getProjectRoots,
  vaultAbsPathForResource,
  getResourceFilePath,
  importFileToVault,
  sanitizeSegment,
  sanitizeFilename,
  resolveFolderDir,
  buildRelPath,
  resolveRelPath,
  writeNoteMarkdown,
  readNoteMarkdown,
  removeMirrorAbs,
  removeMirrorForResource,
  relocateResource,
  relocateDescendants,
  applyDownloadedMirror,
  markdownToPlainText,
  stripFrontmatter,
  parseFrontmatterId,
  parseFrontmatterTitle,
  contentHash,
  isSelfWrite,
  markSelfWrite,
};
