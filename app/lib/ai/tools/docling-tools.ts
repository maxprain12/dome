/**
 * Docling Tools
 *
 * Tools for Many to retrieve and display visual artifacts (images, charts,
 * figures) extracted from documents via Docling cloud conversion.
 *
 * These tools complement the PageIndex resource tools: once a PDF has been
 * converted with Docling, Many can list all extracted images for a resource
 * and render a specific one inline in the chat.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, imageResult, readStringParam, readNumberParam } from './common';

// =============================================================================
// Schemas
// =============================================================================

const DoclingListImagesSchema = Type.Object({
  resource_id: Type.String({
    description:
      'The ID of the resource (PDF, document) whose Docling-extracted images should be listed.',
  }),
});

const DoclingShowImageSchema = Type.Object({
  image_id: Type.String({
    description: 'The ID of the image to retrieve and display inline.',
  }),
  resource_id: Type.Optional(
    Type.String({
      description:
        'Optional resource ID for context (used in the alt text / description).',
    }),
  ),
});

const DoclingShowPageImagesSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the resource whose page images should be displayed.',
  }),
  page_no: Type.Optional(
    Type.Number({
      description: 'Show only images from this page number. Omit to show all images.',
      minimum: 1,
    }),
  ),
  max_images: Type.Optional(
    Type.Number({
      description: 'Maximum number of images to display (1-5). Default: 3.',
      minimum: 1,
      maximum: 5,
    }),
  ),
});

// =============================================================================
// Tool Factories
// =============================================================================

/**
 * List all Docling-extracted images for a resource.
 * Returns metadata (image IDs, page numbers, captions) without loading raw data.
 */
export function createDoclingListImagesTool(): AnyAgentTool {
  return {
    label: 'List Document Images',
    name: 'docling_list_images',
    description:
      'List all visual artifacts (figures, charts, diagrams) that were extracted from a document ' +
      'via Docling conversion. Returns image IDs, page numbers, and captions — use ' +
      'docling_show_image to display a specific image inline.',
    parameters: DoclingListImagesSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (window.electron as any).docling.getResourceImages(resourceId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to list images',
            resource_id: resourceId,
          });
        }

        const images = (result.images as Array<{
          id: string;
          image_index: number;
          page_no: number | null;
          caption: string | null;
        }>).map((img) => ({
          image_id: img.id,
          index: img.image_index,
          page_no: img.page_no,
          caption: img.caption,
        }));

        return jsonResult({
          status: 'success',
          resource_id: resourceId,
          image_count: images.length,
          images,
          hint:
            images.length > 0
              ? 'Use docling_show_image with an image_id to display a specific artifact inline.'
              : 'No Docling images found. The document may not have been converted yet.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Fetch and display a single Docling-extracted image inline in the chat.
 */
export function createDoclingShowImageTool(): AnyAgentTool {
  return {
    label: 'Show Document Artifact',
    name: 'docling_show_image',
    description:
      'Display a visual artifact (figure, chart, table screenshot, diagram) extracted from a ' +
      'document inline in the chat. Use docling_list_images first to get available image IDs.',
    parameters: DoclingShowImageSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const imageId = readStringParam(params, 'image_id', { required: true });
        const resourceId = readStringParam(params, 'resource_id');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (window.electron as any).docling.getImageData(imageId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Image not found',
            image_id: imageId,
          });
        }

        // result.data is already a full data URI: "data:image/png;base64,..."
        const dataUri: string = result.data;
        const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
        const mimeType: string = result.mimeType || 'image/png';

        const captionParts: string[] = [];
        if (result.caption) captionParts.push(result.caption);
        if (result.pageNo != null) captionParts.push(`Page ${result.pageNo}`);
        if (resourceId) captionParts.push(`Resource: ${resourceId}`);
        const extraText = captionParts.length > 0 ? captionParts.join(' | ') : `Artifact: ${imageId}`;

        return imageResult({
          path: imageId,
          base64,
          mimeType,
          extraText,
          details: {
            image_id: imageId,
            resource_id: resourceId,
            page_no: result.pageNo,
            caption: result.caption,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Convenience tool: list images for a resource and display the first N inline.
 * Useful when the user asks "show me the figures from this paper".
 */
export function createDoclingShowPageImagesTool(): AnyAgentTool {
  return {
    label: 'Show Document Page Artifacts',
    name: 'docling_show_page_images',
    description:
      'Display visual artifacts (figures, charts, diagrams) from a specific page of a document, ' +
      'or show the first few artifacts from the whole document. ' +
      'Use when the user asks to "show the figures", "display the charts", or ' +
      '"show what\'s on page N" of a converted document.',
    parameters: DoclingShowPageImagesSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const pageNo = readNumberParam(params, 'page_no', { integer: true });
        const maxImages = readNumberParam(params, 'max_images', { integer: true }) ?? 3;

        // Fetch image list
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listResult = await (window.electron as any).docling.getResourceImages(resourceId);

        if (!listResult.success) {
          return jsonResult({
            status: 'error',
            error: listResult.error || 'Failed to list images',
            resource_id: resourceId,
          });
        }

        let images: Array<{ id: string; image_index: number; page_no: number | null; caption: string | null }> =
          listResult.images || [];

        if (pageNo != null) {
          images = images.filter((img) => img.page_no === pageNo);
        }

        // Limit
        images = images.slice(0, maxImages);

        if (images.length === 0) {
          return jsonResult({
            status: 'no_images',
            resource_id: resourceId,
            page_no: pageNo,
            message:
              pageNo != null
                ? `No visual artifacts found on page ${pageNo}.`
                : 'No visual artifacts found. The document may not have been converted with Docling yet.',
          });
        }

        // Fetch and return each image as a multi-image result
        const contentParts: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> =
          [];

        contentParts.push({
          type: 'text',
          text: `Showing ${images.length} artifact${images.length > 1 ? 's' : ''}${pageNo != null ? ` from page ${pageNo}` : ''} of resource ${resourceId}:`,
        });

        for (const img of images) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dataResult = await (window.electron as any).docling.getImageData(img.id);
          if (!dataResult.success) continue;

          const dataUri: string = dataResult.data;
          const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

          const label =
            img.caption
              ? `Figure ${img.image_index + 1}: ${img.caption}${img.page_no != null ? ` (p.${img.page_no})` : ''}`
              : `Figure ${img.image_index + 1}${img.page_no != null ? ` (p.${img.page_no})` : ''}`;

          contentParts.push({ type: 'text', text: label });
          contentParts.push({ type: 'image', data: base64, mimeType: dataResult.mimeType || 'image/png' });
        }

        return {
          content: contentParts,
          details: {
            resource_id: resourceId,
            page_no: pageNo,
            shown_count: images.length,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

// =============================================================================
// Convenience bundle
// =============================================================================

export function createDoclingTools(): AnyAgentTool[] {
  return [
    createDoclingListImagesTool(),
    createDoclingShowImageTool(),
    createDoclingShowPageImagesTool(),
  ];
}
