/**
 * @dome/tools — `browser` family definitions.
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import catalog from './browser-catalog.json' with { type: 'json' };
import type { ToolDefinition } from '../types.js';

/** The browser-family tool names (subset of the 103-tool catalog). */
export const BROWSER_TOOL_NAMES: readonly string[] = ['browser_get_active_tab', ...catalog.map(entry => entry.function.name)];

export type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];

export function browserToolDefinitions(): ToolDefinition[] {
  return [
    ...(catalog as ToolDefinition[]),
    {
      type: 'function',
      function: {
        name: 'browser_get_active_tab',
        description:
          'macOS only. Returns URL and title of the active tab when Safari, Chrome, Chromium, Brave, or Edge is focused. Then use resource_create type url to save.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}
