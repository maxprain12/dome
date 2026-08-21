/**
 * @dome/tools — `git` family definitions (local working copy).
 *
 * Only offered inside a trusted coding workspace; every command runs at the
 * workspace root. Renderer-safe (no Node deps) — definitions only; execution
 * stays in main (`electron/coding/git-tools.cjs`).
 *
 * There is no `git push`: publishing is the user's call, not the agent's.
 */

import type { ToolDefinition } from '../types.js';

/** The git-family tool names. */
export const GIT_TOOL_NAMES = [
  'git_status',
  'git_diff',
  'git_log',
  'git_branch_create',
  'git_add',
  'git_commit',
] as const;

export type GitToolName = (typeof GIT_TOOL_NAMES)[number];

export function gitToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'git_status',
        description:
          'Show the working copy state: current branch, ahead/behind counts, and every changed file with its staged/untracked flags. Call this before and after editing to know what you actually changed.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_diff',
        description:
          'Show the diff of the working copy. Unstaged by default; pass staged=true for what is about to be committed. Output is capped — narrow it with paths when a repo-wide diff is too large.',
        parameters: {
          type: 'object',
          properties: {
            staged: { type: 'boolean', description: 'Diff the index against HEAD instead of the working tree.' },
            stat: { type: 'boolean', description: 'Summary of changed files and line counts instead of the full patch.' },
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Limit the diff to these paths (relative to the workspace root).',
            },
            path: { type: 'string', description: 'Single-path shorthand for paths.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_log',
        description: 'Recent commits (hash, author, date, subject) on the current branch.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'How many commits to return (default 20, max 100).' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_branch_create',
        description:
          'Create a new branch and switch to it. Use this before starting work on an issue so the change is isolated.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Branch name, e.g. "fix/issue-123-null-guard".' },
            from: { type: 'string', description: 'Base ref to branch from (default: current HEAD).' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_add',
        description:
          'Stage specific paths. Requires an explicit list — there is no "stage everything" shortcut.',
        parameters: {
          type: 'object',
          properties: {
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths to stage, relative to the workspace root.',
            },
            path: { type: 'string', description: 'Single-path shorthand for paths.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_commit',
        description:
          'Commit what is currently staged. Fails when nothing is staged — call git_add first. Does not push.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message.' },
          },
          required: ['message'],
        },
      },
    },
  ];
}
