/**
 * @dome/tools — `marketplace` family definitions.
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The marketplace-family tool names (subset of the 103-tool catalog). */
export const MARKETPLACE_TOOL_NAMES = ['marketplace_search', 'marketplace_install'] as const;

export type MarketplaceToolName = (typeof MARKETPLACE_TOOL_NAMES)[number];

export function marketplaceToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'marketplace_search',
        description:
          'Search bundled and configured marketplace catalogs for agents and workflows. Use when the user wants to browse or find installable agents/workflows.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (keywords); omit or empty to list top items' },
            type: { type: 'string', description: 'all | agents | workflows' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'marketplace_install',
        description:
          'Install an agent or workflow from marketplace_search results. Requires marketplaceId from search and type agent or workflow.',
        parameters: {
          type: 'object',
          properties: {
            marketplaceId: { type: 'string', description: 'Template id from marketplace_search' },
            type: { type: 'string', enum: ['agent', 'workflow'], description: 'agent or workflow' },
            project_id: { type: 'string', description: 'Project scope (default: default)' },
          },
          required: ['marketplaceId', 'type'],
        },
      },
    },
  ];
}
