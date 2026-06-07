/**
 * @dome/tools — `office` family: Word .docx tool definitions.
 *
 * Faithful to `getAllToolDefinitions()`. Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../../types.js';

export const DOCX_TOOL_NAMES = [
  'docx_get',
  'docx_get_file_path',
  'docx_create',
  'docx_update',
  'docx_delete',
] as const;

export type DocxToolName = (typeof DOCX_TOOL_NAMES)[number];

export function docxToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'docx_get',
        description:
          'Read a Word .docx resource from the library: plain text (default) or HTML via mammoth. Use before editing or summarizing a report.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'DOCX resource ID' },
            format: { type: 'string', description: "'text' or 'html'. Default: text" },
            max_chars: { type: 'number', description: 'Max characters for text output' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_get_file_path',
        description: 'Get absolute disk path of a Word .docx in the library (for external tooling).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'DOCX resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_create',
        description:
          'Create a new Word .docx in the library. Pass markdown or html for rich layout (html-to-docx), or body/blocks for structured docx-js output (US Letter, Arial). Plain text files: use resource_create (note) or import_file_to_library.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID (default: current)' },
            folder_id: { type: 'string', description: 'Optional folder ID' },
            title: { type: 'string', description: 'Resource title' },
            body: { type: 'string', description: 'Plain text; paragraphs separated by blank line' },
            blocks: {
              type: 'array',
              description: 'Structured blocks: { type: paragraph|heading, text, level? }',
              items: { type: 'object' },
            },
            markdown: { type: 'string', description: 'Full Markdown → DOCX' },
            html: { type: 'string', description: 'Full HTML → DOCX' },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_update',
        description:
          'Replace the .docx file and/or rename the resource. Same content options as docx_create (markdown, html, body, blocks).',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'DOCX resource ID' },
            title: { type: 'string', description: 'New visible title' },
            body: { type: 'string', description: 'Plain text body' },
            blocks: { type: 'array', items: { type: 'object' } },
            markdown: { type: 'string' },
            html: { type: 'string' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_delete',
        description: 'Delete a Word .docx from the library. Requires confirm=true after user consent.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'DOCX resource ID' },
            confirm: { type: 'boolean', description: 'Must be true' },
          },
          required: ['resource_id', 'confirm'],
        },
      },
    },
  ];
}
