/**
 * DOCX (Word) tools — create, read, update, delete .docx resources in the library.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readBooleanParam, readNumberParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

const DocxGetSchema = Type.Object({
  resource_id: Type.String({ description: 'ID of the Word (.docx) resource in the library.' }),
  format: Type.Optional(
    Type.Union([Type.Literal('text'), Type.Literal('html')], {
      description: "Output format: 'text' (plain) or 'html' (mammoth). Default: text.",
    }),
  ),
  max_chars: Type.Optional(
    Type.Number({ description: 'Maximum characters for format=text (default 100000).' }),
  ),
});

const DocxGetFilePathSchema = Type.Object({
  resource_id: Type.String({ description: 'ID of the .docx resource.' }),
});

const DocxBlockSchema = Type.Object({
  type: Type.Union([Type.Literal('paragraph'), Type.Literal('heading')], {
    description: "'paragraph' | 'heading'",
  }),
  text: Type.String({ description: 'Block content. In paragraph, \\n creates successive paragraphs.' }),
  level: Type.Optional(
    Type.Number({ description: 'For heading: 1–6 (default 1).', minimum: 1, maximum: 6 }),
  ),
});

const DocxCreateSchema = Type.Object({
  title: Type.Optional(Type.String({ description: 'Document title (.docx extension not required). If omitted, derived from content heading.' })),
  project_id: Type.Optional(Type.String({ description: 'Project ID; defaults to current project.' })),
  folder_id: Type.Optional(Type.String({ description: 'Target folder ID (optional).' })),
  body: Type.Optional(
    Type.String({
      description:
        'Plain text: paragraphs separated by blank lines (\\n\\n). Ignored if markdown, html, or blocks are provided.',
    }),
  ),
  blocks: Type.Optional(
    Type.Array(DocxBlockSchema, {
      description: 'Structured content (paragraphs and headings). Preferred for reports with clear sections.',
    }),
  ),
  markdown: Type.Optional(
    Type.String({
      description: 'Full Markdown; converted to DOCX via HTML (html-to-docx).',
    }),
  ),
  html: Type.Optional(
    Type.String({
      description: 'Full HTML; converted to DOCX with html-to-docx.',
    }),
  ),
});

const DocxUpdateSchema = Type.Object({
  resource_id: Type.String({ description: 'ID of the .docx to replace or rename.' }),
  title: Type.Optional(Type.String({ description: 'New title shown in the library.' })),
  body: Type.Optional(Type.String({ description: 'Replace document with plain text (paragraphs via \\n\\n).' })),
  blocks: Type.Optional(Type.Array(DocxBlockSchema)),
  markdown: Type.Optional(Type.String({ description: 'Replace document from Markdown.' })),
  html: Type.Optional(Type.String({ description: 'Replace document from HTML.' })),
});

const DocxDeleteSchema = Type.Object({
  resource_id: Type.String({ description: 'ID of the .docx resource to delete.' }),
  confirm: Type.Boolean({
    description: 'Must be true after explicit user confirmation (same as resource_delete).',
  }),
});

export function createDocxGetTool(): AnyAgentTool {
  return {
    label: 'Read Word (DOCX)',
    name: 'docx_get',
    description:
      'Read the content of a .docx resource from the library (text or HTML). Use before editing or to summarize a report.',
    parameters: DocxGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'DOCX tools require Electron environment.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', { required: true });
        const format = readStringParam(args as Record<string, unknown>, 'format') as 'text' | 'html' | undefined;
        const maxChars = readNumberParam(args as Record<string, unknown>, 'max_chars');
        const result = await window.electron!.ai.tools.docxGet(resourceId, {
          format: format || 'text',
          max_chars: maxChars,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxGetFilePathTool(): AnyAgentTool {
  return {
    label: 'Get DOCX file path',
    name: 'docx_get_file_path',
    description:
      'Get the absolute disk path of a .docx resource, for use with external scripts or shell tools.',
    parameters: DocxGetFilePathSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'DOCX tools require Electron environment.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', { required: true });
        const result = await window.electron!.ai.tools.docxGetFilePath(resourceId);
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxCreateTool(): AnyAgentTool {
  return {
    label: 'Create Word (DOCX)',
    name: 'docx_create',
    description:
      'Create a .docx Word resource in the library. Pass markdown, html, body (plain text), or blocks. ' +
      'Use when the user wants a downloadable Word document. For plain notes use resource_create instead.',
    parameters: DocxCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'DOCX tools require Electron environment.' });
        }
        const params = args as Record<string, unknown>;
        const markdownParam = readStringParam(params, 'markdown', { required: false });
        const bodyParam = readStringParam(params, 'body', { required: false });
        const titleParam = readStringParam(params, 'title', { required: false });
        const contentHeading = (markdownParam || bodyParam || '').match(/^#+\s+(.+)/m)?.[1]?.trim() ?? '';
        const title = titleParam || contentHeading || 'Untitled Document';
        let projectId = readStringParam(params, 'project_id');
        if (!projectId) {
          const cur = await window.electron!.ai.tools.getCurrentProject();
          projectId = cur?.project?.id || 'default';
        }
        const result = await window.electron!.ai.tools.docxCreate(projectId, title, {
          folder_id: readStringParam(params, 'folder_id'),
          body: bodyParam,
          markdown: markdownParam,
          html: readStringParam(params, 'html'),
          blocks: params.blocks as Array<{ type: string; text: string; level?: number }> | undefined,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxUpdateTool(): AnyAgentTool {
  return {
    label: 'Update Word (DOCX)',
    name: 'docx_update',
    description:
      'Replace or rename an existing .docx resource. Content accepts markdown, html, body, or blocks (same semantics as docx_create).',
    parameters: DocxUpdateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'DOCX tools require Electron environment.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const result = await window.electron!.ai.tools.docxUpdate(resourceId, {
          title: readStringParam(params, 'title'),
          body: readStringParam(params, 'body'),
          markdown: readStringParam(params, 'markdown'),
          html: readStringParam(params, 'html'),
          blocks: params.blocks as Array<{ type: string; text: string; level?: number }> | undefined,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxDeleteTool(): AnyAgentTool {
  return {
    label: 'Delete Word (DOCX)',
    name: 'docx_delete',
    description:
      'Delete a .docx resource from the library. Requires confirm=true after explicit user consent.',
    parameters: DocxDeleteSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'DOCX tools require Electron environment.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const confirm = readBooleanParam(params, 'confirm');
        const result = await window.electron!.ai.tools.docxDelete(resourceId, { confirm });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxTools(): AnyAgentTool[] {
  return [
    createDocxGetTool(),
    createDocxGetFilePathTool(),
    createDocxCreateTool(),
    createDocxUpdateTool(),
    createDocxDeleteTool(),
  ];
}
