/**
 * @dome/tools — `file` family definitions (native filesystem tools).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps) — definitions only; execution stays in main.
 */

import type { ToolDefinition } from '../types.js';

/** The file-family tool names (subset of the tool catalog). */
export const FILE_TOOL_NAMES = [
  'file_read',
  'file_write',
  'file_list',
  'file_tree',
  'file_search',
  'file_grep',
  'file_find',
  'file_edit',
] as const;

export type FileToolName = (typeof FILE_TOOL_NAMES)[number];

export function fileToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'file_read',
        description:
          'Read text from a file. Prefer offset (1-indexed line) + limit for large files. Output is capped (~2000 lines / 50KB); when truncated, use offset=N to continue.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to read.' },
            path: { type: 'string', description: 'Alias for file_path.' },
            offset: {
              type: 'number',
              description: '1-indexed line to start reading from (default 1). Prefer this over start_line.',
            },
            start_line: {
              type: 'number',
              description: 'Legacy 0-based start line (mapped to offset = start_line + 1).',
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of lines to read. Default 200 when offset/start_line is set; otherwise truncateHead applies.',
            },
          },
          required: ['file_path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_write',
        description:
          'Write text content to a file, replacing it entirely. Creates parent directories if needed. Returns a unified diff of what changed. Use for new files; prefer file_edit for surgical changes to an existing file.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to write.' },
            content: { type: 'string', description: 'Text content to write (UTF-8).' },
          },
          required: ['file_path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_list',
        description:
          'List the contents of a directory (one level, not recursive). Capped at 500 entries — use file_find for globs or file_grep for content.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the directory to list.' },
            path: { type: 'string', description: 'Alias for file_path.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_tree',
        description:
          'Bounded recursive directory tree. Default max_depth=2 and max_entries=200; skips node_modules, .git, dist, etc.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the root directory.' },
            path: { type: 'string', description: 'Alias for file_path.' },
            max_depth: { type: 'number', description: 'Max directory depth (default 2, max 10).' },
            max_entries: { type: 'number', description: 'Max files/folders to include (default 200, max 2000).' },
            exclude: {
              type: 'array',
              items: { type: 'string' },
              description: 'Directory name patterns to skip.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_search',
        description:
          'Legacy search: find files by name or containing text (paths only). Prefer file_grep / file_find.',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Root directory to search from.' },
            pattern: { type: 'string', description: 'Filename glob or text regex.' },
            type: { type: 'string', description: 'Search mode: "name" (default) or "content".' },
          },
          required: ['directory', 'pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_grep',
        description:
          'Search file contents for a pattern (ripgrep when available). Returns matching lines with paths and line numbers. Prefer over shell_exec for reading code.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern (regex or literal).' },
            path: { type: 'string', description: 'Directory or file to search.' },
            directory: { type: 'string', description: 'Alias for path.' },
            glob: { type: 'string', description: "Filter files by glob, e.g. '*.ts'." },
            ignoreCase: { type: 'boolean', description: 'Case-insensitive (default false).' },
            literal: { type: 'boolean', description: 'Treat pattern as literal (default false).' },
            context: { type: 'number', description: 'Context lines before/after (default 0).' },
            limit: { type: 'number', description: 'Max matches (default 100).' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_find',
        description: 'Find files by glob pattern (fd or rg --files when available).',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: "Glob pattern, e.g. '*.ts' or '**/*.json'." },
            path: { type: 'string', description: 'Directory to search in.' },
            directory: { type: 'string', description: 'Alias for path.' },
            limit: { type: 'number', description: 'Maximum results (default 1000).' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_edit',
        description:
          'Apply exact text replacements to a file. Each oldText must be unique. Prefer over file_write for surgical edits.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to edit.' },
            path: { type: 'string', description: 'Alias for file_path.' },
            edits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  oldText: { type: 'string' },
                  newText: { type: 'string' },
                },
                required: ['oldText', 'newText'],
              },
            },
            oldText: { type: 'string' },
            newText: { type: 'string' },
          },
          required: ['file_path'],
        },
      },
    },
  ];
}
