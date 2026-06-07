
import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Globe,
  Search,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  ChevronRight,
  Database,
  Plug,
  FileTextIcon,
  Image,
  PlusCircle,
  Calendar,
  ShoppingBag,
  GitBranch,
  Crop,
  Layers,
  Bot,
  Zap,
  Network,
  GraduationCap,
  FileCode2,
  FilePlus2,
  FilePenLine,
  Terminal,
  FolderTree,
  FolderSearch,
  Users,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactCard, { type AnyArtifact, type ArtifactType } from './ArtifactCard';
import ChatTodoList, { parseTodos } from './ChatTodoList';
import { tryParseArtifact, ZOD_VALIDATED_ARTIFACT_TYPES } from '@/lib/chat/artifactSchemas';
import { useManyStore } from '@/lib/store/useManyStore';
import { parseContentImages, parseImageResult } from '@/lib/chat/image-tool-utils';
import DomeCollapsibleRow from '@/components/ui/DomeCollapsibleRow';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import { getSubagentDisplayLabel } from '@/lib/chat/toolCatalog';
import { getToolDisplayLabel, getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';
import { extractCalendarEventFromToolResult, unwrapToolResultPayload } from '@/lib/chat/calendarToolArtifact';
import { JsonPrettyPrinterRoot } from '@/lib/chat/jsonPrettyPrinter';
import { isFilesystemTreeTool, parseTreeToolSummary } from '@/lib/chat/treeToolSummary';
import { stableStringHash } from '@/lib/utils/stableStringHash';

/**
 * ChatToolCard - Polished display for tool calls with category color system
 */

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  /** Name of the subagent that produced this call (deepagents `task` delegation). */
  agentName?: string;
}

export type ChatToolSurfaceVariant = 'default' | 'many';

interface ChatToolCardProps {
  toolCall: ToolCallData;
  className?: string;
  surfaceVariant?: ChatToolSurfaceVariant;
}

type ToolCategory = 'search' | 'file' | 'agent' | 'db' | 'mcp' | 'default';

/** Category color accent (border/dot color) using CSS variables for theme compatibility */
const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: 'var(--accent)',   // blue
  file: 'var(--success)',     // green
  agent: 'var(--accent)',    // purple
  db: 'var(--warning)',       // orange
  mcp: 'var(--secondary-text)',      // gray
  default: 'var(--secondary-text)',  // gray
};

function getCategory(name: string): ToolCategory {
  const n = (name || '').toLowerCase();
  if (n.includes('search') || n.includes('web_fetch') || n.includes('web_search') || n.includes('fetch')) return 'search';
  if (n.includes('calendar')) return 'db';
  if (n.includes('marketplace')) return 'mcp';
  if (n.includes('flashcard')) return 'file';
  if (n.includes('pdf') || n.includes('file') || n.includes('resource') || n.includes('image') || n.includes('notebook')) return 'file';
  if (n === 'glob' || n === 'ls' || n.includes('shell') || n.includes('codegen')) return 'file';
  if (n === 'task' || n.includes('subagent') || n.includes('agent') || n.includes('call_') || n.includes('delegate')) return 'agent';
  if (n.includes('postgres') || n.includes('sql') || n.includes('query') || n.includes('database') || n.includes('db')) return 'db';
  if (n.startsWith('mcp') || n.includes('mcp_')) return 'mcp';
  return 'default';
}

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Search,
  web_fetch: Globe,
  deep_research: Search,
  file_search: FolderSearch,
  delegate_to_agent: Users,
  resource_create: FileText,
  resource_get: FileText,
  resource_search: Search,
  call_research_agent: Search,
  call_library_agent: FileText,
  call_writer_agent: FileText,
  call_data_agent: Database,
  start_async_subagent_task: GitBranch,
  check_async_subagent_task: GitBranch,
  update_async_subagent_task: GitBranch,
  cancel_async_subagent_task: GitBranch,
  list_async_subagent_tasks: GitBranch,
  notebook_add_cell: FileText,
  notebook_update_cell: FileText,
  notebook_delete_cell: FileText,
  pdf_extract_text: FileTextIcon,
  pdf_get_metadata: FileTextIcon,
  pdf_get_structure: FileTextIcon,
  pdf_summarize: FileTextIcon,
  pdf_extract_tables: FileTextIcon,
  pdf_render_page: Image,
  marketplace_search: ShoppingBag,
  marketplace_install: ShoppingBag,
  browser_get_active_tab: Globe,
  workflow_create: GitBranch,
  agent_create: Bot,
  automation_create: Zap,
  image_crop: Crop,
  image_thumbnail: Layers,
  generate_mindmap: Network,
  generate_quiz: GraduationCap,
  generate_knowledge_graph: Network,
  calendar_list_events: Calendar,
  calendar_list: Calendar,
  calendar_get_upcoming: Calendar,
  calendar_create: Calendar,
  calendar_create_event: Calendar,
  calendar_update: Calendar,
  calendar_update_event: Calendar,
  calendar_delete: Calendar,
  calendar_delete_event: Calendar,
  flashcard_create: Layers,
  // Filesystem / codegen (deepagents harness + Dome aliases)
  write_file: FilePlus2,
  file_write: FilePlus2,
  edit_file: FilePenLine,
  read_file: FileCode2,
  file_read: FileCode2,
  glob: FolderSearch,
  ls: FolderTree,
  file_list: FolderTree,
  file_tree: FolderTree,
  shell_exec: Terminal,
  // Subagent delegation (deepagents `task`)
  task: Users,
};

function renderToolSuccessHighlight(
  toolName: string,
  rawResult: unknown,
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string,
): ReactNode | null {
  const cal = extractCalendarEventFromToolResult(toolName, rawResult);
  if (cal) {
    return (
      <div
        className="rounded-md border p-2.5 space-y-1"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          <Calendar className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="truncate">{cal.title || t('chat.calendar_event_untitled', { defaultValue: 'Evento' })}</span>
        </div>
        {cal.startLabel ? (
          <p className="text-[12px]" style={{ color: 'var(--secondary-text)' }}>
            {cal.startLabel}
            {cal.endLabel && cal.endLabel !== cal.startLabel ? ` → ${cal.endLabel}` : ''}
          </p>
        ) : null}
        {cal.location ? (
          <p className="text-[12px]" style={{ color: 'var(--tertiary-text)' }}>
            {cal.location}
          </p>
        ) : null}
        {cal.id ? (
          <p className="text-[12px] font-mono opacity-70 truncate" style={{ color: 'var(--tertiary-text)' }}>
            {cal.id}
          </p>
        ) : null}
      </div>
    );
  }

  const parsed = unwrapToolResultPayload(rawResult);
  if (!parsed) return null;
  const n = (toolName || '').toLowerCase();
  const ok = parsed.success === true || parsed.status === 'success';

  if (n === 'flashcard_create' && ok && parsed.deck && typeof parsed.deck === 'object') {
    const deck = parsed.deck as Record<string, unknown>;
    const title = String(deck.title || '');
    const count = typeof deck.card_count === 'number' ? deck.card_count : 0;
    return (
      <div
        className="rounded-md border p-2.5 space-y-1"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--success) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          <Layers className="size-3.5 shrink-0 text-[var(--success)]" aria-hidden />
          <span className="truncate">{title}</span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--secondary-text)' }}>
          {t('chat.flashcard_deck_count', { count, defaultValue: '{{count}} tarjetas' })}
        </p>
      </div>
    );
  }

  if (n === 'resource_create' && ok && parsed.resource && typeof parsed.resource === 'object') {
    const r = parsed.resource as Record<string, unknown>;
    const title = String(r.title || '');
    const id = String(r.id || '');
    const typ = String(r.type || '');
    return (
      <div
        className="rounded-md border p-2.5 flex gap-2 items-start"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
      >
        <FileText className="size-3.5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--primary-text)' }}>
            {title}
          </p>
          <p className="text-[12px] font-mono opacity-70 truncate" style={{ color: 'var(--tertiary-text)' }}>
            {typ} · {id}
          </p>
        </div>
      </div>
    );
  }

  const st = parsed.status;
  if (st === 'success') {
    const thumb = typeof parsed.thumbnail === 'string' ? parsed.thumbnail : '';
    const cropped = typeof parsed.croppedImage === 'string' ? parsed.croppedImage : '';
    const src = cropped || thumb;
    if (src.startsWith('data:')) {
      return (
        <img
          src={src}
          alt=""
          className="max-w-[220px] max-h-[160px] object-contain rounded-md border border-[var(--border)]"
        />
      );
    }
  }

  return null;
}

function getIconForTool(name: string): typeof Globe {
  const norm = (name || '').toLowerCase();
  if (TOOL_ICONS[norm]) return TOOL_ICONS[norm];
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query') || norm.includes('database')) return Database;
  if (norm.includes('mcp_') || norm.startsWith('mcp')) return Plug;
  return Globe;
}

/** Parse result as document-style array [{ content, metadata }] */
function parseDocumentResult(result: unknown): Array<{ content?: string; metadata?: Record<string, unknown> }> | null {
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
function parseArtifactResult(result: unknown): AnyArtifact | null {
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

interface ResourceItem {
  id: string;
  title: string;
  type: string;
  snippet?: string;
  similarity?: number;
}

function parseResourceItems(toolName: string, result: unknown): ResourceItem[] | null {
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
function formatArgsSummary(args: Record<string, unknown>): string {
  const parts = Object.entries(args || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  const joined = parts.join(', ');
  if (joined.length > 60) return joined.slice(0, 60) + '…';
  return joined;
}

/** Human-readable one-liner summary for the many panel card style */
function smartToolSummary(name: string, args: Record<string, unknown>): string {
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

const EXT_LANG: Record<string, string> = {
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS',
  js: 'JS', jsx: 'JSX', mjs: 'JS', cjs: 'JS',
  ts: 'TS', tsx: 'TSX', py: 'Python', rb: 'Ruby', go: 'Go',
  rs: 'Rust', java: 'Java', json: 'JSON', md: 'Markdown',
  sh: 'Shell', bash: 'Shell', yml: 'YAML', yaml: 'YAML', sql: 'SQL', toml: 'TOML',
};

const CODEGEN_MAX_LINES = 48;
const CODEGEN_MAX_CHARS = 2400;

/** Extract a code preview from a filesystem/codegen tool's arguments, or null. */
function getCodegenPreview(
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

function CodegenPreview({
  preview,
  t,
}: {
  preview: { path: string; code: string; lang: string; truncated: boolean };
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string;
}) {
  const fileName = preview.path ? preview.path.split('/').slice(-1)[0] : '';
  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <FileCode2 className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />
        <span
          className="text-[11.5px] font-mono truncate flex-1"
          style={{ color: 'var(--secondary-text)' }}
          title={preview.path}
        >
          {fileName || preview.path}
        </span>
        {preview.lang ? (
          <DomeBadge label={preview.lang} variant="soft" size="xs" color="var(--tertiary-text)" className="shrink-0" />
        ) : null}
      </div>
      <pre
        style={{
          fontSize: 11.5,
          lineHeight: 1.5,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          whiteSpace: 'pre',
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 280,
          color: 'var(--primary-text)',
          padding: '8px 10px',
          margin: 0,
        }}
      >
        {preview.code}
      </pre>
      {preview.truncated ? (
        <div
          className="px-2.5 py-1 text-[11px] border-t"
          style={{ borderColor: 'var(--border)', color: 'var(--tertiary-text)' }}
        >
          {t('chat.codegen_truncated', { defaultValue: '… vista previa truncada' })}
        </div>
      ) : null}
    </div>
  );
}

function renderTreeToolSummary(summary: ReturnType<typeof parseTreeToolSummary>, t: (key: string, opts?: { defaultValue?: string }) => string) {
  if (!summary) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 12,
        color: 'var(--secondary-text)',
        padding: '8px 10px',
        background: 'var(--bg-tertiary)',
        borderRadius: 4,
      }}
    >
      {summary.path ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_path', { defaultValue: 'Ruta' })}: </span>
          <span style={{ wordBreak: 'break-all' }}>{summary.path}</span>
        </div>
      ) : null}
      {summary.shown != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_entries', { defaultValue: 'Entradas' })}: </span>
          {summary.shown}
          {summary.truncated ? ` (${t('chat.tree_tool_truncated', { defaultValue: 'truncado' })})` : ''}
        </div>
      ) : null}
      {summary.max_depth != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_depth', { defaultValue: 'Profundidad' })}: </span>
          {summary.max_depth}
        </div>
      ) : null}
      {summary.node_count != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_nodes', { defaultValue: 'Nodos' })}: </span>
          {summary.node_count}
        </div>
      ) : null}
      <p style={{ margin: 0, opacity: 0.85 }}>
        {t('chat.tree_tool_hint', {
          defaultValue: 'Usa file_list o file_tree acotado en lugar de directory_tree en carpetas grandes.',
        })}
      </p>
    </div>
  );
}

export default function ChatToolCard({ toolCall, className = '', surfaceVariant = 'default' }: ChatToolCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();

  const Icon = getIconForTool(toolCall.name);
  const label = getToolDisplayLabelForCall(toolCall, t);
  const category = getCategory(toolCall.name);
  const accentColor = CATEGORY_COLORS[category];

  // Subagent delegation: explicit relay (agentName) or the deepagents `task` target.
  const rawSubagentKey =
    toolCall.agentName ||
    (toolCall.name === 'task' || toolCall.name === 'delegate_to_agent'
      ? String(
          (toolCall.arguments?.subagent_type as string) ??
            (toolCall.arguments?.subagentType as string) ??
            (toolCall.arguments?.agent as string) ??
            (toolCall.arguments?.name as string) ??
            '',
        )
      : '');
  const subagentName = rawSubagentKey ? getSubagentDisplayLabel(rawSubagentKey, t) : '';
  const showSubagentBadge =
    !!subagentName && toolCall.name !== 'task' && toolCall.name !== 'delegate_to_agent';

  const documentItems = useMemo(() => parseDocumentResult(toolCall.result), [toolCall.result]);
  const artifactItems = useMemo(() => parseArtifactResult(toolCall.result), [toolCall.result]);
  const imageItems = useMemo(() => parseImageResult(toolCall.result), [toolCall.result]);
  const contentImages = useMemo(() => parseContentImages(toolCall.result), [toolCall.result]);
  const resourceItems = useMemo(() => parseResourceItems(toolCall.name, toolCall.result), [toolCall.name, toolCall.result]);
  const treeToolSummary = useMemo(() => {
    if (!isFilesystemTreeTool(toolCall.name)) return null;
    return parseTreeToolSummary(toolCall.result);
  }, [toolCall.name, toolCall.result]);
  const pinnedIds = useMemo(() => new Set(pinnedResources.map((r) => r.id)), [pinnedResources]);

  const formatResult = (result: unknown): string => {
    if (typeof result === 'string') return result;
    if (result === null || result === undefined) return '';
    try { return JSON.stringify(result, null, 2); } catch { return String(result); }
  };

  const parsedResult = useMemo(() => {
    if (!toolCall.result) return null;
    if (typeof toolCall.result === 'object') return toolCall.result;
    if (typeof toolCall.result === 'string') {
      try { return JSON.parse(toolCall.result); } catch { return null; }
    }
    return null;
  }, [toolCall.result]);

  // write_todos → dedicated checklist UI instead of a generic JSON tool card
  if (toolCall.name === 'write_todos') {
    const todos = parseTodos(toolCall.arguments);
    if (todos.length > 0) return <ChatTodoList todos={todos} />;
  }

  const resultText = formatResult(toolCall.result);
  const isPending = toolCall.status === 'pending' || toolCall.status === 'running';
  const argsSummary = formatArgsSummary(toolCall.arguments);

  // Soft confirmation requested by tool (needs_confirmation status)
  const needsConfirmation = (parsedResult as Record<string, unknown> | null)?.status === 'needs_confirmation';

  const handleSoftConfirm = (approved: boolean) => {
    const text = approved ? 'Sí, confirmo.' : 'No, cancela.';
    window.dispatchEvent(new CustomEvent('dome:quick-reply', { detail: { text } }));
  };

  const renderResultContent = () => {
    // Inline approval UI for soft confirmations (needs_confirmation pattern)
    if (needsConfirmation && toolCall.status === 'success') {
      const msg = (parsedResult as Record<string, unknown>)?.error;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '8px 10px',
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--secondary-text)', margin: 0 }}>
            {typeof msg === 'string' ? msg : 'Esta acción requiere confirmación.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => handleSoftConfirm(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => handleSoftConfirm(true)}
            >
              Confirmar
            </button>
          </div>
        </div>
      );
    }

    if (toolCall.error) {
      return (
        <div
          style={{
            fontSize: 12,
            color: 'var(--error)',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--error) 8%, transparent)',
            borderRadius: 4,
          }}
        >
          {toolCall.error}
        </div>
      );
    }

    if (!showRawJson) {
      if (treeToolSummary) {
        return renderTreeToolSummary(treeToolSummary, t);
      }
      const codegen = getCodegenPreview(toolCall.name, toolCall.arguments);
      if (codegen) {
        return <CodegenPreview preview={codegen} t={t} />;
      }
      const highlight = renderToolSuccessHighlight(toolCall.name, toolCall.result, t);
      if (highlight) {
        return <div style={{ marginTop: 4 }}>{highlight}</div>;
      }
    }

    if (showRawJson) {
      return (
        <pre
          style={{
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowY: 'auto',
            maxHeight: 256,
            color: 'var(--secondary-text)',
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            padding: '8px 10px',
            margin: 0,
          }}
        >
          {resultText}
        </pre>
      );
    }

    if (documentItems && documentItems.length > 0) {
      const counts = new Map<string, number>();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {documentItems.map((item) => {
            const h = stableStringHash(JSON.stringify(item));
            const ord = (counts.get(h) ?? 0) + 1;
            counts.set(h, ord);
            return (
            <div key={`doc:${h}:${ord}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.metadata?.title != null && (
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', margin: 0 }}>
                  {String(item.metadata.title)}
                </p>
              )}
              {item.content && (
                <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>
                  <MarkdownRenderer content={typeof item.content === 'string' ? item.content : ''} />
                </div>
              )}
            </div>
            );
          })}
        </div>
      );
    }

    if (artifactItems) {
      return (
        <div style={{ marginTop: 6 }}>
          <ArtifactCard artifact={artifactItems} />
        </div>
      );
    }

    if (contentImages && contentImages.length > 0) {
      const imgCounts = new Map<string, number>();
      return (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contentImages.map((item) => {
            const h = stableStringHash(item.dataUrl);
            const ord = (imgCounts.get(h) ?? 0) + 1;
            imgCounts.set(h, ord);
            const figureN = ord;
            return (
            <div key={`fig:${h}:${ord}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.label && (
                <p style={{ fontSize: 12, color: 'var(--secondary-text)', margin: 0 }}>{item.label}</p>
              )}
              <img
                src={item.dataUrl}
                alt={item.label || `Figure ${figureN}`}
                style={{
                  maxWidth: 280,
                  maxHeight: 200,
                  objectFit: 'contain',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              />
            </div>
            );
          })}
        </div>
      );
    }

    if (imageItems) {
      return (
        <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img
            src={imageItems.dataUrl}
            alt={imageItems.alt || t('chat.tool_image_processed')}
            style={{
              maxWidth: 200,
              maxHeight: 200,
              objectFit: 'contain',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>
            <p style={{ fontWeight: 600, color: 'var(--primary-text)', margin: '0 0 4px' }}>{t('chat.tool_image_processed')}</p>
            <p style={{ opacity: 0.7, margin: 0 }}>{t('chat.tool_image_expand')}</p>
          </div>
        </div>
      );
    }

    // Resource list/search results with add-to-context buttons
    if (resourceItems && resourceItems.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {resourceItems.map((item) => {
            const isPinned = pinnedIds.has(item.id);
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '5px 6px',
                  borderRadius: 5,
                  border: '1px solid var(--border)',
                  background: isPinned ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'var(--bg-tertiary)',
                }}
              >
                <FileText style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2, color: 'var(--tertiary-text)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--primary-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                  {item.snippet && (
                    <span style={{ fontSize: 12, color: 'var(--tertiary-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.snippet}
                    </span>
                  )}
                </div>
                {item.similarity != null && (
                  <DomeBadge
                    label={`${Math.round(item.similarity * 100)}%`}
                    variant="soft"
                    size="xs"
                    color="var(--tertiary-text)"
                    className="shrink-0 mt-0.5"
                  />
                )}
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  iconOnly
                  onClick={() => {
                    if (isPinned) {
                      removePinnedResource(item.id);
                    } else {
                      addPinnedResource({ id: item.id, title: item.title, type: item.type });
                    }
                  }}
                  title={isPinned ? t('chat.remove_from_context') : t('chat.add_to_context')}
                  aria-label={isPinned ? t('chat.remove_from_context') : t('chat.add_to_context')}
                  className="!p-0 size-5 min-w-0 shrink-0 text-[var(--tertiary-text)] hover:text-[var(--accent)]"
                >
                  {isPinned ? (
                    <CheckCircle2 className="w-[13px] h-[13px]" />
                  ) : (
                    <PlusCircle className="w-[13px] h-[13px]" />
                  )}
                </DomeButton>
              </div>
            );
          })}
        </div>
      );
    }

    // JSON pretty view for objects/arrays
    if (parsedResult && typeof parsedResult === 'object') {
      return (
        <div
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            overflowY: 'auto',
            maxHeight: 256,
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            padding: '8px 10px',
          }}
        >
          <JsonPrettyPrinterRoot value={parsedResult} />
        </div>
      );
    }

    return (
      <pre
        style={{
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowY: 'auto',
          maxHeight: 256,
          color: 'var(--secondary-text)',
          background: 'var(--bg-tertiary)',
          borderRadius: 4,
          padding: '8px 10px',
          margin: 0,
        }}
      >
        {resultText}
      </pre>
    );
  };

  const hasResult = Boolean(toolCall.result || toolCall.error);
  const canExpand = !isPending && hasResult;
  const cardSummary = smartToolSummary(toolCall.name, toolCall.arguments);

  // ── Many panel: new card-based design ──────────────────────────────────────
  if (surfaceVariant === 'many') {
    const stateKey = isPending ? (toolCall.status === 'running' ? 'running' : 'pending') : toolCall.status;
    return (
      <div className={`many-tool-card-v2 state-${stateKey} ${className}`.trim()}>
        <button
          type="button"
          className="many-tool-card-v2-trigger"
          onClick={() => { if (canExpand) setExpanded((o) => !o); }}
          aria-expanded={expanded}
        >
          {/* Icon box */}
          <div className={`many-tool-card-v2-icon state-${stateKey}`}>
            {isPending
              ? <Loader2 size={12} className="many-tool-spinner animate-spin" />
              : <Icon size={14} strokeWidth={1.8} />}
          </div>

          {/* Label + summary */}
          <div className="many-tool-card-v2-copy">
            <span className="many-tool-card-v2-title">
              {label}
              {showSubagentBadge ? (
                <DomeBadge
                  label={subagentName}
                  variant="soft"
                  size="xs"
                  color="var(--accent)"
                  className="ml-1.5 align-middle"
                />
              ) : null}
            </span>
            {cardSummary ? <span className="many-tool-card-v2-summary">{cardSummary}</span> : null}
          </div>

          <div className="many-tool-card-v2-trail">
            {toolCall.status === 'success' && !isPending ? (
              <Check size={12} strokeWidth={2.4} className="many-tool-card-v2-status-icon" aria-hidden />
            ) : null}
            {toolCall.status === 'error' && !isPending ? (
              <XCircle size={12} className="many-tool-card-v2-status-icon is-error" aria-hidden />
            ) : null}
            {canExpand ? (
              <ChevronRight
                size={14}
                className={`many-tool-card-v2-chevron ${expanded ? 'expanded' : ''}`}
                aria-hidden
              />
            ) : null}
          </div>
        </button>

        {/* Expanded body */}
        {expanded && canExpand ? (
          <div className="many-tool-card-v2-body is-detail">
            {/* Args */}
            {Object.keys(toolCall.arguments).length > 0 && (
              <>
                <div className="many-tool-card-v2-section-label">Args</div>
                <dl className="many-tool-card-v2-kv" style={{ marginBottom: 10 }}>
                  {Object.entries(toolCall.arguments).slice(0, 4).map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{k}</dt>
                      <dd style={{ color: typeof v === 'string' ? 'var(--accent)' : typeof v === 'number' ? 'var(--info)' : 'var(--primary-text)' }}>
                        {typeof v === 'string' ? `"${v.slice(0, 120)}"` : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {/* Result */}
            {!toolCall.error && hasResult ? (
              <>
                <div className="many-tool-card-v2-section-label">Result</div>
                <div className="mb-1.5">
                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="!h-auto !px-0 !py-0 font-mono text-[11px] underline text-[var(--tertiary-text)] opacity-70 hover:opacity-100"
                  >
                    {showRawJson ? t('chat.formatted_view') : t('chat.view_json')}
                  </DomeButton>
                </div>
              </>
            ) : null}
            {renderResultContent()}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Default surface: original left-border style ────────────────────────────
  return (
    <div
      className={className}
      style={{
        minWidth: 0,
        maxWidth: '100%',
        fontSize: 13,
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
        background: 'color-mix(in srgb, var(--bg-secondary) 86%, transparent)',
        transition: 'background 150ms ease',
      }}
    >
      <DomeCollapsibleRow
        expanded={expanded}
        onExpandedChange={(next) => {
          if (canExpand) setExpanded(next);
        }}
        disabled={isPending || !canExpand}
        triggerClassName="!px-2 !py-1.5 rounded-r-md"
        trigger={
          <>
            <div className="flex shrink-0 size-4 items-center justify-center">
              {isPending ? (
                <Loader2 className="w-[13px] h-[13px] animate-spin" style={{ color: accentColor }} />
              ) : toolCall.status === 'error' ? (
                <XCircle className="w-[13px] h-[13px] text-[var(--error)]" />
              ) : toolCall.status === 'success' ? (
                <CheckCircle2 className="w-[13px] h-[13px] text-[var(--success)]" />
              ) : (
                <Icon className="w-[13px] h-[13px] text-[var(--tertiary-text)]" />
              )}
            </div>
            <span className="flex flex-col min-w-0 flex-1">
              <span
                className="text-[13px] font-semibold leading-snug"
                style={{ color: isPending ? 'var(--primary-text)' : 'var(--secondary-text)' }}
              >
                {label}
                {showSubagentBadge ? (
                  <DomeBadge
                    label={subagentName}
                    variant="soft"
                    size="xs"
                    color="var(--accent)"
                    className="ml-1.5 align-middle"
                  />
                ) : null}
              </span>
              {argsSummary ? (
                <span className="text-[var(--tertiary-text)] leading-snug mt-px truncate text-[12px]">
                  {argsSummary}
                </span>
              ) : null}
            </span>
          </>
        }
        panelClassName="!pl-2 !pb-1.5 !ml-2 border-l border-[var(--border)]"
      >
        {canExpand ? (
          <div className="pt-1.5 pl-4">
            {!toolCall.error && hasResult ? (
              <div className="mb-1.5">
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="!h-auto !px-0 !py-0 font-mono text-[12px] underline text-[var(--tertiary-text)] opacity-70 hover:opacity-100"
                >
                  {showRawJson ? t('chat.formatted_view') : t('chat.view_json')}
                </DomeButton>
              </div>
            ) : null}
            {renderResultContent()}
          </div>
        ) : null}
      </DomeCollapsibleRow>
    </div>
  );
}

/** Grouped tool calls: compact header with count, expandable to show individual cards */
interface ChatToolCardGroupProps {
  name: string;
  calls: ToolCallData[];
  className?: string;
  surfaceVariant?: ChatToolSurfaceVariant;
}

interface SubagentToolSectionProps {
  agentKey: string;
  agentLabel: string;
  surfaceVariant?: ChatToolSurfaceVariant;
  className?: string;
  children: ReactNode;
}

/** Collapsible block grouping tools executed by one subagent delegation. */
export function SubagentToolSection({
  agentKey,
  agentLabel,
  surfaceVariant = 'default',
  className = '',
  children,
}: SubagentToolSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const childArray = useMemo(() => (Array.isArray(children) ? children : [children]).filter(Boolean), [children]);

  if (surfaceVariant === 'many') {
    return (
      <div className={`many-subagent-section ${className}`.trim()}>
        <button
          type="button"
          className="many-subagent-section-trigger"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
        >
          <Users size={14} strokeWidth={1.8} className="many-subagent-section-icon" aria-hidden />
          <span className="many-subagent-section-title">
            {t('chat.subagent_section_title', { agent: agentLabel, defaultValue: agentLabel })}
          </span>
          <DomeBadge label={agentKey} variant="soft" size="xs" color="var(--accent)" />
          <ChevronRight size={14} className={`many-tool-card-v2-chevron ml-auto ${expanded ? 'expanded' : ''}`} aria-hidden />
        </button>
        {expanded ? <div className="many-subagent-section-body space-y-1">{childArray}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        borderLeft: '2px solid var(--accent)',
        borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
        background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
        padding: '4px 0 4px 0',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left rounded-r-md hover:bg-[var(--bg-hover)]"
        aria-expanded={expanded}
      >
        <Users className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="text-[12px] font-semibold text-[var(--secondary-text)]">
          {t('chat.subagent_section_title', { agent: agentLabel, defaultValue: agentLabel })}
        </span>
        <ChevronRight className={`size-3.5 ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {expanded ? <div className="pl-3 pr-1 pb-1 flex flex-col gap-1">{childArray}</div> : null}
    </div>
  );
}

export function ChatToolCardGroup({
  name,
  calls,
  className = '',
  surfaceVariant = 'default',
}: ChatToolCardGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const Icon = getIconForTool(name);
  const label = getToolDisplayLabelForCall({ name, arguments: calls[0]?.arguments ?? {} }, t);
  const category = getCategory(name);
  const accentColor = CATEGORY_COLORS[category];
  const count = calls.length;
  const hasError = calls.some((c) => c.status === 'error');
  const hasPending = calls.some((c) => c.status === 'pending' || c.status === 'running');
  const allSuccess = calls.every((c) => c.status === 'success');
  const stateKey = hasPending ? 'running' : hasError ? 'error' : allSuccess ? 'success' : 'pending';

  // ── Many panel: card-based group ──────────────────────────────────────────
  if (surfaceVariant === 'many') {
    return (
      <div className={`many-tool-card-v2 state-${stateKey} ${className}`.trim()}>
        <button
          type="button"
          className="many-tool-card-v2-trigger"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
        >
          <div className={`many-tool-card-v2-icon state-${stateKey}`}>
            {hasPending
              ? <Loader2 size={12} className="many-tool-spinner animate-spin" />
              : <Icon size={14} strokeWidth={1.8} />}
          </div>
          <span className="many-tool-card-v2-copy">
            <span className="many-tool-card-v2-title">{t('chat.tool_group_count', { label, count })}</span>
          </span>
          <div className="many-tool-card-v2-trail">
            {allSuccess ? <Check size={12} strokeWidth={2.4} className="many-tool-card-v2-status-icon" aria-hidden /> : null}
            {hasError ? <XCircle size={12} className="many-tool-card-v2-status-icon is-error" aria-hidden /> : null}
            <ChevronRight size={14} className={`many-tool-card-v2-chevron ${expanded ? 'expanded' : ''}`} aria-hidden />
          </div>
        </button>
        {expanded ? (
          <div className="many-tool-card-v2-body is-nested">
            <div className="many-tool-card-v2-list">
              {calls.map((tc) => (
                <ChatToolCard key={tc.id} toolCall={tc} surfaceVariant={surfaceVariant} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Default surface: original left-border style ────────────────────────────
  return (
    <div
      className={className}
      style={{
        minWidth: 0,
        maxWidth: '100%',
        fontSize: 13,
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
        background: 'color-mix(in srgb, var(--bg-secondary) 86%, transparent)',
        transition: 'background 150ms ease',
      }}
    >
      <DomeCollapsibleRow
        expanded={expanded}
        onExpandedChange={setExpanded}
        triggerClassName="!px-2 !py-1.5 rounded-r-md"
        trigger={
          <>
            <div className="flex shrink-0 size-4 items-center justify-center">
              {hasPending ? (
                <Loader2 className="w-[13px] h-[13px] animate-spin" style={{ color: accentColor }} />
              ) : hasError ? (
                <XCircle className="w-[13px] h-[13px] text-[var(--error)]" />
              ) : allSuccess ? (
                <CheckCircle2 className="w-[13px] h-[13px] text-[var(--success)]" />
              ) : (
                <Icon className="w-[13px] h-[13px] text-[var(--tertiary-text)]" />
              )}
            </div>
            <span className="text-[13px] font-semibold text-[var(--secondary-text)] leading-snug">
              {t('chat.tool_group_count', { label, count })}
            </span>
          </>
        }
        panelClassName="!mt-0.5 !ml-2 !pl-3 border-l border-[var(--border)] flex flex-col gap-1"
      >
        {calls.map((tc) => (
          <ChatToolCard key={tc.id} toolCall={tc} surfaceVariant={surfaceVariant} />
        ))}
      </DomeCollapsibleRow>
    </div>
  );
}
