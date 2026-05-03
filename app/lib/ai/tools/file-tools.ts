/**
 * Native filesystem tools for Many.
 * Main-process execution goes through LangGraph → executeToolInMain → aiToolsHandler.
 * The execute() functions are kept for direct (non-LangGraph) renderer use.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readBooleanParam } from './common';

export function createFileReadTool(): AnyAgentTool {
  return {
    label: 'Read File',
    name: 'file_read',
    description:
      'Read the text content of a file from the filesystem. Returns the full content as a string. Use to inspect source code, configs, logs, or any text file.',
    parameters: Type.Object({
      path: Type.String({ description: 'Absolute path to the file to read.' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const path = readStringParam(params, 'path', { required: true });
      try {
        const result = await window.electron.file.readFileAsText(path);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Read failed' });
        return jsonResult({ status: 'success', path, content: result.data, size: (result.data as string).length });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createFileWriteTool(): AnyAgentTool {
  return {
    label: 'Write File',
    name: 'file_write',
    description:
      'Write text content to a file. Creates parent directories if needed. Overwrites existing content.',
    parameters: Type.Object({
      path: Type.String({ description: 'Absolute path to the file to write.' }),
      content: Type.String({ description: 'Text content to write (UTF-8).' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const path = readStringParam(params, 'path', { required: true });
      const content = readStringParam(params, 'content') ?? '';
      try {
        const result = await window.electron.file.writeFile(path, content);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Write failed' });
        return jsonResult({ status: 'success', path, bytesWritten: new TextEncoder().encode(content).length });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createFileListTool(): AnyAgentTool {
  return {
    label: 'List Directory',
    name: 'file_list',
    description:
      'List the contents of a directory (one level, not recursive). Returns file/folder names, paths, and whether each entry is a directory.',
    parameters: Type.Object({
      path: Type.String({ description: 'Absolute path to the directory to list.' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const path = readStringParam(params, 'path', { required: true });
      try {
        const result = await window.electron.file.listDirectory(path);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'List failed' });
        return jsonResult({ status: 'success', path, count: (result.data as unknown[]).length, items: result.data });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createFileSearchTool(): AnyAgentTool {
  return {
    label: 'Search Files',
    name: 'file_search',
    description:
      'Recursively search a directory for files matching a name pattern or containing a text string. ' +
      'Set type to "name" to match filenames (supports * and ? wildcards), or "content" to grep inside files. ' +
      'Returns up to 200 matches.',
    parameters: Type.Object({
      directory: Type.String({ description: 'Root directory to search from.' }),
      pattern: Type.String({ description: 'Pattern to match — filename glob (e.g. "*.ts") or text regex for content search.' }),
      type: Type.Optional(
        Type.Union([Type.Literal('name'), Type.Literal('content')], {
          description: 'Search mode: "name" (default) or "content".',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const directory = readStringParam(params, 'directory', { required: true });
      const pattern = readStringParam(params, 'pattern', { required: true });
      const type = (params.type === 'content' ? 'content' : 'name') as 'name' | 'content';
      try {
        const result = await window.electron.shell.fileSearch(directory, pattern, type);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Search failed' });
        return jsonResult({ status: 'success', directory, pattern, type, count: result.matches?.length ?? 0, matches: result.matches });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createFileTools(): AnyAgentTool[] {
  return [
    createFileReadTool(),
    createFileWriteTool(),
    createFileListTool(),
    createFileSearchTool(),
  ];
}
