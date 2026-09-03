/**
 * ChatToolCard result/args parsers (03/T02 — extracted from ChatToolCard.tsx).
 * Pure functions: tool results → typed view models, arg summaries, codegen previews.
 */

import type { AnyArtifact, ArtifactType } from '../ArtifactCard';
import { tryParseArtifact, ZOD_VALIDATED_ARTIFACT_TYPES } from '@/lib/chat/artifactSchemas';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
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

const LEGACY_ARTIFACT_TYPES: ArtifactType[] = [
  'pdf_summary',
  'table',
  'action_items',
  'chart',
  'code',
  'list',
  'created_entity',
  'docling_images',
];

/** Coerce a tool result string/object into a parsed value (or null). */
function coerceToolResultJson(result: unknown): unknown | null {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }
  if (result && typeof result === 'object') return result;
  return null;
}

/** Pull `artifact` from MCP-style `content[0].text` JSON, if present. */
function artifactFromContentBlocks(content: unknown): AnyArtifact | undefined {
  if (!Array.isArray(content)) return undefined;
  const textContent = (content[0] as { text?: unknown } | undefined)?.text;
  if (typeof textContent !== 'string') return undefined;
  try {
    const parsed = JSON.parse(textContent);
    if (parsed?.artifact) return parsed.artifact as AnyArtifact;
  } catch {
    /* Not JSON */
  }
  return undefined;
}

/** Pull `artifact` from a nested `details` object, if present. */
function artifactFromDetails(details: unknown): AnyArtifact | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const nested = (details as Record<string, unknown>).artifact;
  return nested ? (nested as AnyArtifact) : undefined;
}

/** Resolve an artifact payload from the common tool-result shapes. */
function extractArtifactPayload(obj: Record<string, unknown>): AnyArtifact | undefined {
  if (obj.artifact && typeof obj.artifact === 'object') return obj.artifact as AnyArtifact;
  return artifactFromContentBlocks(obj.content) ?? artifactFromDetails(obj.details);
}

/** Accept Zod-validated or known legacy artifact types; reject everything else. */
function validateArtifactCandidate(artifact: AnyArtifact): AnyArtifact | null {
  const artifactType = (artifact as { type?: string }).type as ArtifactType | undefined;
  if (!artifactType) return null;
  if (ZOD_VALIDATED_ARTIFACT_TYPES.has(artifactType)) {
    const validated = tryParseArtifact(artifactType, artifact);
    return validated.ok ? (validated.value as AnyArtifact) : null;
  }
  return LEGACY_ARTIFACT_TYPES.includes(artifactType) ? artifact : null;
}

/** Parse result as artifact */
export function parseArtifactResult(result: unknown): AnyArtifact | null {
  if (!result) return null;
  const parsed = coerceToolResultJson(result);
  if (!parsed || typeof parsed !== 'object') return null;
  const artifact = extractArtifactPayload(parsed as Record<string, unknown>);
  if (!artifact) return null;
  return validateArtifactCandidate(artifact);
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

export const PEOPLE_INSPECT_TOOLS = new Set([
  'people_get',
  'people_upsert',
  'people_ingest',
  'people_link_identity',
]);

export function isPeopleInspectTool(name: string): boolean {
  return PEOPLE_INSPECT_TOOLS.has(String(name || '').toLowerCase());
}

export function isToolDefinitionInspect(name: string): boolean {
  return String(name || '').toLowerCase() === 'get_tool_definition';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Unwrap string JSON, MCP `content[0].text`, and `{ data }` envelopes. */
export function unwrapToolResultObject(result: unknown): Record<string, unknown> | null {
  let parsed: unknown = coerceToolResultJson(result);
  if (!parsed) return null;
  const root = asRecord(parsed);
  if (root) {
    const fromContent = Array.isArray(root.content)
      ? coerceToolResultJson((root.content[0] as { text?: unknown } | undefined)?.text)
      : null;
    const fromContentObj = asRecord(fromContent);
    if (fromContentObj) parsed = fromContentObj;
  }
  const obj = asRecord(parsed);
  if (!obj) return null;
  const data = asRecord(obj.data);
  if (data && !obj.person && !obj.people && !obj.definition) {
    return { ...obj, ...data };
  }
  return obj;
}

function readablePersonName(person: Record<string, unknown>): string {
  const name = String(person.displayName ?? person.display_name ?? '').trim();
  if (name && !looksLikeOpaqueId(name)) return name;
  const email = String(person.primaryEmail ?? person.primary_email ?? person.email ?? '').trim();
  if (email && !looksLikeOpaqueId(email)) return email;
  return '—';
}

function readableIdentityLabel(identity: Record<string, unknown>): string {
  const raw = String(identity.displayLabel ?? identity.display_label ?? '').trim();
  if (raw && raw !== '—' && !looksLikeOpaqueId(raw)) return raw;
  const ext = String(identity.externalId ?? identity.external_id ?? '').trim();
  if (ext && !looksLikeOpaqueId(ext)) return ext;
  const source = String(identity.source ?? '').replace(/_/g, ' ').trim();
  return source || '—';
}

function mapIdentityRows(value: unknown): Array<{ source: string; label: string }> {
  if (!Array.isArray(value)) return [];
  const rows: Array<{ source: string; label: string }> = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const source = String(rec.source ?? '').trim();
    rows.push({ source, label: readableIdentityLabel(rec) });
  }
  return rows;
}

function mapPersonRow(value: unknown): PeopleToolRow | null {
  const person = asRecord(value);
  if (!person) return null;
  const displayName = readablePersonName(person);
  const emailRaw = person.primaryEmail ?? person.primary_email ?? person.email;
  const email = typeof emailRaw === 'string' && emailRaw.trim() ? emailRaw.trim() : null;
  const statusRaw = person.leadStatus ?? person.lead_status;
  const leadStatus = typeof statusRaw === 'string' && statusRaw.trim() ? statusRaw.trim() : null;
  const idRaw = person.id ?? person.personId ?? person.person_id;
  const personId = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : undefined;
  return {
    displayName,
    email,
    leadStatus,
    identities: mapIdentityRows(person.identities),
    personId,
  };
}

export type PeopleToolRow = {
  displayName: string;
  email?: string | null;
  leadStatus?: string | null;
  identities: Array<{ source: string; label: string }>;
  personId?: string;
};

export type PeopleToolResultView = {
  rows: PeopleToolRow[];
  linked?: boolean;
  conflict?: boolean;
};

/** Structured view for people_get / upsert / ingest / link_identity — never dumps definition JSON. */
export function parsePeopleToolResult(result: unknown): PeopleToolResultView | null {
  const obj = unwrapToolResultObject(result);
  if (!obj) return null;

  const people = Array.isArray(obj.people) ? obj.people : null;
  if (people) {
    const rows = people.map(mapPersonRow).filter((row): row is PeopleToolRow => row != null);
    if (rows.length === 0) return null;
    return { rows };
  }

  const person = mapPersonRow(obj.person);
  if (person) {
    const identity = asRecord(obj.identity);
    if (identity && person.identities.length === 0) {
      person.identities = mapIdentityRows([identity]);
    }
    return {
      rows: [person],
      linked: typeof obj.linked === 'boolean' ? obj.linked : undefined,
      conflict: typeof obj.conflict === 'boolean' ? obj.conflict : undefined,
    };
  }

  return null;
}

export type ToolDefinitionView = {
  name: string;
  description: string;
};

/** name + description only; schema stays on the raw result for "View JSON". */
export function parseToolDefinitionResult(result: unknown): ToolDefinitionView | null {
  const obj = unwrapToolResultObject(result);
  if (!obj) return null;
  const definition = asRecord(obj.definition) ?? obj;
  const fn = asRecord(definition.function);
  const name = String(fn?.name ?? definition.name ?? obj.name ?? '').trim();
  const description = String(
    fn?.description ?? definition.description ?? obj.description ?? '',
  ).trim();
  if (!name && !description) return null;
  return { name: name || '—', description };
}

