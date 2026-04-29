/**
 * PDF Extraction Tools
 * 
 * Tools for extracting content and generating summaries from PDF resources.
 * These tools allow the AI agent to analyze and summarize PDF documents.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

// =============================================================================
// Schemas
// =============================================================================

const PdfExtractTextSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PDF resource to extract text from.',
  }),
  max_chars: Type.Optional(
    Type.Number({
      description: 'Maximum characters to extract. Default: 50000.',
      minimum: 1000,
      maximum: 100000,
    }),
  ),
  pages: Type.Optional(
    Type.String({
      description: 'Specific pages to extract (e.g., "1-5" or "1,3,5").',
    }),
  ),
});

const PdfGetMetadataSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PDF resource to get metadata from.',
  }),
});

const PdfGetStructureSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PDF resource to get structure from.',
  }),
});

const PdfSummarizeSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PDF resource to summarize.',
  }),
  max_chars: Type.Optional(
    Type.Number({
      description: 'Maximum characters to extract for summary. Default: 30000.',
      minimum: 5000,
      maximum: 50000,
    }),
  ),
  prompt: Type.Optional(
    Type.String({
      description: 'Custom prompt for summarization. Default: "Provide a concise summary of this document."',
    }),
  ),
});

const PdfExtractTablesSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the PDF resource to extract tables from.',
  }),
});

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Extract text content from a PDF
 */
export function createPdfExtractTextTool(): AnyAgentTool {
  return {
    label: 'Extraer texto de PDF',
    name: 'pdf_extract_text',
    description: 'Extract text content from a PDF document. Returns the full text or specific pages.',
    parameters: PdfExtractTextSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'PDF extraction requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const maxChars = readNumberParam(params, 'max_chars', { integer: true });
        const pages = readStringParam(params, 'pages');

        const options: { maxChars?: number; pages?: string } = {};
        if (maxChars) options.maxChars = maxChars;
        if (pages) options.pages = pages;

        const result = await window.electron.ai.tools.pdfExtractText(resourceId, options);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to extract PDF text.',
          });
        }

        return jsonResult({
          status: 'success',
          resource_id: resourceId,
          title: result.title,
          text: result.text,
          pages: result.pages,
          total_pages: result.totalPages,
          chars_extracted: result.text?.length || 0,
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

/**
 * Get PDF metadata (title, author, page count, etc.)
 */
export function createPdfGetMetadataTool(): AnyAgentTool {
  return {
    label: 'Obtener metadatos de PDF',
    name: 'pdf_get_metadata',
    description: 'Get metadata from a PDF document including title, author, page count, creation date, etc.',
    parameters: PdfGetMetadataSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'PDF metadata requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });

        const result = await window.electron.ai.tools.pdfGetMetadata(resourceId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to get PDF metadata.',
          });
        }

        return jsonResult({
          status: 'success',
          resource_id: resourceId,
          title: result.title,
          metadata: result.metadata,
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

/**
 * Get PDF structure (headings per page)
 */
export function createPdfGetStructureTool(): AnyAgentTool {
  return {
    label: 'Obtener estructura de PDF',
    name: 'pdf_get_structure',
    description: 'Get the structure of a PDF document, including headings detected on each page.',
    parameters: PdfGetStructureSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'PDF structure requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });

        const result = await window.electron.ai.tools.pdfGetStructure(resourceId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to get PDF structure.',
          });
        }

        return jsonResult({
          status: 'success',
          resource_id: resourceId,
          title: result.title,
          structure: result.structure,
          total_pages: result.totalPages,
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

/**
 * Summarize PDF content
 * Extracts text and returns it in a format suitable for AI summarization
 */
export function createPdfSummarizeTool(): AnyAgentTool {
  return {
    label: 'Resumir PDF',
    name: 'pdf_summarize',
    description: 'Extract and prepare PDF content for summarization. Use this to get the text content that you will then summarize for the user. The extracted text is suitable for AI processing.',
    parameters: PdfSummarizeSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'PDF summarization requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const maxChars = readNumberParam(params, 'max_chars', { integer: true });
        const prompt = readStringParam(params, 'prompt');

        const options: { maxChars?: number; prompt?: string } = {};
        if (maxChars) options.maxChars = maxChars;
        if (prompt) options.prompt = prompt;

        const result = await window.electron.ai.tools.pdfSummarize(resourceId, options);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to summarize PDF.',
          });
        }

        // Format response as an artifact for the chat
        return jsonResult({
          status: 'success',
          artifact: {
            type: 'pdf_summary',
            resource_id: resourceId,
            title: result.title,
            text: result.text,
            metadata: result.metadata,
            total_pages: result.totalPages,
            extracted_pages: result.extractedPages,
            prompt: result.prompt,
            chars_extracted: result.text?.length || 0,
          },
          // Keep the raw data for the AI to process
          extracted_text: result.text,
          metadata: result.metadata,
          total_pages: result.totalPages,
          chars_extracted: result.text?.length || 0,
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

/**
 * Extract tables from PDF
 */
export function createPdfExtractTablesTool(): AnyAgentTool {
  return {
    label: 'Extraer tablas de PDF',
    name: 'pdf_extract_tables',
    description: 'Extract tables from a PDF document. Returns detected table structures.',
    parameters: PdfExtractTablesSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'PDF table extraction requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });

        const result = await window.electron.ai.tools.pdfExtractTables(resourceId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to extract tables from PDF.',
          });
        }

        const rawTables = Array.isArray(result.tables) ? result.tables : [];
        const normalizedTables = rawTables.map((t: { page?: number; rows?: string[] }) => {
          const rawRows = Array.isArray(t.rows) ? t.rows : [];
          const split = rawRows.map((row) => (typeof row === 'string' ? row.split(' | ').map((c) => c.trim()) : []));
          const headers = split[0] ?? [];
          const rows = split.slice(1);
          return { page: t.page, headers, rows };
        });

        const artifact =
          normalizedTables.length <= 1
            ? {
                type: 'table' as const,
                resource_id: resourceId,
                title: result.title || 'Tabla extraída',
                headers: normalizedTables[0]?.headers ?? [],
                rows: normalizedTables[0]?.rows ?? [],
              }
            : {
                type: 'tabs' as const,
                title: result.title || 'Tablas extraídas',
                tabs: normalizedTables.map((t, idx) => ({
                  id: `table-${idx + 1}`,
                  label: t.page ? `Página ${t.page}` : `Tabla ${idx + 1}`,
                  content: {
                    type: 'table' as const,
                    headers: t.headers,
                    rows: t.rows,
                  },
                })),
              };

        return jsonResult({
          status: 'success',
          artifact,
          resource_id: resourceId,
          title: result.title,
          tables: normalizedTables,
          count: normalizedTables.length,
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

// =============================================================================
// Exports
// =============================================================================

export function createPdfExtractionTools(): AnyAgentTool[] {
  return [
    createPdfExtractTextTool(),
    createPdfGetMetadataTool(),
    createPdfGetStructureTool(),
    createPdfSummarizeTool(),
    createPdfExtractTablesTool(),
  ];
}
