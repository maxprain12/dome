/**
 * @dome/tools — `image` family definitions (on-disk image crop/thumbnail).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The image-family tool names (subset of the 103-tool catalog). */
export const IMAGE_TOOL_NAMES = ['image_crop', 'image_thumbnail'] as const;

export type ImageToolName = (typeof IMAGE_TOOL_NAMES)[number];

export function imageToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'image_crop',
        description: 'Crop a region from an image file on disk. Returns cropped image as data URL.',
        parameters: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Absolute path to image file' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            format: { type: 'string', description: 'jpeg | png | webp' },
            quality: { type: 'number' },
            maxWidth: { type: 'number' },
            maxHeight: { type: 'number' },
          },
          required: ['imagePath', 'width', 'height'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_thumbnail',
        description: 'Generate a thumbnail data URL for an image file on disk.',
        parameters: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Absolute path to image file' },
            width: { type: 'number', description: 'Max width (default 256)' },
            height: { type: 'number', description: 'Max height (default 256)' },
            format: { type: 'string' },
            quality: { type: 'number' },
          },
          required: ['imagePath'],
        },
      },
    },
  ];
}
