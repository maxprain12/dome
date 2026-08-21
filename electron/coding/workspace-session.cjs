'use strict';

/**
 * Per-run coding workspace resolution.
 *
 * A run becomes a *coding* run when it carries a `workspacePath` (today that
 * comes from a GitHub issue bound to its local clone) AND that path is a trusted
 * workspace. Anything else keeps the ordinary Dome tool surface: the coding
 * family is not merely denied at call time, it is never offered to the model.
 *
 * This mirrors pi's split between the harness cwd and the tool cwd — every
 * file/shell/git tool in a coding run resolves relative paths against the same
 * root, instead of trusting whatever absolute path the model invents.
 */

const path = require('path');
const workspaceStore = require('./workspace-store.cjs');

/**
 * Tools that only make sense inside a trusted repository. They stay hidden
 * until a workspace is resolved so the model cannot reach the user's disk from
 * an ordinary chat.
 */
const CODING_TOOL_NAMES = new Set([
  'shell_exec',
  'file_edit',
  'file_write',
  'git_status',
  'git_diff',
  'git_log',
  'git_branch_create',
  'git_add',
  'git_commit',
]);

/**
 * @typedef {Object} CodingWorkspaceSession
 * @property {string} cwd            Canonical absolute workspace root
 * @property {string} label          Human label (repo name)
 * @property {boolean} trusted       Always true for a resolved session
 * @property {string[]} contextFiles AGENTS.md / CLAUDE.md found at the root
 */

/**
 * Resolve the coding workspace for a run, or null when the run is not a coding
 * run. Never throws: an unusable path degrades to "no coding session".
 *
 * @param {{ workspacePath?: string | null }} opts
 * @returns {CodingWorkspaceSession | null}
 */
function resolveWorkspaceSession(opts = {}) {
  const raw = typeof opts.workspacePath === 'string' ? opts.workspacePath.trim() : '';
  if (!raw) return null;

  let cwd;
  try {
    cwd = workspaceStore.assertWorkspaceExists(raw);
  } catch (error) {
    console.warn('[CodingWorkspace] unusable workspace path:', raw, error?.message || error);
    return null;
  }

  const root = workspaceStore.resolveTrustedRoot(cwd);
  if (!root) {
    console.log('[CodingWorkspace] workspace not trusted yet, coding tools stay hidden:', cwd);
    return null;
  }

  workspaceStore.touchWorkspace(root);
  const record = workspaceStore.getWorkspace(root);
  return {
    cwd,
    root,
    label: record?.label || path.basename(root),
    trusted: true,
    contextFiles: workspaceStore.listContextFiles(root).map((f) => f.name),
  };
}

/**
 * Drop coding tools when there is no trusted workspace behind this run.
 * @template {{ name: string }} T
 * @param {T[]} tools
 * @param {CodingWorkspaceSession | null} session
 * @returns {T[]}
 */
function filterToolsForWorkspace(tools, session) {
  if (session) return tools;
  if (!Array.isArray(tools)) return tools;
  return tools.filter((tool) => !CODING_TOOL_NAMES.has(tool?.name));
}

/**
 * Markdown block describing the workspace, appended to the system prompt so the
 * model knows where it is working and which project rules apply.
 *
 * @param {CodingWorkspaceSession | null} session
 * @returns {string} empty string when this is not a coding run
 */
function buildWorkspacePromptBlock(session) {
  if (!session) return '';
  const lines = [
    '## Coding workspace',
    '',
    `You are working inside the local repository \`${session.label}\` at \`${session.cwd}\`.`,
    'Relative paths in file, shell and git tools resolve against that root — you do not need to prefix them.',
    'Read before you edit, and prefer `file_edit` over rewriting whole files.',
  ];
  if (session.contextFiles.length > 0) {
    lines.push(
      '',
      `Project instructions live in ${session.contextFiles.map((f) => `\`${f}\``).join(' and ')} at the root; they are included below and take precedence over your defaults.`,
    );
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  CODING_TOOL_NAMES,
  buildWorkspacePromptBlock,
  filterToolsForWorkspace,
  resolveWorkspaceSession,
};
