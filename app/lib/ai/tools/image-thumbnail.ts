/**
 * Image Thumbnail Tool
 *
 * Generate thumbnails for images using Sharp in the main process.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';

// =============================================================================
// Schema
// =============================================================================

const ImageThumbnailSchema = Type.Object({
  imagePath: Type.String({ description: 'Path to the image file.' }),
  maxWidth: Type.Optional(
    Type.Number({
      description: 'Maximum width of the thumbnail. Default: 400.',
    }),
  ),
  maxHeight: Type.Optional(
    Type.Number({
      description: 'Maximum height of the thumbnail. Default: 400.',
    }),
  ),
  format: Type.Optional(
    Type.Union([Type.Literal('jpeg'), Type.Literal('png'), Type.Literal('webp')], {
      description: 'Output format. Default: jpeg.',
    }),
  ),
  quality: Type.Optional(
    Type.Number({
      description: 'Output quality (1-100). Default: 80.',
      minimum: 1,
      maximum: 100,
    }),
  ),
});

// =============================================================================
// Configuration
// =============================================================================

export interface ImageThumbnailConfig {
  /** Default max width */
  maxWidth?: number;
  /** Default max height */
  maxHeight?: number;
  /** Default format */
  format?: 'jpeg' | 'png' | 'webp';
  /** Default quality */
  quality?: number;
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create an image thumbnail tool.
 */
export function createImageThumbnailTool(config?: ImageThumbnailConfig): AnyAgentTool {
  return {
    label: 'Image Thumbnail',
    name: 'image_thumbnail',
    description:
      'Generate a thumbnail for an image file. Returns the thumbnail as a data URL that can be displayed in the chat.',
    parameters: ImageThumbnailSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const imagePath = readStringParam(params, 'imagePath', { required: true });
        const maxWidth =
          readNumberParam(params, 'maxWidth', { integer: true }) ?? config?.maxWidth ?? 400;
        const maxHeight =
          readNumberParam(params, 'maxHeight', { integer: true }) ?? config?.maxHeight ?? 400;
        const format = (readStringParam(params, 'format') ?? config?.format ?? 'jpeg') as
          | 'jpeg'
          | 'png'
          | 'webp';
        const quality = readNumberParam(params, 'quality', { integer: true }) ?? config?.quality ?? 80;

        // Validate dimensions
        if (maxWidth <= 0 || maxHeight <= 0) {
          return jsonResult({
            status: 'error',
            error: 'maxWidth and maxHeight must be positive numbers',
          });
        }

        // Call IPC to generate thumbnail
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (window.electron as any).image.thumbnail({
          filePath: imagePath,
          maxWidth,
          maxHeight,
          format,
          quality,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to generate thumbnail',
            imagePath,
          });
        }

        return jsonResult({
          status: 'success',
          imagePath,
          thumbnail: result.dataUrl,
          format,
          quality,
          dimensions: { maxWidth, maxHeight },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}
