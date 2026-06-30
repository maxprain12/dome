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
const {
  buildArtifactHtmlDocument,
  parseArtifactHtmlDocument,
  isDomeArtifactHtml,
  artifactSidecarRelPath,
} = require('../artifacts/artifact-vault-mirror.cjs');
const { getResolvedStateForArtifactRow } = require('../artifacts/artifact-serialize.cjs');

const VAULT_DIR = 'vault';
const MD_EXT = '.md';
const ARTIFACT_EXT = '.html';

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
function getProjectVaultRoot(projectId, queries, fileStorage) {
  let project = null;
  try { project = queries.getProjectById.get(projectId); } catch { /* */ }
  const custom = project && typeof project.vault_root === 'string' ? project.vault_root.trim() : '';
  if (custom) return custom;
  return path.join(getDefaultVaultDir(fileStorage), sanitizeSegment(project?.name || 'Library', 'Library'));
}

/** List every project's vault root (for the watcher to know where to look). */
function getProjectRoots(queries, fileStorage) {
  const out = [];
  let projects = [];
  try { projects = queries.getProjects.all(); } catch { /* */ }
  for (const p of projects) {
    out.push({ projectId: p.id, projectName: p.name, root: getProjectVaultRoot(p.id, queries, fileStorage) });
  }
  return out;
}

/** Project-relative folder directory (POSIX) for a resource ('' at root). */
function resolveFolderDir(resource, queries) {
  if (!resource.folder_id) return '';
  const parent = queries.getResourceById.get(resource.folder_id);
  if (!parent || parent.type !== 'folder') return '';
  if (parent.vault_path) return parent.vault_path;
  // Legacy fallback: derive from title chain when vault_path not yet backfilled.
  const segments = [];
  const visited = new Set();
  let folderId = resource.folder_id || null;
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = queries.getResourceById.get(folderId);
    if (!folder || folder.type !== 'folder') break;
    segments.unshift(sanitizeSegment(folder.title, 'Folder'));
    folderId = folder.folder_id || null;
  }
  return segments.join('/');
}

/** Compute the desired project-relative directory path for a folder resource. */
function computeFolderRelPath(folder, queries) {
  const seg = sanitizeSegment(folder.title, 'Folder');
  if (!folder.folder_id) return seg;
  const parentDir = resolveFolderDir({ folder_id: folder.folder_id }, queries);
  return parentDir ? `${parentDir}/${seg}` : seg;
}

/** Ensure folder rel path is unique within the project (suffix id on collision). */
function ensureUniqueFolderRelPath(desiredRel, folder, db) {
  const owner = db
    .prepare("SELECT id FROM resources WHERE project_id = ? AND vault_path = ? AND type = 'folder' LIMIT 1")
    .get(folder.project_id, desiredRel);
  if (!owner || owner.id === folder.id) return desiredRel;
  const dir = path.posix.dirname(desiredRel);
  const base = path.posix.basename(desiredRel);
  const shortId = String(folder.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'dup';
  const suffixed = `${base} (${shortId})`;
  return dir === '.' ? suffixed : `${dir}/${suffixed}`;
}

/** Create the on-disk directory for a folder and persist vault_path. */
function createFolderOnDisk(folderId, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const folder = queries.getResourceById.get(folderId);
    if (!folder || folder.type !== 'folder') return { success: false, error: 'Not a folder' };

    const relPath = ensureUniqueFolderRelPath(computeFolderRelPath(folder, queries), folder, db);
    const root = getProjectVaultRoot(folder.project_id, queries, fileStorage);
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
    markSelfWrite(abs, null);

    db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(relPath, folderId);
    return { success: true, vaultPath: relPath };
  } catch (err) {
    console.error('[VaultStore] createFolderOnDisk failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Rename/move a folder directory on disk and update vault_path for the folder
 * and every descendant (files + subfolders) by prefix replacement.
 */
function relocateFolder(folderId, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const folder = queries.getResourceById.get(folderId);
  if (!folder || folder.type !== 'folder') {
    return { moved: false, vaultPath: folder?.vault_path || null };
  }

  const root = getProjectVaultRoot(folder.project_id, queries, fileStorage);
  const prevRel = folder.vault_path || null;
  const desiredRel = ensureUniqueFolderRelPath(computeFolderRelPath(folder, queries), folder, db);
  if (prevRel === desiredRel) return { moved: false, vaultPath: prevRel };

  const oldAbs = prevRel ? path.join(root, prevRel) : null;
  const newAbs = path.join(root, desiredRel);

  try {
    if (oldAbs && fs.existsSync(oldAbs)) {
      const newParent = path.dirname(newAbs);
      if (!fs.existsSync(newParent)) fs.mkdirSync(newParent, { recursive: true });
      markSelfWrite(oldAbs, null);
      markSelfWrite(newAbs, null);
      fs.renameSync(oldAbs, newAbs);
      pruneEmptyDirs(path.dirname(oldAbs), root);
    } else if (!fs.existsSync(newAbs)) {
      fs.mkdirSync(newAbs, { recursive: true });
      markSelfWrite(newAbs, null);
    }

    db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(desiredRel, folderId);

    if (prevRel) {
      const oldPrefix = `${prevRel}/`;
      const newPrefix = `${desiredRel}/`;
      const descendants = db
        .prepare(
          "SELECT id, vault_path FROM resources WHERE project_id = ? AND vault_path LIKE ? ESCAPE '\\' AND id != ?",
        )
        .all(folder.project_id, `${prevRel}/%`, folderId);
      for (const d of descendants) {
        if (!d.vault_path || !d.vault_path.startsWith(oldPrefix)) continue;
        const next = newPrefix + d.vault_path.slice(oldPrefix.length);
        db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(next, d.id);
      }
    } else {
      relocateDescendants(folderId, { database, fileStorage });
    }

    return { moved: true, vaultPath: desiredRel };
  } catch (err) {
    console.warn('[VaultStore] relocateFolder failed:', err.message);
    return { moved: false, vaultPath: prevRel };
  }
}

/** Remove a folder directory from disk (recursive). Call before deleting the DB row. */
function removeFolderFromDisk(folderId, { database, fileStorage }) {
  try {
    const queries = database.getQueries();
    const folder = queries.getResourceById.get(folderId);
    if (!folder?.vault_path || folder.type !== 'folder') return;
    const root = getProjectVaultRoot(folder.project_id, queries, fileStorage);
    const abs = path.join(root, folder.vault_path);
    markSelfWrite(abs, null);
    if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
    pruneEmptyDirs(path.dirname(abs), root);
  } catch (err) {
    console.warn('[VaultStore] removeFolderFromDisk failed:', err.message);
  }
}

/** Backfill vault_path + mkdir for all folders missing vault_path (migration / repair). */
function backfillFolderVaultPaths({ database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const folders = db
    .prepare("SELECT id FROM resources WHERE type = 'folder' AND (vault_path IS NULL OR trim(vault_path) = '') ORDER BY created_at ASC")
    .all();
  let updated = 0;
  for (const row of folders) {
    const r = createFolderOnDisk(row.id, { database, fileStorage });
    if (r.success) updated += 1;
  }
  return updated;
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
function buildRelPath(resource, queries, filename) {
  const dir = resolveFolderDir(resource, queries);
  let file;
  if (resource.type === 'note') {
    file = `${sanitizeSegment(resource.title, 'Untitled')}${MD_EXT}`;
  } else if (resource.type === 'artifact') {
    file = `${sanitizeSegment(resource.title, 'Untitled Artifact')}${ARTIFACT_EXT}`;
  } else {
    const fromExisting = resource.vault_path ? path.posix.basename(resource.vault_path) : null;
    file = sanitizeFilename(filename || fromExisting || resource.original_filename || sanitizeSegment(resource.title, 'file'), 'file');
  }
  return dir ? `${dir}/${file}` : file;
}

/** Notes-only convenience (title-based `.md` path). */
function resolveRelPath(resource, queries) {
  return buildRelPath(resource, queries, null);
}

/** Resolve the absolute on-disk path of a resource's file (vault or legacy). */
function getResourceFilePath(resource, queries, fileStorage) {
  if (!resource) return null;
  if (resource.vault_path) {
    return path.join(getProjectVaultRoot(resource.project_id, queries, fileStorage), resource.vault_path);
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
function importFileToVault(srcPath, resource, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const root = getProjectVaultRoot(resource.project_id, queries, fileStorage);
  const filename = sanitizeFilename(path.basename(srcPath), 'file');
  const relPath = ensureUniqueRelPath(buildRelPath(resource, queries, filename), resource, db);
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
function ensureUniqueRelPath(desiredRel, resource, db) {
  const owner = db
    .prepare('SELECT id FROM resources WHERE project_id = ? AND vault_path = ? LIMIT 1')
    .get(resource.project_id, desiredRel);
  if (!owner || owner.id === resource.id) return desiredRel;
  const dir = path.posix.dirname(desiredRel);
  const ext = path.posix.extname(desiredRel);
  const base = path.posix.basename(desiredRel, ext);
  const shortId = String(resource.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'dup';
  const suffixed = `${base} (${shortId})${ext}`;
  return dir === '.' ? suffixed : `${dir}/${suffixed}`;
}

/** Absolute path of a note's mirror, resolving its project vault root. */
function vaultAbsPathForResource(resource, queries, fileStorage) {
  if (!resource?.vault_path) return null;
  return path.join(getProjectVaultRoot(resource.project_id, queries, fileStorage), resource.vault_path);
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

function writeNoteMarkdown({ id, markdown }, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(id);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (resource.type !== 'note') return { success: false, error: 'Not a note' };

    const root = getProjectVaultRoot(resource.project_id, queries, fileStorage);
    const desiredRel = resolveRelPath(resource, queries);
    const relPath = ensureUniqueRelPath(desiredRel, resource, db);
    const prevRel = resource.vault_path || null;

    const body = typeof markdown === 'string' ? markdown : '';
    const contents = `${buildFrontmatter(resource)}${body}\n`;
    atomicWrite(path.join(root, relPath), contents);

    if (prevRel && prevRel !== relPath) removeMirrorAbs(path.join(root, prevRel), root);

    const text = markdownToPlainText(body);
    const hash = contentHash(contents);
    db.prepare(
      'UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ? WHERE id = ?',
    ).run(relPath, text, hash, id);
    return { success: true, vaultPath: relPath, contentHash: hash };
  } catch (err) {
    console.error('[VaultStore] writeNoteMarkdown failed:', err);
    return { success: false, error: err.message };
  }
}

function readNoteMarkdown({ id }, { database, fileStorage }) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(id);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (!resource.vault_path) return { success: false, error: 'No mirror' };

    const full = vaultAbsPathForResource(resource, queries, fileStorage);
    if (!full || !fs.existsSync(full)) return { success: false, error: 'Mirror missing' };
    const raw = fs.readFileSync(full, 'utf8');
    return { success: true, markdown: stripFrontmatter(raw), vaultPath: resource.vault_path };
  } catch (err) {
    console.error('[VaultStore] readNoteMarkdown failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Write a persisted artifact to the project vault as a portable HTML file.
 * @param {{ id: string }} params
 */
function writeArtifactHtmlMirror({ id }, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(id);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (resource.type !== 'artifact') return { success: false, error: 'Not an artifact' };

    const artifact = queries.getArtifactByResourceId.get(id);
    if (!artifact) return { success: false, error: 'Artifact row not found' };

    const root = getProjectVaultRoot(resource.project_id, queries, fileStorage);
    const desiredRel = buildRelPath(resource, queries, null);
    const relPath = ensureUniqueRelPath(desiredRel, resource, db);
    const prevRel = resource.vault_path || null;

    const mergedState = getResolvedStateForArtifactRow(queries, artifact);
    const contents = buildArtifactHtmlDocument({
      resource,
      artifact,
      state: mergedState,
    });
    atomicWrite(path.join(root, relPath), contents);

    if (prevRel && prevRel !== relPath) {
      removeMirrorAbs(path.join(root, prevRel), root);
      removeArtifactSidecarAbs(path.join(root, artifactSidecarRelPath(prevRel)), root);
    }

    const text = markdownToPlainText(String(mergedState.html || ''));
    const hash = contentHash(contents);
    db.prepare(
      'UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ? WHERE id = ?',
    ).run(relPath, text, hash, id);

    return { success: true, vaultPath: relPath, contentHash: hash };
  } catch (err) {
    console.error('[VaultStore] writeArtifactHtmlMirror failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Read artifact mirror from disk and optionally reconcile SQLite when the file changed.
 * @param {{ id: string, reconcile?: boolean }} params
 */
function readArtifactHtmlMirror({ id, reconcile = false }, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(id);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (resource.type !== 'artifact') return { success: false, error: 'Not an artifact' };
    if (!resource.vault_path) return { success: false, error: 'No mirror' };

    const full = vaultAbsPathForResource(resource, queries, fileStorage);
    if (!full || !fs.existsSync(full)) return { success: false, error: 'Mirror missing' };

    const raw = fs.readFileSync(full, 'utf8');
    const parsed = parseArtifactHtmlDocument(raw);
    if (!parsed) return { success: false, error: 'Invalid artifact HTML mirror' };

    const hash = contentHash(raw);
    const reconciled = reconcile && resource.content_hash !== hash;

    if (reconciled) {
      const artifact = queries.getArtifactByResourceId.get(id);
      if (artifact) {
        const now = Date.now();
        const nextState = {
          html: parsed.html,
          css: parsed.css,
          data: parsed.data,
          ...(parsed.linkedData ? { linkedData: parsed.linkedData } : {}),
        };
        queries.updateArtifactState.run(JSON.stringify(nextState), now, id);
        if (parsed.artifactType && parsed.artifactType !== artifact.artifact_type) {
          queries.updateArtifact.run(
            parsed.artifactType,
            artifact.template,
            JSON.stringify(nextState),
            parsed.linkedResourceId ?? artifact.linked_resource_id ?? null,
            now,
            id,
          );
        } else if (parsed.linkedResourceId !== (artifact.linked_resource_id ?? null)) {
          db.prepare(
            'UPDATE artifacts SET linked_resource_id = ?, version = version + 1, updated_at = ? WHERE resource_id = ?',
          ).run(parsed.linkedResourceId, now, id);
        }
        db.prepare(
          'UPDATE resources SET content_text = ?, content_hash = ?, updated_at = ? WHERE id = ?',
        ).run(markdownToPlainText(parsed.html), hash, now, id);
      }
    }

    return {
      success: true,
      vaultPath: resource.vault_path,
      parsed,
      contentHash: hash,
      reconciled,
    };
  } catch (err) {
    console.error('[VaultStore] readArtifactHtmlMirror failed:', err);
    return { success: false, error: err.message };
  }
}

/** Remove the `.dome` sidecar directory for an artifact (feeders, runtime snapshots). */
function removeArtifactSidecarAbs(absSidecar, rootDir) {
  if (!absSidecar) return;
  try {
    markSelfWrite(absSidecar, null);
    if (fs.existsSync(absSidecar)) fs.rmSync(absSidecar, { recursive: true, force: true });
    pruneEmptyDirs(path.dirname(absSidecar), rootDir);
  } catch (err) {
    console.warn('[VaultStore] removeArtifactSidecarAbs failed:', err.message);
  }
}

/** Backfill vault_path + HTML mirror for artifacts missing vault_path. */
function backfillArtifactVaultMirrors({ database, fileStorage }) {
  const db = database.getDB();
  const rows = db
    .prepare(
      "SELECT r.id FROM resources r JOIN artifacts a ON a.resource_id = r.id WHERE r.type = 'artifact' AND (r.vault_path IS NULL OR trim(r.vault_path) = '') ORDER BY r.created_at ASC",
    )
    .all();
  let updated = 0;
  for (const row of rows) {
    const r = writeArtifactHtmlMirror({ id: row.id }, { database, fileStorage });
    if (r.success) updated += 1;
  }
  return updated;
}

/**
 * Move a file-backed resource's file to the path implied by its current title
 * (notes) / filename (binaries) + folder chain, renaming on disk and updating
 * vault_path. Used after folder moves/renames.
 */
function relocateResource(id, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const resource = queries.getResourceById.get(id);
  if (!resource || resource.type === 'folder' || !resource.vault_path) {
    return { moved: false, vaultPath: resource?.vault_path || null };
  }

  const root = getProjectVaultRoot(resource.project_id, queries, fileStorage);
  const prevRel = resource.vault_path || null;
  const desiredRel = ensureUniqueRelPath(buildRelPath(resource, queries, null), resource, db);
  if (prevRel === desiredRel) return { moved: false, vaultPath: prevRel };

  const newAbs = path.join(root, desiredRel);
  try {
    db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(desiredRel, id);
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
function relocateDescendants(folderId, deps) {
  const db = deps.database.getDB();
  const folderIds = [folderId];
  for (let i = 0; i < folderIds.length; i++) {
    const subs = db
      .prepare("SELECT id FROM resources WHERE folder_id = ? AND type = 'folder'")
      .all(folderIds[i]);
    for (const s of subs) folderIds.push(s.id);
  }
  const placeholders = folderIds.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT id FROM resources WHERE type != 'folder' AND vault_path IS NOT NULL AND folder_id IN (${placeholders})`)
    .all(...folderIds);
  for (const n of items) relocateResource(n.id, deps);
}

/**
 * Move a folder directory from one project vault root to another and refresh
 * vault_path for the folder + descendants (prefix rewrite when the folder name changes).
 */
function relocateFolderCrossProject(folder, oldVaultRoot, newVaultRoot, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const prevRel = folder.vault_path || null;

  if (!prevRel) {
    createFolderOnDisk(folder.id, { database, fileStorage });
    return;
  }

  const desiredRel = ensureUniqueFolderRelPath(computeFolderRelPath(folder, queries), folder, db);
  const oldAbs = path.join(oldVaultRoot, prevRel);
  const newAbs = path.join(newVaultRoot, desiredRel);

  try {
    const newParent = path.dirname(newAbs);
    if (!fs.existsSync(newParent)) fs.mkdirSync(newParent, { recursive: true });

    if (fs.existsSync(oldAbs)) {
      markSelfWrite(oldAbs, null);
      markSelfWrite(newAbs, null);
      fs.renameSync(oldAbs, newAbs);
      pruneEmptyDirs(path.dirname(oldAbs), oldVaultRoot);
    } else if (!fs.existsSync(newAbs)) {
      fs.mkdirSync(newAbs, { recursive: true });
      markSelfWrite(newAbs, null);
    }

    db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(desiredRel, folder.id);

    const oldPrefix = `${prevRel}/`;
    const newPrefix = `${desiredRel}/`;
    const descendants = db
      .prepare(
        "SELECT id, vault_path FROM resources WHERE project_id = ? AND vault_path LIKE ? ESCAPE '\\' AND id != ?",
      )
      .all(folder.project_id, `${prevRel}/%`, folder.id);
    for (const d of descendants) {
      if (!d.vault_path || !d.vault_path.startsWith(oldPrefix)) continue;
      const next = newPrefix + d.vault_path.slice(oldPrefix.length);
      db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(next, d.id);
    }
  } catch (err) {
    console.warn('[VaultStore] relocateFolderCrossProject failed:', err.message);
  }
}

/**
 * Move a single file-backed resource (note, artifact, binary) across project vault roots.
 */
function relocateResourceCrossProject(resource, oldVaultRoot, newVaultRoot, { database, fileStorage }) {
  const db = database.getDB();
  const queries = database.getQueries();
  const prevRel = resource.vault_path || null;

  if (!prevRel) {
    if (resource.type === 'note') {
      writeNoteMarkdown({ id: resource.id, markdown: resource.content || '' }, { database, fileStorage });
    } else if (resource.type === 'artifact') {
      writeArtifactHtmlMirror({ id: resource.id }, { database, fileStorage });
    } else if (resource.internal_path) {
      try {
        const src = fileStorage.getFullPath(resource.internal_path);
        if (fs.existsSync(src)) {
          const imported = importFileToVault(src, resource, { database, fileStorage });
          db.prepare('UPDATE resources SET vault_path = ?, content_hash = ?, file_size = ? WHERE id = ?').run(
            imported.vaultPath,
            imported.contentHash,
            imported.size,
            resource.id,
          );
        }
      } catch (err) {
        console.warn('[VaultStore] relocateResourceCrossProject import failed:', err.message);
      }
    }
    return;
  }

  const desiredRel = ensureUniqueRelPath(buildRelPath(resource, queries, null), resource, db);
  const oldAbs = path.join(oldVaultRoot, prevRel);
  const newAbs = path.join(newVaultRoot, desiredRel);

  try {
    db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?').run(desiredRel, resource.id);

    if (fs.existsSync(oldAbs)) {
      const dir = path.dirname(newAbs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      markSelfWrite(oldAbs, null);
      try {
        const buf = fs.readFileSync(oldAbs);
        markSelfWrite(newAbs, contentHash(buf));
      } catch {
        markSelfWrite(newAbs, null);
      }
      fs.renameSync(oldAbs, newAbs);
      pruneEmptyDirs(path.dirname(oldAbs), oldVaultRoot);

      if (resource.type === 'artifact') {
        const oldSidecar = path.join(oldVaultRoot, artifactSidecarRelPath(prevRel));
        const newSidecar = path.join(newVaultRoot, artifactSidecarRelPath(desiredRel));
        if (fs.existsSync(oldSidecar)) {
          const sidecarParent = path.dirname(newSidecar);
          if (!fs.existsSync(sidecarParent)) fs.mkdirSync(sidecarParent, { recursive: true });
          markSelfWrite(oldSidecar, null);
          markSelfWrite(newSidecar, null);
          fs.renameSync(oldSidecar, newSidecar);
          pruneEmptyDirs(path.dirname(oldSidecar), oldVaultRoot);
        }
      }
    } else if (resource.type === 'artifact') {
      writeArtifactHtmlMirror({ id: resource.id }, { database, fileStorage });
    } else if (resource.type === 'note') {
      writeNoteMarkdown({ id: resource.id, markdown: resource.content || '' }, { database, fileStorage });
    }
  } catch (err) {
    console.warn('[VaultStore] relocateResourceCrossProject failed:', err.message);
  }
}

/**
 * After `db:resources:moveToProject`, mirror the subtree on disk under the target
 * project's vault root and remove it from the source vault.
 */
function relocateSubtreeToProject(rootId, oldProjectId, { database, fileStorage }) {
  const queries = database.getQueries();
  const root = queries.getResourceById.get(rootId);
  if (!root || !oldProjectId || root.project_id === oldProjectId) return { moved: false };

  const oldVaultRoot = getProjectVaultRoot(oldProjectId, queries, fileStorage);
  const newVaultRoot = getProjectVaultRoot(root.project_id, queries, fileStorage);

  if (path.resolve(oldVaultRoot) === path.resolve(newVaultRoot)) {
    if (root.type === 'folder') return relocateFolder(rootId, { database, fileStorage });
    return relocateResource(rootId, { database, fileStorage });
  }

  if (root.type === 'folder') {
    relocateFolderCrossProject(root, oldVaultRoot, newVaultRoot, { database, fileStorage });
  } else {
    relocateResourceCrossProject(root, oldVaultRoot, newVaultRoot, { database, fileStorage });
  }

  return { moved: true };
}

/** Remove the mirror file for a resource (on in-app delete). */
function removeMirrorForResource(id, { database, fileStorage }) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(id);
    if (resource?.vault_path) {
      const root = getProjectVaultRoot(resource.project_id, queries, fileStorage);
      removeMirrorAbs(path.join(root, resource.vault_path), root);
      if (resource.type === 'artifact') {
        removeArtifactSidecarAbs(path.join(root, artifactSidecarRelPath(resource.vault_path)), root);
      }
    }
  } catch (err) {
    console.warn('[VaultStore] removeMirrorForResource failed:', err.message);
  }
}

/**
 * Write a `.md` received from cloud sync to disk and reconcile the matching
 * resource (by frontmatter id). Self-write so the watcher ignores it.
 */
function applyDownloadedMirror(relPath, contents, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const id = parseFrontmatterId(contents);
    const resource = id ? queries.getResourceById.get(id) : null;
    const projectId = resource?.project_id;
    const root = projectId
      ? getProjectVaultRoot(projectId, queries, fileStorage)
      : getDefaultVaultDir(fileStorage);
    atomicWrite(path.join(root, relPath), contents);
    if (id && resource) {
      const text = markdownToPlainText(stripFrontmatter(contents));
      db.prepare(
        'UPDATE resources SET vault_path = ?, content_text = ?, content_hash = ? WHERE id = ?',
      ).run(relPath, text, contentHash(contents), id);
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
function setProjectVaultRoot(projectId, newRoot, { database, fileStorage }) {
  try {
    const db = database.getDB();
    const queries = database.getQueries();
    const project = queries.getProjectById.get(projectId);
    if (!project) return { success: false, error: 'Project not found' };

    const oldRoot = getProjectVaultRoot(projectId, queries, fileStorage);
    const cleanRoot = String(newRoot || '').trim() || null;
    const resolvedNew = cleanRoot
      || path.join(getDefaultVaultDir(fileStorage), sanitizeSegment(project.name || 'Library', 'Library'));

    if (path.resolve(resolvedNew) !== path.resolve(oldRoot)) {
      const fileBacked = db
        .prepare("SELECT id, vault_path, type FROM resources WHERE project_id=? AND vault_path IS NOT NULL AND trim(vault_path)!='' AND type IN ('note','artifact')")
        .all(projectId);
      for (const n of fileBacked) {
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
          if (n.type === 'artifact') {
            const oldSidecar = path.join(oldRoot, artifactSidecarRelPath(n.vault_path));
            const newSidecar = path.join(resolvedNew, artifactSidecarRelPath(n.vault_path));
            if (fs.existsSync(oldSidecar)) {
              if (!fs.existsSync(path.dirname(newSidecar))) {
                fs.mkdirSync(path.dirname(newSidecar), { recursive: true });
              }
              markSelfWrite(newSidecar, null);
              fs.renameSync(oldSidecar, newSidecar);
            }
          }
        } catch (e) { console.warn('[VaultStore] move file to new root failed:', e.message); }
      }
    }

    db.prepare('UPDATE projects SET vault_root = ? WHERE id = ?').run(cleanRoot, projectId);
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
  computeFolderRelPath,
  ensureUniqueFolderRelPath,
  createFolderOnDisk,
  relocateFolder,
  removeFolderFromDisk,
  backfillFolderVaultPaths,
  buildRelPath,
  resolveRelPath,
  writeNoteMarkdown,
  readNoteMarkdown,
  writeArtifactHtmlMirror,
  readArtifactHtmlMirror,
  backfillArtifactVaultMirrors,
  removeArtifactSidecarAbs,
  isDomeArtifactHtml,
  parseArtifactHtmlDocument,
  artifactSidecarRelPath,
  removeMirrorAbs,
  removeMirrorForResource,
  relocateResource,
  relocateDescendants,
  relocateSubtreeToProject,
  applyDownloadedMirror,
  markdownToPlainText,
  stripFrontmatter,
  parseFrontmatterId,
  parseFrontmatterTitle,
  contentHash,
  isSelfWrite,
  markSelfWrite,
};
