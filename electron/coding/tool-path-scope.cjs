'use strict';

/**
 * Anchor coding-tool path arguments to the run's workspace.
 *
 * Without this the model must invent absolute paths on every call, which is both
 * brittle and the main way an agent wanders outside the repository it was asked
 * to work in. pi solves it by binding each tool to a cwd at construction time;
 * Dome's tools are shared across surfaces, so the anchoring happens once at
 * dispatch instead.
 *
 * Rules:
 *  - Relative path args resolve against the workspace root.
 *  - Omitted directory args default to the workspace root.
 *  - Absolute paths are left alone but are reported when they escape the root,
 *    so the HITL gate above still sees the real target.
 */

const path = require('node:path');

/** Path-shaped argument names per tool, in the order they should be filled. */
const PATH_ARGS_BY_TOOL = Object.freeze({
  file_read: ['file_path', 'path'],
  file_write: ['file_path', 'path'],
  file_edit: ['file_path', 'path'],
  file_list: ['file_path', 'path'],
  file_tree: ['file_path', 'path'],
  file_grep: ['path', 'directory'],
  file_find: ['path', 'directory'],
  file_search: ['directory'],
  shell_exec: ['cwd'],
  git_status: ['cwd'],
  git_diff: ['cwd'],
  git_log: ['cwd'],
  git_branch_create: ['cwd'],
  git_add: ['cwd'],
  git_commit: ['cwd'],
});

/** Tools whose directory argument defaults to the workspace root when omitted. */
const DEFAULTS_TO_ROOT = new Set([
  'file_grep',
  'file_find',
  'file_list',
  'file_tree',
  'shell_exec',
  'git_status',
  'git_diff',
  'git_log',
  'git_branch_create',
  'git_add',
  'git_commit',
]);

/**
 * True when `candidate` is the root itself or lives inside it.
 * @param {string} root
 * @param {string} candidate
 */
function isInsideRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @param {string | null | undefined} workspaceCwd
 * @returns {{ args: Record<string, unknown>, escaped: string[] }}
 *   `escaped` lists resolved paths outside the workspace (empty when scoped).
 */
function scopeToolPaths(toolName, args, workspaceCwd) {
  const source = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  if (!workspaceCwd) return { args: source, escaped: [] };

  const names = PATH_ARGS_BY_TOOL[toolName];
  if (!names) return { args: source, escaped: [] };

  const out = { ...source };
  const escaped = [];
  let anySet = false;

  for (const name of names) {
    const value = out[name];
    if (typeof value !== 'string' || !value.trim()) continue;
    const resolved = path.isAbsolute(value)
      ? path.normalize(value)
      : path.resolve(workspaceCwd, value);
    out[name] = resolved;
    anySet = true;
    if (!isInsideRoot(workspaceCwd, resolved)) escaped.push(resolved);
  }

  if (!anySet && DEFAULTS_TO_ROOT.has(toolName)) {
    out[names[0]] = workspaceCwd;
  }

  return { args: out, escaped };
}

module.exports = { DEFAULTS_TO_ROOT, PATH_ARGS_BY_TOOL, isInsideRoot, scopeToolPaths };
