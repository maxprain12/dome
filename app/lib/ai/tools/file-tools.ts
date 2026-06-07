/**
 * Native filesystem tools for Many.
 * Main-process execution goes through the agent runtime → executeToolInMain → aiToolsHandler.
 * The execute() functions are kept for direct (non-harness) renderer use.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';

export function createFileReadTool(): AnyAgentTool {
  return {
    label: 'Read File',
    name: 'file_read',
    description:
      'Read the text content of a file from the filesystem. Returns the full content as a string. Use to inspect source code, configs, logs, or any text file. Supports pagination via offset and limit (line numbers).',
    parameters: Type.Object({
      file_path: Type.String({ description: 'Absolute path to the file to read.' }),
      start_line: Type.Optional(Type.Number({ description: 'Line number to start reading from (0-based). Default: 0.' })),
      limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read. Default: 200.' })),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, 'file_path', { required: true });
      try {
        const result = await window.electron.file.readFileAsText(filePath);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Read failed' });
        return jsonResult({ status: 'success', file_path: filePath, content: result.data, size: (result.data as string).length });
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
      file_path: Type.String({ description: 'Absolute path to the file to write.' }),
      content: Type.String({ description: 'Text content to write (UTF-8).' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, 'file_path', { required: true });
      const content = readStringParam(params, 'content') ?? '';
      try {
        const result = await window.electron.file.writeFile(filePath, content);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Write failed' });
        return jsonResult({ status: 'success', file_path: filePath, bytesWritten: new TextEncoder().encode(content).length });
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
      'List the contents of a directory (one level, not recursive). Returns file/folder names, paths, and whether each entry is a directory. Capped at 500 entries. Parameter name is "file_path" (not "path"). Prefer this or file_tree over MCP directory_tree (especially on Windows).',
    parameters: Type.Object({
      file_path: Type.Optional(Type.String({ description: 'Absolute path to the directory to list.' })),
      path: Type.Optional(Type.String({ description: 'Alias for file_path.' })),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const filePath = (readStringParam(params, 'file_path', { required: false }) ||
        readStringParam(params, 'path', { required: false })) as string;
      if (!filePath) return jsonResult({ status: 'error', error: 'file_path is required' });
      try {
        const result = await window.electron.file.listDirectory(filePath);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'List failed' });
        return jsonResult({ status: 'success', file_path: filePath, count: (result.data as unknown[]).length, items: result.data });
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
      'Returns up to 200 matches. Prefer over MCP directory_tree for large folders.',
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

export function createFileTreeTool(): AnyAgentTool {
  return {
    label: 'Directory Tree (bounded)',
    name: 'file_tree',
    description:
      'Bounded recursive directory tree — safe alternative to MCP directory_tree. ' +
      'Default max_depth=2, max_entries=200; skips node_modules, .git, dist, AppData, etc. ' +
      'Use for project structure. Never scan home, drive roots (C:\\), or entire repos with node_modules. ' +
      'Prefer this over MCP directory_tree.',
    parameters: Type.Object({
      file_path: Type.Optional(Type.String({ description: 'Absolute path to the root directory.' })),
      path: Type.Optional(Type.String({ description: 'Alias for file_path.' })),
      max_depth: Type.Optional(Type.Number({ description: 'Max depth (default 2, max 10).' })),
      max_entries: Type.Optional(Type.Number({ description: 'Max entries (default 200, max 2000).' })),
      exclude: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Directory name patterns to skip.',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const filePath = (readStringParam(params, 'file_path', { required: false }) ||
        readStringParam(params, 'path', { required: false })) as string;
      if (!filePath) return jsonResult({ status: 'error', error: 'file_path is required' });
      try {
        const result = await window.electron.file.treeDirectory({
          file_path: filePath,
          max_depth: typeof params.max_depth === 'number' ? params.max_depth : undefined,
          max_entries: typeof params.max_entries === 'number' ? params.max_entries : undefined,
          exclude: Array.isArray(params.exclude) ? params.exclude.map(String) : undefined,
        });
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Tree failed' });
        return jsonResult(result.data ?? { status: 'error', error: 'Empty tree result' });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createSkillReadTool(): AnyAgentTool {
  return {
    label: 'Read Skill File',
    name: 'skill_read',
    description:
      'Read a text file from an installed Dome skill (~/.dome/skills/<skill_id>/). ' +
      'Use this for auxiliary skill docs referenced in SKILL.md (e.g. editing.md, references/*.md). ' +
      'Do NOT use MCP filesystem for skill files — use skill_id + relative path instead.',
    parameters: Type.Object({
      skill_id: Type.String({ description: 'Skill folder name, e.g. "pptx".' }),
      path: Type.String({ description: 'Relative path within the skill folder, e.g. "editing.md".' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const skillId = readStringParam(params, 'skill_id', { required: true });
      const relativePath = readStringParam(params, 'path', { required: true });
      try {
        const result = await window.electron.invoke('skills:readFile', {
          skillId,
          path: relativePath,
        }) as { success?: boolean; data?: { content?: string }; error?: string };
        if (!result?.success) {
          return jsonResult({ status: 'error', error: result?.error ?? 'Read failed' });
        }
        const content = result.data?.content ?? '';
        return jsonResult({
          status: 'success',
          skill_id: skillId,
          path: relativePath,
          content,
          size: content.length,
        });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createFileTools(): AnyAgentTool[] {
  return [
    createFileReadTool(),
    createSkillReadTool(),
    createFileWriteTool(),
    createFileListTool(),
    createFileTreeTool(),
    createFileSearchTool(),
  ];
}
