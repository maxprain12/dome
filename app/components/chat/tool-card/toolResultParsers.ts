/**
 * ChatToolCard result/args parsers (03/T02 — extracted from ChatToolCard.tsx).
 * Pure functions: tool results → typed view models, arg summaries, codegen previews.
 */

import type { AnyArtifact, ArtifactType } from '../ArtifactCard';
import { tryParseArtifact, ZOD_VALIDATED_ARTIFACT_TYPES } from '@/lib/chat/artifactSchemas';
import { EXT_LANG, CODEGEN_MAX_LINES, CODEGEN_MAX_CHARS } from './toolCardConfig';

export function parseDocumentResult(result: unknown): Array<{ content?: string; metadata?: Record<string, unknown> }> | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  } else {
    parsed = result;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const valid = parsed.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      (typeof (item as { content?: unknown }).content === 'string' ||
        typeof (item as { metadata?: unknown }).metadata === 'object')
  );
  return valid ? (parsed as Array<{ content?: string; metadata?: Record<string, unknown> }>) : null;
}

export interface PersistedArtifactToolResult {
  resourceId: string;
  title: string;
  artifactType: string;
}

/** Parse artifact_create / artifact tool success payloads into a persisted resource card. */
export function parsePersistedArtifactCreateResult(result: unknown): PersistedArtifactToolResult | null {
  if (!result) return null;
  let parsed: unknown = result;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const resourceId = String(payload.resourceId ?? payload.resource_id ?? '').trim();
  if (!resourceId) return null;
  const title = String(payload.title ?? 'Untitled Artifact').trim() || 'Untitled Artifact';
  const artifactType = String(payload.artifactType ?? payload.artifact_type ?? 'custom').trim() || 'custom';
  if (root.success === false) return null;
  return { resourceId, title, artifactType };
}

/** Parse result as artifact */
export function parseArtifactResult(result: unknown): AnyArtifact | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  } else if (result && typeof result === 'object') {
    parsed = result;
  } else {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  let artifact: AnyArtifact | undefined;
  if (obj.artifact && typeof obj.artifact === 'object') artifact = obj.artifact as AnyArtifact;
  if (!artifact && obj.content && Array.isArray(obj.content)) {
    const textContent = obj.content[0]?.text;
    if (typeof textContent === 'string') {
      try {
        const p = JSON.parse(textContent);
        if (p.artifact) artifact = p.artifact as AnyArtifact;
      } catch { /* Not JSON */ }
    }
  }
  if (!artifact && obj.details && typeof obj.details === 'object') {
    const details = obj.details as Record<string, unknown>;
    if (details.artifact) artifact = details.artifact as AnyArtifact;
  }
  if (!artifact) return null;
  const artifactType = (artifact as { type?: string }).type as ArtifactType | undefined;
  if (!artifactType) return null;
  const legacyTypes: ArtifactType[] = [
    'pdf_summary',
    'table',
    'action_items',
    'chart',
    'code',
    'list',
    'created_entity',
    'docling_images',
  ];
  if (ZOD_VALIDATED_ARTIFACT_TYPES.has(artifactType)) {
    const validated = tryParseArtifact(artifactType, artifact);
    if (!validated.ok) return null;
    return validated.value as AnyArtifact;
  }
  if (!legacyTypes.includes(artifactType)) return null;
  return artifact;
}

export interface ResourceItem {
  id: string;
  title: string;
  type: string;
  snippet?: string;
  similarity?: number;
}

export function parseResourceItems(toolName: string, result: unknown): ResourceItem[] | null {
  const n = (toolName || '').toLowerCase();
  if (!n.includes('resource_list') && !n.includes('resource_search') && !n.includes('resource_semantic')) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  } else {
    parsed = result;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const arr = Array.isArray(obj.results) ? obj.results : Array.isArray(obj.resources) ? obj.resources : null;
  if (!arr) return null;
  return arr
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || ''),
      title: String(item.title || '(sin título)'),
      type: String(item.type || 'resource'),
      snippet: typeof item.snippet === 'string' ? item.snippet : undefined,
      similarity: typeof item.similarity === 'number' ? item.similarity : undefined,
    }))
    .filter((item) => item.id);
}

/** Format args as a short single-line summary, truncated at ~60 chars */
export function formatArgsSummary(args: Record<string, unknown>): string {
  const parts = Object.entries(args || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  const joined = parts.join(', ');
  if (joined.length > 60) return joined.slice(0, 60) + '…';
  return joined;
}

const SUMMARY_MAX = 72;

function clipSummary(value: string, max = SUMMARY_MAX): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Shorten a filesystem path to its last two segments.
 *
 * A tool card showing `/Users/me/Documents/proyectos/dome/electron/tools/x.cjs`
 * is mostly noise: the tail is what identifies the file, and every path in a run
 * shares the same prefix anyway.
 */
function shortenPath(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const segments = raw.split('/').filter(Boolean);
  if (segments.length <= 2) return raw;
  return segments.slice(-2).join('/');
}

function firstString(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = args?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/**
 * Which argument is the headline for a given tool, and how to render it.
 *
 * A table rather than a chain of `if`s: adding a tool means adding a row, and a
 * name that no longer exists is visible as a dead row instead of hiding inside
 * a condition that silently never matches.
 */
const TOOL_SUMMARY_SPECS: Record<
  string,
  { keys: string[]; render?: (value: string, args: Record<string, unknown>) => string }
> = {
  file_read: { keys: ['file_path', 'path'], render: shortenPath },
  file_write: { keys: ['file_path', 'path'], render: shortenPath },
  file_edit: { keys: ['file_path', 'path'], render: shortenPath },
  file_list: { keys: ['file_path', 'path'], render: shortenPath },
  file_tree: { keys: ['file_path', 'path'], render: shortenPath },
  file_grep: {
    keys: ['pattern'],
    render: (value, args) => {
      const where = shortenPath(args.path ?? args.directory);
      return where ? `"${value}" in ${where}` : `"${value}"`;
    },
  },
  file_find: {
    keys: ['pattern'],
    render: (value, args) => {
      const where = shortenPath(args.path ?? args.directory);
      return where ? `${value} in ${where}` : value;
    },
  },
  file_search: {
    keys: ['pattern'],
    render: (value, args) => {
      const where = shortenPath(args.directory);
      return where ? `${value} in ${where}` : value;
    },
  },
  shell_exec: { keys: ['command'] },
  git_status: { keys: [] },
  git_diff: {
    keys: ['path'],
    render: (value, args) => {
      const scope = value ? shortenPath(value) : '';
      const staged = args.staged === true ? 'staged' : '';
      return [staged, scope].filter(Boolean).join(' · ') || 'working tree';
    },
  },
  git_log: { keys: [], render: (_v, args) => `last ${args.limit ?? 20}` },
  git_add: {
    keys: ['path'],
    render: (value, args) =>
      Array.isArray(args.paths) ? args.paths.map(shortenPath).join(', ') : shortenPath(value),
  },
  git_commit: { keys: ['message'] },
  git_branch_create: { keys: ['name'] },
  task: {
    keys: ['subagent_type', 'subagentType', 'agent', 'name'],
    render: (value, args) => {
      const desc = firstString(args, ['prompt', 'task', 'description']);
      return desc ? `${value}: ${desc}` : value;
    },
  },
  delegate_to_agent: {
    keys: ['subagent_type', 'agent', 'name'],
    render: (value, args) => {
      const desc = firstString(args, ['prompt', 'task', 'description']);
      return desc ? `${value}: ${desc}` : value;
    },
  },
  web_search: { keys: ['query', 'q'], render: (value) => `"${value}"` },
  web_fetch: { keys: ['url'] },
  resource_search: { keys: ['query', 'q'], render: (value) => `"${value}"` },
  skill_read: {
    keys: ['skill_id'],
    render: (value, args) => {
      const path = firstString(args, ['path']);
      return path ? `${value}/${path}` : value;
    },
  },
  get_tool_definition: { keys: ['tool_name'] },
  dome_load_doc: { keys: ['id', 'doc_id'] },
};

/** Human-readable one-liner summary for a tool card. */
export function smartToolSummary(name: string, args: Record<string, unknown>): string {
  const safeArgs = args && typeof args === 'object' ? args : {};
  const spec = TOOL_SUMMARY_SPECS[String(name || '').toLowerCase()];
  if (!spec) return formatArgsSummary(safeArgs);

  const value = firstString(safeArgs, spec.keys);
  if (!value && !spec.render) return '';
  const rendered = spec.render ? spec.render(value, safeArgs) : value;
  return clipSummary(rendered);
}

/** Extract a code preview from a filesystem/codegen tool's arguments, or null. */
export function getCodegenPreview(
  name: string,
  args: Record<string, unknown>,
): { path: string; code: string; lang: string; truncated: boolean } | null {
  const n = (name || '').toLowerCase();
  if (n !== 'write_file' && n !== 'file_write' && n !== 'edit_file') return null;
  const path = String(args.file_path ?? args.path ?? '');
  let code = '';
  if (typeof args.content === 'string') code = args.content;
  else if (typeof args.new_string === 'string') code = args.new_string;
  else if (typeof args.text === 'string') code = args.text;
  if (!code.trim()) return null;

  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : '';
  const lang = EXT_LANG[ext] ?? '';

  const lines = code.split('\n');
  let truncated = false;
  let preview = code;
  if (lines.length > CODEGEN_MAX_LINES) {
    preview = lines.slice(0, CODEGEN_MAX_LINES).join('\n');
    truncated = true;
  }
  if (preview.length > CODEGEN_MAX_CHARS) {
    preview = preview.slice(0, CODEGEN_MAX_CHARS);
    truncated = true;
  }
  return { path, code: preview, lang, truncated };
}

