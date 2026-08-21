'use strict';

/**
 * Coding workspaces — the set of on-disk repositories Dome's agent may work in.
 *
 * Adapted from pi's `core/trust-manager.ts` + `core/session-cwd.ts`: a workspace
 * is a canonicalized absolute directory with a persisted trust decision. Dome
 * keeps the decision in SQLite (`coding_workspaces`) instead of a JSON file with
 * a lockfile, since the main process is the only writer.
 *
 * Trust is asked once per repository, not once per tool call: the HITL gate in
 * `agent-runtime.cjs` still governs individual mutations, but the coding tool
 * family is only offered at all when a trusted workspace is resolved.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const database = require('../core/database.cjs');

const db = () => database.getDB();
const now = () => Date.now();

/** Context files that carry project instructions into the system prompt. */
const CONTEXT_FILE_NAMES = ['AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'];

class MissingWorkspaceError extends Error {
  constructor(workspacePath) {
    super(`Workspace directory does not exist: ${workspacePath}`);
    this.name = 'MissingWorkspaceError';
    this.workspacePath = workspacePath;
  }
}

/**
 * Canonicalize a workspace path: absolute, symlinks resolved, no trailing sep.
 * Returns null for anything unusable.
 * @param {unknown} input
 * @returns {string | null}
 */
function normalizeWorkspacePath(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes('\0')) return null;
  let resolved = path.resolve(trimmed);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {
    // Path may not exist yet — keep the resolved form so callers can report it.
  }
  if (resolved.length > 1 && resolved.endsWith(path.sep)) {
    resolved = resolved.slice(0, -1);
  }
  return resolved;
}

function workspaceId(normalizedPath) {
  return `cws-${crypto.createHash('sha1').update(normalizedPath).digest('hex').slice(0, 16)}`;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    path: row.path,
    label: row.label || path.basename(row.path),
    trusted: row.trusted === 1,
    lastUsedAt: row.last_used_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Insert or update a workspace row. Trust is preserved unless explicitly passed.
 * @param {string} rawPath
 * @param {{ label?: string, trusted?: boolean }} [opts]
 * @returns {{ id: string, path: string, label: string, trusted: boolean } | null}
 */
function registerWorkspace(rawPath, opts = {}) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) return null;
  const id = workspaceId(normalized);
  const ts = now();
  const label = typeof opts.label === 'string' && opts.label.trim()
    ? opts.label.trim()
    : path.basename(normalized);
  const trustedExplicit = typeof opts.trusted === 'boolean';
  db()
    .prepare(
      `INSERT INTO coding_workspaces (id, path, label, trusted, last_used_at, created_at, updated_at)
       VALUES (@id, @path, @label, @trusted, @ts, @ts, @ts)
       ON CONFLICT(path) DO UPDATE SET
         label = excluded.label,
         trusted = CASE WHEN @trusted_explicit = 1 THEN excluded.trusted ELSE coding_workspaces.trusted END,
         updated_at = excluded.updated_at`,
    )
    .run({
      id,
      path: normalized,
      label,
      trusted: opts.trusted ? 1 : 0,
      trusted_explicit: trustedExplicit ? 1 : 0,
      ts,
    });
  return getWorkspace(normalized);
}

/** @returns {ReturnType<typeof mapRow>} */
function getWorkspace(rawPath) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) return null;
  return mapRow(db().prepare('SELECT * FROM coding_workspaces WHERE path = ?').get(normalized));
}

function listWorkspaces() {
  return db()
    .prepare('SELECT * FROM coding_workspaces ORDER BY last_used_at DESC, updated_at DESC')
    .all()
    .map(mapRow);
}

/**
 * Persist a trust decision. Registers the workspace if it is not known yet.
 * @param {string} rawPath
 * @param {boolean} trusted
 */
function setTrust(rawPath, trusted) {
  return registerWorkspace(rawPath, { trusted: Boolean(trusted) });
}

function removeWorkspace(rawPath) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) return false;
  const res = db().prepare('DELETE FROM coding_workspaces WHERE path = ?').run(normalized);
  return res.changes > 0;
}

function touchWorkspace(rawPath) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) return;
  db()
    .prepare('UPDATE coding_workspaces SET last_used_at = ?, updated_at = ? WHERE path = ?')
    .run(now(), now(), normalized);
}

/**
 * True when `rawPath` is a trusted workspace or lives inside one.
 * Trusting a repo root implicitly trusts its subdirectories.
 * @param {string} rawPath
 */
function isTrusted(rawPath) {
  return resolveTrustedRoot(rawPath) !== null;
}

/**
 * The trusted workspace covering `rawPath` (itself or the nearest ancestor).
 * @param {string} rawPath
 * @returns {string | null} normalized workspace path
 */
function resolveTrustedRoot(rawPath) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) return null;
  const rows = db().prepare('SELECT path FROM coding_workspaces WHERE trusted = 1').all();
  let best = null;
  for (const row of rows) {
    const candidate = row.path;
    if (normalized === candidate || normalized.startsWith(`${candidate}${path.sep}`)) {
      if (!best || candidate.length > best.length) best = candidate;
    }
  }
  return best;
}

/**
 * Port of pi's `assertSessionCwdExists`: a stored workspace whose directory was
 * moved or deleted must fail loudly instead of silently running somewhere else.
 * @param {string} rawPath
 * @returns {string} the normalized, existing directory
 */
function assertWorkspaceExists(rawPath) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) throw new MissingWorkspaceError(String(rawPath ?? ''));
  let stat;
  try {
    stat = fs.statSync(normalized);
  } catch {
    throw new MissingWorkspaceError(normalized);
  }
  if (!stat.isDirectory()) throw new MissingWorkspaceError(normalized);
  return normalized;
}

/**
 * Read the project context files (AGENTS.md / CLAUDE.md) at a workspace root.
 * @param {string} rawPath
 * @returns {Array<{ name: string, path: string }>}
 */
function listContextFiles(rawPath) {
  const normalized = normalizeWorkspacePath(rawPath);
  if (!normalized) return [];
  const found = [];
  const seen = new Set();
  for (const name of CONTEXT_FILE_NAMES) {
    const full = path.join(normalized, name);
    const key = full.toLowerCase();
    if (seen.has(key)) continue;
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        seen.add(key);
        found.push({ name, path: full });
      }
    } catch {
      /* unreadable — skip */
    }
  }
  return found;
}

module.exports = {
  CONTEXT_FILE_NAMES,
  MissingWorkspaceError,
  assertWorkspaceExists,
  getWorkspace,
  isTrusted,
  listContextFiles,
  listWorkspaces,
  normalizeWorkspacePath,
  registerWorkspace,
  removeWorkspace,
  resolveTrustedRoot,
  setTrust,
  touchWorkspace,
};
