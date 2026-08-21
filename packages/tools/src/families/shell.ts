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
          'Execute a shell command. The user must approve it first. Output (stdout+stderr interleaved) streams back and is capped to the last ~2000 lines / 50KB; when truncated, the full transcript is saved and its path returned in full_output_path. Long builds and test suites are fine — there is no default timeout.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute (e.g. "pnpm run build").' },
            cwd: {
              type: 'string',
              description:
                'Working directory. Ignored in a coding session, where commands always run at the workspace root.',
            },
            timeout: {
              type: 'number',
              description:
                'Optional timeout in seconds. Omit for no timeout; the command is killed (with its children) when it elapses.',
            },
          },
          required: ['command'],
        },
      },
    },
  ];
}
