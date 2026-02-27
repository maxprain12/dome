/**
 * PDF Annotation Tools
 *
 * Tools for creating annotations (notes) in PDF resources.
 * Allows the AI agent to add notes to specific pages of a PDF.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';
import { generateId } from '@/lib/utils';

// Default position for AI-created notes (PDF points: 72pt = 1 inch from top-left)
const DEFAULT_NOTE_X = 72;
const DEFAULT_NOTE_Y = 72;
const DEFAULT_NOTE_WIDTH = 200;
const DEFAULT_NOTE_HEIGHT = 150;

const PdfAnnotationCreateSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PDF resource to add the annotation to.',
  }),
  page: Type.Number({
    description: 'Page number (1-based) where to add the note.',
    minimum: 1,
  }),
  content: Type.String({
    description: 'The text content of the note.',
  }),
  type: Type.Optional(
    Type.Literal('note', {
      description: 'Annotation type. Currently only "note" is supported.',
    }),
  ),
});

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.db !== undefined;
}

export function createPdfAnnotationCreateTool(): AnyAgentTool {
  return {
    label: 'Crear anotación en PDF',
    name: 'pdf_annotation_create',
    description:
      'Add a note annotation to a specific page of a PDF. Use resource_get or resource_search first to find the PDF resource_id. ' +
      'After creating, include a link for the user: [Ver: Title p. N](dome://resource/RESOURCE_ID/pdf?page=N)',
    parameters: PdfAnnotationCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'PDF annotation creation requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const page = readNumberParam(params, 'page', { required: true, integer: true });
        const content = readStringParam(params, 'content', { required: true });

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'resource_id is required.' });
        }
        if (!page || page < 1) {
          return jsonResult({ status: 'error', error: 'page must be a positive integer.' });
        }
        if (!content?.trim()) {
          return jsonResult({ status: 'error', error: 'content is required.' });
        }

        // Verify resource exists and is a PDF
        const resourceResult = await window.electron!.db.resources.getById(resourceId);
        if (!resourceResult.success || !resourceResult.data) {
          return jsonResult({
            status: 'error',
            error: 'Resource not found.',
          });
        }
        const resource = resourceResult.data;
        const isPdf =
          resource.type === 'pdf' ||
          (resource.type === 'document' &&
            ((resource.file_mime_type || '').includes('pdf') ||
              (resource.original_filename || resource.title || '').toLowerCase().endsWith('.pdf')));

        if (!isPdf) {
          return jsonResult({
            status: 'error',
            error: 'Resource is not a PDF. Only PDF resources support annotations.',
          });
        }

        const now = Date.now();
        const interaction = {
          id: generateId(),
          resource_id: resourceId,
          type: 'annotation',
          content: content.trim(),
          position_data: {
            pageIndex: page - 1,
            x: DEFAULT_NOTE_X,
            y: DEFAULT_NOTE_Y,
            width: DEFAULT_NOTE_WIDTH,
            height: DEFAULT_NOTE_HEIGHT,
          },
          metadata: {
            type: 'note',
            color: '#ffeb3b',
          },
          created_at: now,
          updated_at: now,
        };

        const result = await window.electron!.db.interactions.create(interaction);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to create annotation.',
          });
        }

        // Annotations are stored in SQLite with FTS5 full-text search

        return jsonResult({
          status: 'success',
          message: `Note added to page ${page} of "${resource.title}".`,
          interaction_id: result.data?.id,
          resource_id: resourceId,
          resource_title: resource.title,
          page,
          link: `dome://resource/${resourceId}/pdf?page=${page}`,
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

export function createPdfAnnotationTools(): AnyAgentTool[] {
  return [createPdfAnnotationCreateTool()];
}
