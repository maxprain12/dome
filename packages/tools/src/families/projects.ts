/**
 * @dome/tools — `projects` family definitions.
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The projects-family tool names (subset of the 103-tool catalog). */
export const PROJECTS_TOOL_NAMES = ['project_list', 'project_get', 'get_current_project'] as const;

export type ProjectsToolName = (typeof PROJECTS_TOOL_NAMES)[number];

export function projectsToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'project_list',
        description: 'List all projects.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'project_get',
        description: 'Get project details by ID.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID' } },
          required: ['project_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_current_project',
        description: 'Get the current/default project.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}
