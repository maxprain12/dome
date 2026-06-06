/**
 * @dome/tools — `shell` family definitions.
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps) — definitions only; execution stays in main.
 */

import type { ToolDefinition } from '../types.js';

/** The shell-family tool names (subset of the 103-tool catalog). */
export const SHELL_TOOL_NAMES = ['shell_exec'] as const;

export type ShellToolName = (typeof SHELL_TOOL_NAMES)[number];

export function shellToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'shell_exec',
        description:
          'Execute a shell command. A native confirmation dialog appears before running — the user must approve. Returns stdout, stderr, and exit code.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute (e.g. "pnpm run build").' },
            cwd: { type: 'string', description: 'Working directory for the command.' },
          },
          required: ['command'],
        },
      },
    },
  ];
}
