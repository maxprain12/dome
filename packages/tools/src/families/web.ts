/**
 * @dome/tools — `web` family definitions.
 *
 * Mirrors `resources.ts`: a `createXToolDefinition`-style factory returning the
 * OpenAI-style function defs for the web tools, faithful to the real schemas in
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()`. Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The web-family tool names (subset of the 103-tool catalog). */
export const WEB_TOOL_NAMES = [ 'web_fetch',] as const;

export type WebToolName = (typeof WEB_TOOL_NAMES)[number];

export function webToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetch and extract content from a web page.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            max_length: { type: 'number', description: 'Max content length. Default: 50000' },
          },
          required: ['url'],
        },
      },
    },
  ];
}
