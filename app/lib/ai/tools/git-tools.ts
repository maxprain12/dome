/**
 * Local git tools for Many (working copy of the open coding workspace).
 *
 * Definitions only: execution always happens in the main process
 * (agent runtime → executeToolInMain → electron/coding/git-tools.cjs), because
 * every command must run at the run's workspace root, which the renderer does
 * not know. `execute()` therefore reports that instead of guessing a cwd.
 *
 * These tools are filtered out of the registry unless the run resolved a
 * trusted workspace, so the model never sees them in an ordinary chat.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';

const MAIN_PROCESS_ONLY = jsonResult({
  status: 'error',
  error: 'git tools run in the main process; they are unavailable in this context.',
});

function mainProcessTool(
  name: string,
  label: string,
  description: string,
  parameters: AnyAgentTool['parameters'],
): AnyAgentTool {
  return {
    label,
    name,
    description,
    parameters,
    execute: async () => MAIN_PROCESS_ONLY,
  };
}

export function createGitTools(): AnyAgentTool[] {
  return [
    mainProcessTool(
      'git_status',
      'Git Status',
      'Show the working copy state: current branch, ahead/behind counts, and every changed file with its staged/untracked flags. Call this before and after editing to know what you actually changed.',
      Type.Object({}),
    ),
    mainProcessTool(
      'git_diff',
      'Git Diff',
      'Show the diff of the working copy. Unstaged by default; pass staged=true for what is about to be committed. Output is capped — narrow it with paths when a repo-wide diff is too large.',
      Type.Object({
        staged: Type.Optional(Type.Boolean({ description: 'Diff the index against HEAD instead of the working tree.' })),
        stat: Type.Optional(Type.Boolean({ description: 'Summary of changed files and line counts instead of the full patch.' })),
        paths: Type.Optional(
          Type.Array(Type.String(), { description: 'Limit the diff to these paths (relative to the workspace root).' }),
        ),
        path: Type.Optional(Type.String({ description: 'Single-path shorthand for paths.' })),
      }),
    ),
    mainProcessTool(
      'git_log',
      'Git Log',
      'Recent commits (hash, author, date, subject) on the current branch.',
      Type.Object({
        limit: Type.Optional(Type.Number({ description: 'How many commits to return (default 20, max 100).' })),
      }),
    ),
    mainProcessTool(
      'git_branch_create',
      'New Branch',
      'Create a new branch and switch to it. Use this before starting work on an issue so the change is isolated.',
      Type.Object({
        name: Type.String({ description: 'Branch name, e.g. "fix/issue-123-null-guard".' }),
        from: Type.Optional(Type.String({ description: 'Base ref to branch from (default: current HEAD).' })),
      }),
    ),
    mainProcessTool(
      'git_add',
      'Stage',
      'Stage specific paths. Requires an explicit list — there is no "stage everything" shortcut.',
      Type.Object({
        paths: Type.Optional(
          Type.Array(Type.String(), { description: 'Paths to stage, relative to the workspace root.' }),
        ),
        path: Type.Optional(Type.String({ description: 'Single-path shorthand for paths.' })),
      }),
    ),
    mainProcessTool(
      'git_commit',
      'Commit',
      'Commit what is currently staged. Fails when nothing is staged — call git_add first. Does not push.',
      Type.Object({
        message: Type.String({ description: 'Commit message.' }),
      }),
    ),
  ];
}
