/**
 * @dome/tools — `web` family definitions.
 *
 * Mirrors `resources.ts`: a `createXToolDefinition`-style factory returning the
 * OpenAI-style function defs for the web tools, faithful to the real schemas in
 * `electron/tool-dispatcher.cjs#getAllToolDefinitions()`. Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The web-family tool names (subset of the 103-tool catalog). */
export const WEB_TOOL_NAMES = ['web_search', 'web_fetch'] as const;

export type WebToolName = (typeof WEB_TOOL_NAMES)[number];

export function webToolDefinitions(): ToolDefinition[] {
  return [
    {
  "type": "function",
  "function": {
    "name": "web_search",
    "description": "Search the public web locally without API keys or an extension. Returns observed organic sources (title, URL, snippet), engine and capturedAt. Use web_fetch to read sources before citing factual claims. Captchas and failed extraction are explicit errors, never empty results.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string"
        },
        "count": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10,
          "default": 5
        },
        "engine": {
          "type": "string",
          "enum": [
            "auto",
            "duckduckgo",
            "bing",
            "google"
          ],
          "default": "auto"
        },
        "country": {
          "type": "string"
        },
        "search_lang": {
          "type": "string"
        },
        "freshness": {
          "type": "string",
          "enum": [
            "day",
            "week",
            "month",
            "year"
          ]
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    }
  }
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
            include_screenshot: { type: 'boolean', description: 'Render locally and capture the page' },
          },
          required: ['url'],
        },
      },
    },
  ];
}
