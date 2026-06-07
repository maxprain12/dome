/**
 * @dome/tools — `vision` family definitions (on-device Gemma image understanding).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The vision-family tool names (subset of the 103-tool catalog). */
export const VISION_TOOL_NAMES = ['image_describe', 'screen_understand'] as const;

export type VisionToolName = (typeof VISION_TOOL_NAMES)[number];

export function visionToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'image_describe',
        description:
          'Describe an image resource using on-device Gemma (no cloud vision). Use for image-type resources in the library.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Image resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screen_understand',
        description:
          'Analyze a screenshot (base64 PNG) for UI elements and intent. Returns JSON-like analysis from on-device Gemma. Requires Gemma enabled in Settings.',
        parameters: {
          type: 'object',
          properties: {
            image_base64: { type: 'string', description: 'Base64-encoded PNG (with or without data URL prefix)' },
            intent: { type: 'string', description: 'Optional user goal to bias the analysis' },
          },
          required: ['image_base64'],
        },
      },
    },
  ];
}
