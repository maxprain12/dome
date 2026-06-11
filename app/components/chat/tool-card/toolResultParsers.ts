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

/** Human-readable one-liner summary for the many panel card style */
export function smartToolSummary(name: string, args: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === 'file_write' || n === 'write_file' || n === 'edit_file' || n.includes('resource_create') || n.includes('notebook')) {
    const fp = String(args.file_path ?? args.path ?? '');
    if (fp) return fp.split('/').slice(-2).join('/');
    const title = String(args.title ?? '');
    return title.length > 64 ? title.slice(0, 61) + '…' : title;
  }
  if (n === 'file_read' || n === 'read_file') {
    const fp = String(args.file_path ?? args.path ?? '');
    return fp ? fp.split('/').slice(-1)[0]! : 'file';
  }
  if (n === 'glob') return String(args.pattern ?? args.glob ?? '').slice(0, 64);
  if (n === 'ls' || n === 'file_list' || n === 'file_tree') {
    return String(args.file_path ?? args.path ?? args.dir ?? '').slice(0, 64);
  }
  if (n === 'task' || n === 'delegate_to_agent') {
    const sub = String(args.subagent_type ?? args.subagentType ?? args.agent ?? args.name ?? '');
    const desc = String(args.prompt ?? args.task ?? args.description ?? '');
    if (sub && desc) return `${sub}: ${desc}`.slice(0, 72);
    return (sub || desc).slice(0, 72);
  }
  if (n === 'shell_exec' || n.includes('shell')) {
    const cmd = String(args.command ?? '').trim();
    return cmd.length > 72 ? cmd.slice(0, 69) + '…' : cmd;
  }
  if (n.includes('web_search') || n.includes('resource_search') || n.includes('memory')) {
    return `"${String(args.query ?? args.q ?? '').slice(0, 60)}"`;
  }
  if (n.includes('web_fetch')) return String(args.url ?? '').slice(0, 72);
  if (n.includes('resource_get')) {
    return String(args.title ?? args.resourceId ?? args.id ?? '').slice(0, 64);
  }
  if (n.includes('calendar')) {
    return String(args.title ?? args.summary ?? '').slice(0, 64);
  }
  return formatArgsSummary(args);
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

