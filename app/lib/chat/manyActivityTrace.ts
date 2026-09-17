import { canonicalToolName, type ToolLabelT } from '@/lib/chat/toolCatalog';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';

export type ActivityKind = 'steps' | 'search' | 'coding';

export type ActivityTraceKind = ActivityKind | 'reasoning';

export type ActivityToolStatus = 'pending' | 'running' | 'success' | 'error';

export type ActivityToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ActivityToolStatus;
  result?: unknown;
  error?: string;
  agentName?: string;
  contentOffset?: number;
};

export type CodingAction = 'read' | 'edit' | 'write' | 'run' | 'list';

export type ActivityTraceCopy = {
  thinking: string;
  reasoningDone: string;
  searching: string;
  searched: string;
  runningTools: string;
  coding: string;
  ranTools: (count: number) => string;
  stepsDone: (count: number) => string;
  moreResults: (count: number) => string;
  untitledResult: string;
  codingActions: Record<CodingAction, string>;
};

export type SearchHit = {
  title: string;
  url: string;
  siteName?: string;
};

export type ActivityTraceRow = {
  id: string;
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  status: ActivityToolStatus;
  toolCallId?: string;
};

export type ActivityCallGroup = {
  kind: ActivityKind | 'todos';
  calls: ActivityToolCall[];
};

export type ActivityFlatBlock =
  | { type: 'tool'; call: ActivityToolCall }
  | { type: 'tool-group'; name: string; calls: ActivityToolCall[] };

export type ActivityDisplayBlock =
  | ActivityFlatBlock
  | {
      type: 'subagent';
      agentKey: string;
      agentLabel: string;
      blocks: ActivityFlatBlock[];
    };

export type ActivitySegment =
  | { type: 'trace'; kind: ActivityKind; calls: ActivityToolCall[] }
  | { type: 'todos'; call: ActivityToolCall }
  | {
      type: 'subagent';
      agentKey: string;
      agentLabel: string;
      segments: ActivitySegment[];
    };

const SEARCH_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'deep_research',
]);

const CODING_TOOLS = new Set([
  'file_read',
  'file_write',
  'file_edit',
  'file_list',
  'file_tree',
  'file_search',
  'file_grep',
  'file_find',
  'shell_exec',
  'glob',
  'ls',
]);

const SEARCH_VISIBLE_CAP = 5;

function looksLikeOpaqueId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z]{1,12}-[0-9a-f]{6,}$/i.test(trimmed)) return true;
  if (/^soc-[a-z]+-[0-9a-f]{6,}$/i.test(trimmed)) return true;
  return false;
}

function coerceJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readableText(value: string, fallback = ''): string {
  const trimmed = value.trim();
  if (!trimmed || looksLikeOpaqueId(trimmed)) return fallback;
  return trimmed;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function fileNameFromPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

export function isToolWorking(status: ActivityToolStatus | undefined): boolean {
  return status === 'pending' || status === 'running';
}

export function isCallGroupWorking(calls: Array<{ status: ActivityToolStatus }>): boolean {
  return calls.some((call) => isToolWorking(call.status));
}

export function classifyToolKind(name: string): ActivityKind {
  const canonical = canonicalToolName(name);
  if (SEARCH_TOOLS.has(canonical) || canonical.startsWith('web_')) return 'search';
  if (CODING_TOOLS.has(canonical) || canonical.startsWith('git_') || canonical.startsWith('file_')) {
    return 'coding';
  }
  return 'steps';
}

export function groupCallsByContiguousKind(calls: ActivityToolCall[]): ActivityCallGroup[] {
  const groups: ActivityCallGroup[] = [];
  for (const call of calls) {
    const kind: ActivityCallGroup['kind'] = call.name === 'write_todos' ? 'todos' : classifyToolKind(call.name);
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && kind !== 'todos') {
      last.calls.push(call);
      continue;
    }
    groups.push({ kind, calls: [call] });
  }
  return groups;
}

function flattenDisplayBlocks(blocks: ActivityDisplayBlock[]): ActivityToolCall[] {
  const calls: ActivityToolCall[] = [];
  for (const block of blocks) {
    if (block.type === 'tool') calls.push(block.call);
    else if (block.type === 'tool-group') calls.push(...block.calls);
  }
  return calls;
}

function segmentsFromCallGroups(calls: ActivityToolCall[]): ActivitySegment[] {
  return groupCallsByContiguousKind(calls).map((group) =>
    group.kind === 'todos'
      ? { type: 'todos' as const, call: group.calls[0]! }
      : { type: 'trace' as const, kind: group.kind, calls: group.calls },
  );
}

export function activitySegmentsFromCalls(calls: ActivityToolCall[]): ActivitySegment[] {
  return segmentsFromCallGroups(calls);
}

/** Flatten chat display blocks into contiguous traces without reordering tools. */
export function activitySegmentsFromBlocks(blocks: ActivityDisplayBlock[]): ActivitySegment[] {
  const out: ActivitySegment[] = [];
  let pending: ActivityToolCall[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    out.push(...segmentsFromCallGroups(pending));
    pending = [];
  };

  for (const block of blocks) {
    if (block.type === 'subagent') {
      flushPending();
      out.push({
        type: 'subagent',
        agentKey: block.agentKey,
        agentLabel: block.agentLabel,
        segments: activitySegmentsFromBlocks(block.blocks),
      });
      continue;
    }
    pending.push(...flattenDisplayBlocks([block]));
  }
  flushPending();
  return out;
}

export function parseWebSearchQuery(
  args: Record<string, unknown> | undefined,
  result?: unknown,
): string {
  const fromArgs = readableText(firstString(args?.query, args?.q, args?.topic));
  if (fromArgs) return fromArgs;
  const parsed = coerceJson(result);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return readableText(firstString((parsed as Record<string, unknown>).query));
  }
  return '';
}

export function parseWebSearchHits(result: unknown): SearchHit[] {
  const parsed = coerceJson(result);
  if (!parsed) return [];
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).results)
      ? ((parsed as Record<string, unknown>).results as unknown[])
      : [];
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
    const rawTitle = typeof item.title === 'string' ? item.title : '';
    const title = readableText(rawTitle, hostnameFromUrl(url) || url);
    const siteName = readableText(
      typeof item.siteName === 'string'
        ? item.siteName
        : typeof item.displayedUrl === 'string'
          ? item.displayedUrl
          : hostnameFromUrl(url),
      hostnameFromUrl(url),
    );
    hits.push({ title, url, siteName: siteName || undefined });
  }
  return hits;
}

export function codingActionForTool(name: string): CodingAction {
  const raw = (name || '').trim().toLowerCase();
  if (raw === 'file_edit' || raw === 'edit_file') return 'edit';
  const canonical = canonicalToolName(name);
  if (canonical === 'file_read') return 'read';
  if (canonical === 'file_write') return 'write';
  if (canonical === 'shell_exec') return 'run';
  return 'list';
}

function parseDiffCounts(result: unknown): { filePath?: string; add?: number; del?: number } {
  const parsed = coerceJson(result);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const row = parsed as Record<string, unknown>;
  const addRaw = Number(row.lines_added);
  const delRaw = Number(row.lines_removed);
  return {
    filePath: typeof row.file_path === 'string' ? row.file_path : undefined,
    add: Number.isFinite(addRaw) && addRaw > 0 ? addRaw : undefined,
    del: Number.isFinite(delRaw) && delRaw > 0 ? delRaw : undefined,
  };
}

function parseShellCommand(result: unknown): string {
  const parsed = coerceJson(result);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
  return firstString((parsed as Record<string, unknown>).command);
}

export function parseCodingMeta(call: Pick<ActivityToolCall, 'name' | 'arguments' | 'result'>): {
  action: CodingAction;
  target: string;
  add?: number;
  del?: number;
} {
  const action = codingActionForTool(call.name);
  const diff = parseDiffCounts(call.result);
  const args = call.arguments ?? {};
  const path = firstString(args.file_path, args.path, args.directory);
  const command = firstString(args.command, parseShellCommand(call.result));
  const summary = firstString(path, command, args.query, args.pattern);
  const target =
    action === 'run'
      ? command || summary
      : fileNameFromPath(diff.filePath || path) || summary;
  return { action, target, add: diff.add, del: diff.del };
}

export function activityTraceCopyFromT(
  t: (key: string, opts?: Record<string, unknown>) => string,
): ActivityTraceCopy {
  return {
    thinking: t('trace_thinking'),
    reasoningDone: t('trace_reasoning_done'),
    searching: t('trace_searching'),
    searched: t('trace_searched'),
    runningTools: t('trace_running_tools'),
    coding: t('trace_coding'),
    ranTools: (count) => t('trace_ran_tools', { count }),
    stepsDone: (count) => t('trace_steps_done', { count }),
    moreResults: (count) => t('trace_more_results', { count }),
    untitledResult: t('trace_untitled_result'),
    codingActions: {
      read: t('trace_coding_read'),
      edit: t('trace_coding_edit'),
      write: t('trace_coding_write'),
      run: t('trace_coding_run'),
      list: t('trace_coding_list'),
    },
  };
}

export function traceHeaderLabel(
  kind: ActivityTraceKind,
  working: boolean,
  count: number,
  copy: ActivityTraceCopy,
): string {
  switch (kind) {
    case 'reasoning':
      return working ? copy.thinking : copy.reasoningDone;
    case 'search':
      return working ? copy.searching : copy.searched;
    case 'coding':
      return working ? copy.coding : copy.ranTools(Math.max(count, 1));
    case 'steps':
      return working ? copy.runningTools : copy.stepsDone(Math.max(count, 1));
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function buildSearchTraceRows(
  calls: ActivityToolCall[],
  untitledLabel: string,
): { query: string; rows: ActivityTraceRow[]; moreCount: number } {
  const workingCall = calls.find((call) => isToolWorking(call.status)) ?? calls[calls.length - 1];
  const query = parseWebSearchQuery(workingCall?.arguments, workingCall?.result);
  const rows: ActivityTraceRow[] = [];
  for (const call of calls) {
    if (canonicalToolName(call.name) === 'web_fetch') {
      const url = String(call.arguments?.url ?? '').trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        rows.push({
          id: `${call.id}:fetch`,
          primary: readableText(hostnameFromUrl(url), untitledLabel),
          secondary: hostnameFromUrl(url) || undefined,
          href: url,
          status: call.status,
          toolCallId: call.id,
        });
      }
    }
    const hits = parseWebSearchHits(call.result);
    hits.forEach((hit, index) => {
      rows.push({
        id: `${call.id}:${index}:${hit.url}`,
        primary: hit.title || untitledLabel,
        secondary: hit.siteName,
        href: hit.url,
        status: call.status,
        toolCallId: call.id,
      });
    });
  }
  const moreCount = Math.max(0, rows.length - SEARCH_VISIBLE_CAP);
  return {
    query,
    rows: moreCount > 0 ? rows.slice(0, SEARCH_VISIBLE_CAP) : rows,
    moreCount,
  };
}

export function buildCodingTraceRows(
  calls: ActivityToolCall[],
  actionLabels: Record<CodingAction, string>,
): ActivityTraceRow[] {
  return calls.map((call) => {
    const meta = parseCodingMeta(call);
    return {
      id: call.id,
      primary: actionLabels[meta.action],
      secondary: meta.target || undefined,
      mono: true,
      add: meta.add,
      del: meta.del,
      status: call.status,
      toolCallId: call.id,
    };
  });
}

export function buildStepsTraceRows(calls: ActivityToolCall[], t: ToolLabelT): ActivityTraceRow[] {
  return calls.map((call) => ({
    id: call.id,
    primary: getToolDisplayLabelForCall(call, t, isToolWorking(call.status)),
    secondary: firstString(
      call.arguments?.query,
      call.arguments?.path,
      call.arguments?.file_path,
      call.arguments?.url,
      call.arguments?.command,
      call.arguments?.title,
    ) || undefined,
    status: call.status,
    toolCallId: call.id,
  }));
}
