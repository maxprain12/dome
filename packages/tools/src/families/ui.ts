/**
 * @dome/tools — `ui` family definitions (Many guided-tour UI automation).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The ui-family tool names (subset of the 103-tool catalog). */
export const UI_TOOL_NAMES = [
  'ui_point_to',
  'ui_click',
  'ui_type',
  'ui_scroll',
  'ui_navigate',
  'ui_get_elements',
  'ui_hide_cursor',
] as const;

export type UiToolName = (typeof UI_TOOL_NAMES)[number];

export function uiToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'ui_point_to',
        description:
          'Move the Many cursor to a Dome UI element (data-ui-target name or CSS selector). Use for guided tours — one highlight per turn.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'e.g. tab-agents, tab-settings' },
            tooltip: { type: 'string', description: 'Short tooltip next to the cursor' },
          },
          required: ['target'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_click',
        description: 'Point to a UI element and click it after a brief delay.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'data-ui-target name or CSS selector' },
          },
          required: ['target'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_type',
        description: 'Focus an input/textarea and type text into it.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Input element target' },
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['target', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_scroll',
        description: 'Scroll the page or a scrollable element.',
        parameters: {
          type: 'object',
          properties: {
            direction: { type: 'string', description: 'up | down | left | right' },
            amount: { type: 'number', description: 'Pixels (default 300)' },
            target: { type: 'string', description: 'Optional scrollable element target' },
          },
          required: ['direction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_navigate',
        description:
          'Open or switch to a named Dome tab: home, settings, calendar, agents, learn, flashcards, marketplace, tags, workflows, automations, runs.',
        parameters: {
          type: 'object',
          properties: {
            destination: { type: 'string', description: 'Tab destination name' },
          },
          required: ['destination'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_get_elements',
        description: 'List elements with data-ui-target in the current DOM.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_hide_cursor',
        description: 'Hide the Many assistant UI cursor overlay.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}
