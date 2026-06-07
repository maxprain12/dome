/**
 * @dome/tools — `web` family definitions.
 *
 * Mirrors `resources.ts`: a `createXToolDefinition`-style factory returning the
 * OpenAI-style function defs for the web tools, faithful to the real schemas in
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()`. Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The web-family tool names (subset of the 103-tool catalog). */
export const WEB_TOOL_NAMES = ['web_search', 'web_fetch', 'deep_research'] as const;

export type WebToolName = (typeof WEB_TOOL_NAMES)[number];

export function webToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web for current information. On Anthropic, Google Gemini, and OpenAI Responses models this uses the provider native search tool; otherwise falls back to Dome HTTP search (SearXNG/Tavily/Brave).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            count: { type: 'number', description: 'Max results (1-10). Default: 5' },
            country: { type: 'string', description: '2-letter country code (e.g. US, DE)' },
            search_lang: { type: 'string', description: 'ISO language code' },
          },
          required: ['query'],
        },
      },
    },
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
    {
      type: 'function',
      function: {
        name: 'deep_research',
        description:
          'Initiate deep research on a topic. Returns a plan: use web_search and web_fetch to gather info, then synthesize a structured report with sections and citations.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Research topic' },
            depth: { type: 'string', description: "Depth: 'quick', 'standard', or 'comprehensive'" },
          },
          required: ['topic'],
        },
      },
    },
  ];
}
