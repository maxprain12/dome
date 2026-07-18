'use strict';

const nodePath = require('path');
const fs = require('fs');

const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  'target',
  '$RECYCLE.BIN',
  'AppData',
];

const MAX_LIST_ITEMS = 500;
const DEFAULT_TREE_MAX_DEPTH = 2;
const DEFAULT_TREE_MAX_ENTRIES = 200;

/**
 * @param {string} name
 * @param {string[]} patterns
 * @returns {boolean}
 */
function shouldExcludeEntry(name, patterns) {
  const lower = String(name || '').toLowerCase();
  for (const pattern of patterns) {
    const pl = String(pattern || '').toLowerCase();
    if (!pl) continue;
    if (lower === pl || lower.includes(pl)) return true;
  }
  return false;
}

/**
 * @param {string} name
 * @param {string} fullPath
 * @param {boolean} isDirectory
 * @returns {{ name: string; path: string; isDirectory: boolean; children?: unknown[] }}
 */
function makeTreeNode(name, fullPath, isDirectory) {
  const node = { name, path: fullPath, isDirectory };
  if (isDirectory) node.children = [];
  return node;
}

/**
 * @param {{ maxDepth?: unknown; maxEntries?: unknown; exclude?: unknown }} opts
 * @returns {{ maxDepth: number; maxEntries: number; exclude: string[] }}
 */
function parseBoundedTreeOptions(opts) {
  return {
    maxDepth: Math.min(Math.max(Number(opts.maxDepth) || DEFAULT_TREE_MAX_DEPTH, 1), 10),
    maxEntries: Math.min(Math.max(Number(opts.maxEntries) || DEFAULT_TREE_MAX_ENTRIES, 1), 2000),
    exclude:
      Array.isArray(opts.exclude) && opts.exclude.length > 0 ? opts.exclude : DEFAULT_EXCLUDES,
  };
}

/**
 * @param {string} rootPath
 * @returns {Promise<{ ok: true; resolved: string } | { ok: false; error: string }>}
 */
async function resolveTreePath(rootPath) {
  try {
    return { ok: true, resolved: nodePath.resolve(rootPath) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {string} resolved
 * @returns {Promise<{ ok: true } | { ok: false; error: string }>}
 */
async function statTreeRoot(resolved) {
  try {
    const s = await fs.promises.stat(resolved);
    if (!s.isDirectory()) return { ok: false, error: 'Not a directory' };
    return { ok: true };
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { ok: false, error: 'Directory not found' };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {string} dirPath
 * @returns {Promise<import('fs').Dirent[] | null>}
 */
async function readdirSafe(dirPath) {
  try {
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }
}

/**
 * @param {{ children: unknown[] }} parent
 * @param {string} dirPath
 * @param {number} depth
 * @param {number} maxDepth
 * @param {number} maxEntries
 * @param {string[]} exclude
 * @param {Array<{ node: { children: unknown[] }; dirPath: string; depth: number }>} queue
 * @returns {Promise<{ shown: number; truncated: boolean }>}
 */
async function expandBfsLevel(parent, dirPath, depth, maxDepth, maxEntries, exclude, queue) {
  const entries = await readdirSafe(dirPath);
  if (!entries) return { shown: 0, truncated: false };

  let shown = 0;
  let truncated = false;
  for (const entry of entries) {
    if (shouldExcludeEntry(entry.name, exclude)) continue;
    if (shown >= maxEntries) {
      truncated = true;
      break;
    }

    const full = nodePath.join(dirPath, entry.name);
    const isDir = entry.isDirectory();
    const child = makeTreeNode(entry.name, full, isDir);
    parent.children.push(child);
    shown += 1;

    if (isDir && depth + 1 < maxDepth) {
      queue.push({ node: child, dirPath: full, depth: depth + 1 });
    }
  }
  return { shown, truncated };
}

/**
 * Bounded BFS directory tree (safe alternative to MCP directory_tree).
 * @param {string} rootPath
 * @param {{ maxDepth?: number; maxEntries?: number; exclude?: string[] }} [opts]
 * @returns {Promise<{ status: 'success' | 'error'; error?: string; path?: string; max_depth?: number; max_entries?: number; shown?: number; truncated?: boolean; tree?: object }>}
 */
async function buildFileTree(rootPath, opts = {}) {
  const { maxDepth, maxEntries, exclude } = parseBoundedTreeOptions(opts);

  const resolvedResult = await resolveTreePath(rootPath);
  if (!resolvedResult.ok) return { status: 'error', error: resolvedResult.error };

  const statResult = await statTreeRoot(resolvedResult.resolved);
  if (!statResult.ok) return { status: 'error', error: statResult.error };

  const resolved = resolvedResult.resolved;
  const root = makeTreeNode(nodePath.basename(resolved) || resolved, resolved, true);
  /** @type {Array<{ node: { children: unknown[] }; dirPath: string; depth: number }>} */
  const queue = [{ node: root, dirPath: resolved, depth: 0 }];
  let shown = 0;
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;

    const result = await expandBfsLevel(
      current.node,
      current.dirPath,
      current.depth,
      maxDepth,
      maxEntries,
      exclude,
      queue,
    );
    shown += result.shown;
    if (result.truncated) {
      truncated = true;
      break;
    }
  }

  return {
    status: 'success',
    path: resolved,
    max_depth: maxDepth,
    max_entries: maxEntries,
    shown,
    truncated,
    tree: root,
  };
}

module.exports = {
  DEFAULT_EXCLUDES,
  MAX_LIST_ITEMS,
  DEFAULT_TREE_MAX_DEPTH,
  DEFAULT_TREE_MAX_ENTRIES,
  shouldExcludeEntry,
  buildFileTree,
};
