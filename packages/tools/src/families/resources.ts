/**
 * @dome/tools — `resources` family definitions (worked example).
 *
 * Phase 3 moves tool DEFINITIONS (name + JSON-schema parameters) into
 * `@dome/tools`, one module per family, as the single source of truth (today
 * they are duplicated between `app/lib/ai/tools/*.ts` and
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()`). This module is the
 * first family: a typed `createXToolDefinition`-style factory for the
 * resource tools. The remaining families follow the same pattern; see
 * `longrunning-task/mapping/tool-map.md`.
 *
 * Definitions are renderer-safe (no Node deps) — the renderer may import them
 * to render tool cards; the main process feeds them to the registry.
 */

import type { ToolDefinition } from '../types.js';

/** The resource-family tool names (subset of the 103-tool catalog). */
export const RESOURCE_TOOL_NAMES = [
  'resource_search',
  'resource_get',
  'resource_list',
  'resource_hybrid_search',
  'resource_semantic_search',
  'resource_get_section',
  'resource_create',
  'resource_update',
  'resource_delete',
  'resource_move_to_folder',
] as const;

export type ResourceToolName = (typeof RESOURCE_TOOL_NAMES)[number];

const obj = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({ type: 'object', properties, required });

const str = (description: string) => ({ type: 'string', description });
const num = (description: string, extra: Record<string, unknown> = {}) => ({
  type: 'number',
  description,
  ...extra,
});

/**
 * Typed definitions for the representative resource tools. Faithful to the
 * legacy schemas in `electron/tool-dispatcher.cjs` / `app/lib/ai/tools/resources.ts`.
 * Returned as OpenAI-style `ToolDefinition`s so the registry can build
 * `AgentTool`s and the legacy path can keep consuming the same shape.
 */
export function resourceToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'resource_search',
        description: 'Search resources by title or content across the knowledge base.',
        parameters: obj(
          {
            query: str('Search query to find resources by title or content.'),
            project_id: str('Filter results to a specific project ID.'),
            type: str('Filter by resource type: pdf, video, audio, image, url, folder, notebook.'),
            limit: num('Maximum number of results (1-50). Default 10.', { minimum: 1, maximum: 50 }),
          },
          ['query'],
        ),
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get',
        description: 'Retrieve a single resource (metadata + content) by id.',
        parameters: obj(
          {
            resource_id: str('The id of the resource to retrieve.'),
            max_content_length: num('Cap the returned content length (chars).'),
          },
          ['resource_id'],
        ),
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_semantic_search',
        description: 'Semantic (embedding) search over resource chunks.',
        parameters: obj(
          {
            query: str('Natural-language query for semantic retrieval.'),
            limit: num('Maximum number of chunks (1-50). Default 10.', { minimum: 1, maximum: 50 }),
          },
          ['query'],
        ),
      },
    },
  ];
}
