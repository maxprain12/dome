/**
 * Image Crop Tool
 *
 * Crop and resize images using Sharp in the main process.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';

// =============================================================================
// Schema
// =============================================================================

const ImageCropSchema = Type.Object({
  imagePath: Type.String({ description: 'Path to the image file to crop.' }),
  x: Type.Optional(
    Type.Number({
      description: 'X coordinate of the top-left corner of the crop area.',
    }),
  ),
  y: Type.Optional(
    Type.Number({
      description: 'Y coordinate of the top-left corner of the crop area.',
    }),
  ),
  width: Type.Number({ description: 'Width of the crop area in pixels.' }),
  height: Type.Number({ description: 'Height of the crop area in pixels.' }),
  format: Type.Optional(
    Type.Union([Type.Literal('jpeg'), Type.Literal('png'), Type.Literal('webp')], {
      description: 'Output format. Default: jpeg.',
    }),
  ),
  quality: Type.Optional(
    Type.Number({
      description: 'Output quality (1-100). Default: 90.',
      minimum: 1,
      maximum: 100,
    }),
  ),
  maxWidth: Type.Optional(
    Type.Number({
      description: 'Optional maximum width for resizing after crop.',
    }),
  ),
  maxHeight: Type.Optional(
    Type.Number({
      description: 'Optional maximum height for resizing after crop.',
    }),
  ),
});

// =============================================================================
// Configuration
// =============================================================================

export interface ImageCropConfig {
  /** Base path for images (if relative paths are used) */
  basePath?: string;
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create an image crop tool.
 */
export function createImageCropTool(config?: ImageCropConfig): AnyAgentTool {
  return {
    label: 'Image Crop',
    name: 'image_crop',
    description:
      'Crop a region from an image file. Returns the cropped image as a data URL that can be displayed in the chat.',
    parameters: ImageCropSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const imagePath = readStringParam(params, 'imagePath', { required: true });
        const x = readNumberParam(params, 'x', { integer: true }) ?? 0;
        const y = readNumberParam(params, 'y', { integer: true }) ?? 0;
        const width = readNumberParam(params, 'width', { required: true, integer: true });
        const height = readNumberParam(params, 'height', { required: true, integer: true });
        const format = (readStringParam(params, 'format') ?? 'jpeg') as 'jpeg' | 'png' | 'webp';
        const quality = readNumberParam(params, 'quality', { integer: true }) ?? 90;
        const maxWidth = readNumberParam(params, 'maxWidth', { integer: true });
        const maxHeight = readNumberParam(params, 'maxHeight', { integer: true });

        // Validate dimensions
        const widthVal = width ?? 0;
        const heightVal = height ?? 0;
        if (widthVal <= 0 || heightVal <= 0) {
          return jsonResult({
            status: 'error',
            error: 'Width and height must be positive numbers',
          });
        }

        // Call IPC to crop the image
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (window.electron as any).image.crop({
          filePath: imagePath,
          x,
          y,
          width: widthVal,
          height: heightVal,
          format,
          quality,
          maxWidth,
          maxHeight,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to crop image',
            imagePath,
          });
        }

        return jsonResult({
          status: 'success',
          imagePath,
          croppedImage: result.dataUrl,
          format,
          quality,
          dimensions: { width, height },
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
