/**
 * @dome/tools — `file` family definitions (native filesystem tools).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps) — definitions only; execution stays in main.
 */

import type { ToolDefinition } from '../types.js';

/** The file-family tool names (subset of the 103-tool catalog). */
export const FILE_TOOL_NAMES = ['file_read', 'file_write', 'file_list', 'file_tree', 'file_search'] as const;

export type FileToolName = (typeof FILE_TOOL_NAMES)[number];

export function fileToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'file_read',
        description:
          'Read the text content of a file from the filesystem. Returns the full content as a string. Use to inspect source code, configs, logs, or any text file.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to read.' },
            start_line: { type: 'number', description: 'Line number to start reading from (0-based). Default: 0.' },
            limit: { type: 'number', description: 'Maximum number of lines to read. Default: 200.' },
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
          'Write text content to a file. Creates parent directories if needed. Overwrites existing content. Use to create project files on disk (e.g. Remotion, scripts, configs).',
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
          'List the contents of a directory (one level, not recursive). Returns file/folder names, paths, and whether each entry is a directory. Capped at 500 entries — use file_search for deep or filtered scans. Prefer this over MCP directory_tree.',
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
          'Bounded recursive directory tree (safe alternative to MCP directory_tree). Default max_depth=2 and max_entries=200; skips node_modules, .git, dist, etc. Use for project structure — never scan home or drive roots. Prefer over MCP directory_tree.',
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
              description: 'Directory name patterns to skip (default includes node_modules, .git, dist, AppData).',
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
          'Recursively search a directory for files matching a name pattern or containing a text string. Returns up to 200 matches. Prefer over MCP directory_tree for large folders (especially on Windows).',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Root directory to search from.' },
            pattern: { type: 'string', description: 'Filename glob (e.g. "*.ts") or text regex for content search.' },
            type: { type: 'string', description: 'Search mode: "name" (default) or "content".' },
          },
          required: ['directory', 'pattern'],
        },
      },
    },
  ];
}
