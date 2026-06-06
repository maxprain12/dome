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
 * Bounded BFS directory tree (safe alternative to MCP directory_tree).
 * @param {string} rootPath
 * @param {{ maxDepth?: number; maxEntries?: number; exclude?: string[] }} [opts]
 * @returns {{ status: 'success' | 'error'; error?: string; path?: string; max_depth?: number; max_entries?: number; shown?: number; truncated?: boolean; tree?: object }}
 */
function buildFileTree(rootPath, opts = {}) {
  const maxDepth = Math.min(Math.max(Number(opts.maxDepth) || DEFAULT_TREE_MAX_DEPTH, 1), 10);
  const maxEntries = Math.min(Math.max(Number(opts.maxEntries) || DEFAULT_TREE_MAX_ENTRIES, 1), 2000);
  const exclude = Array.isArray(opts.exclude) && opts.exclude.length > 0 ? opts.exclude : DEFAULT_EXCLUDES;

  let resolved;
  try {
    resolved = nodePath.resolve(rootPath);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  if (!fs.existsSync(resolved)) {
    return { status: 'error', error: 'Directory not found' };
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  if (!stat.isDirectory()) {
    return { status: 'error', error: 'Not a directory' };
  }

  const root = makeTreeNode(nodePath.basename(resolved) || resolved, resolved, true);
  /** @type {Array<{ node: { children: unknown[] }; dirPath: string; depth: number }>} */
  const queue = [{ node: root, dirPath: resolved, depth: 0 }];
  let shown = 0;
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;

    let entries;
    try {
      entries = fs.readdirSync(current.dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (shouldExcludeEntry(entry.name, exclude)) continue;
      if (shown >= maxEntries) {
        truncated = true;
        break;
      }

      const full = nodePath.join(current.dirPath, entry.name);
      const isDir = entry.isDirectory();
      const child = makeTreeNode(entry.name, full, isDir);
      current.node.children.push(child);
      shown += 1;

      if (isDir && current.depth + 1 < maxDepth) {
        queue.push({ node: child, dirPath: full, depth: current.depth + 1 });
      }
    }

    if (truncated) break;
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
