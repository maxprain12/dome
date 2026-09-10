import type { ToolRequest } from './agent-tools';
import { BASE_URL } from './protocol';
import type { ContactDraft, NoteSummary, ProjectSummary } from './protocol';

export type NoteDetail = {
  id: string;
  title: string;
  projectId: string;
  markdown: string;
  updatedAt: number;
  revision?: string;
  domeLink?: string;
};

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; conflict?: boolean; note?: NoteDetail };

export type CaptureResult = {
  id: string;
  title: string;
  url: string;
  reused?: boolean;
  mediaKind?: string;
  domeLink: string;
};

export type PairResult = { token: string; clientId: string };
export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export interface ManyConfig {
  provider: string;
  model: string | null;
  providers: string[];
  billingMode: string | null;
  contextWindow: number | null;
  configured: boolean;
  capabilities: {
    reasoning: boolean;
    thinkingLevels: ThinkingLevel[];
    input: string[];
  };
}

export interface SkillCatalogItem {
  name: string;
  description: string;
}

export interface McpCatalogServer {
  id: string;
  selectionId: string;
  name: string;
  type: string;
  enabled: boolean;
  tools: string[];
  lastDiscoveryAt: number | string | null;
  lastDiscoveryError: string | null;
}

export interface McpCatalog {
  enabled: boolean;
  servers: McpCatalogServer[];
}

export interface ModelCatalogItem {
  id: string;
  name: string;
  description?: string | null;
  contextWindow?: number | null;
  reasoning?: boolean;
  input?: string[];
  curated?: boolean;
  recommended?: boolean;
  current?: boolean;
  size?: number | null;
  modifiedAt?: string | null;
}

export interface ModelsCatalog {
  provider: string;
  models: ModelCatalogItem[];
  limited: boolean;
  limitation?: string;
}

export interface ManyBootstrap {
  config: ManyConfig;
  catalogs: {
    skills: SkillCatalogItem[];
    mcp: McpCatalog;
  };
  capabilities: {
    protocolVersion: number;
    sessions: Array<'list' | 'read' | 'delete' | 'pin'>;
    streamEvents: string[];
    attachments: {
      images: boolean;
      maxCount: number;
      maxDataUrlChars: number;
    };
  };
  context: {
    projectId: string;
    projectName: string;
    projects: ProjectSummary[];
  };
}

export interface PinnedResource {
  id: string;
  title: string;
  kind?: string;
  type?: string;
}

export interface ImageAttachment {
  dataUrl: string;
  mime?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  name?: string;
}

export interface ResourceSearchItem {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  kind?: string;
  snippet?: string;
  content?: string;
  score?: number;
}

export interface ResourceSearchResult {
  results?: ResourceSearchItem[];
  items?: ResourceSearchItem[];
  resources?: ResourceSearchItem[];
}

export interface HydratedResourceResult {
  id: string;
  found: boolean;
  resource?: Record<string, unknown>;
  error?: string;
}

export interface ManySessionSummary {
  id: string;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  pinned: boolean;
}

export interface ManySessionMessage {
  role: 'user' | 'assistant' | 'toolResult';
  text: string;
  timestamp: number | null;
  reasoning?: string;
  attachments?: {
    images: ImageAttachment[];
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status?: 'pending' | 'running' | 'success' | 'error';
    result?: unknown;
    error?: string;
  }>;
  usage?: TokenUsage | null;
  stopReason?: string;
  toolCallId?: string;
  toolName?: string;
  result?: unknown;
  isError?: boolean;
}

export interface ManySessionDetail extends ManySessionSummary {
  messages: ManySessionMessage[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number | null;
}

export interface BudgetBreakdown {
  systemApprox: number;
  toolsApprox: number;
  historyApprox: number;
  totalApprox: number;
  toolCount: number;
  historyTurns: number;
  systemPromptApprox?: number;
  skillsApprox?: number;
  rulesApprox?: number;
  toolsRegistryApprox?: number;
  mcpApprox?: number;
  subagentsApprox?: number;
  summarizedApprox?: number;
  conversationApprox?: number;
}

export interface ApprovalActionRequest {
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

export interface ApprovalReviewConfig {
  actionName: string;
  allowedDecisions: string[];
}

export type ApprovalDecision =
  | { type: 'approve' }
  | { type: 'approve_all' }
  | { type: 'reject'; message?: string }
  | {
      type: 'edit';
      editedAction: { name: string; args: Record<string, unknown> };
    };

export type ManyStreamEvent =
  | {
      type: 'start';
      streamId: string;
      protocolVersion: number;
      resumed?: boolean;
    }
  | { type: 'delta'; event?: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | ToolRequest
  | {
      type: 'tool_call';
      toolCall: {
        id: string;
        name: string;
        arguments: string | Record<string, unknown>;
      };
      agentName?: string;
    }
  | {
      type: 'tool_progress';
      toolCallId: string;
      toolName?: string;
      partialResult?: string;
    }
  | {
      type: 'tool_result';
      toolCallId: string;
      result?: unknown;
      isError?: boolean;
      agentName?: string;
    }
  | { type: 'usage'; usage: TokenUsage; partial?: boolean }
  | { type: 'budget'; breakdown: BudgetBreakdown }
  | {
      type: 'compaction';
      tokensBefore: number;
      tokensAfter: number | null;
      summaryPreview: string;
      automatic?: boolean;
      reason?: string;
    }
  | {
      type: 'approval';
      threadId?: string;
      actionRequests: ApprovalActionRequest[];
      reviewConfigs: ApprovalReviewConfig[];
    }
  | { type: 'harness'; event: string; payload?: Record<string, unknown> | null }
  | { type: 'error'; error?: string }
  | { type: 'done' };

export type ManyStreamBody = {
  browserTools?: boolean;
  threadId?: string;
  action: 'summarize' | 'key_ideas' | 'ask';
  text?: string;
  prompt?: string;
  url?: string;
  title?: string;
  streamId?: string;
  model?: string;
  toolsEnabled?: boolean;
  resourceToolsEnabled?: boolean;
  memoryEnabled?: boolean;
  projectId?: string;
  thinkingLevel?: ThinkingLevel;
  mcpServerIds?: string[];
  pinnedResources?: PinnedResource[];
  attachments?: { images: ImageAttachment[] };
};

export type ManyResumeBody = {
  streamId: string;
  decision: ApprovalDecision;
};

export type HttpRequest = {
  path: string;
  method?: string;
  body?: unknown;
  token?: string | null;
};

export interface StreamResult {
  text: string;
  terminal: 'done' | 'approval';
}

export async function request<T>(opts: HttpRequest): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${opts.path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return {
      success: false,
      error: 'Dome is not open. Launch the desktop app and try again.',
    };
  }
  let payload: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { success: false, error: 'Unexpected response from Dome' };
    }
  }
  if (!res.ok || payload.success === false) {
    return {
      success: false,
      error:
        typeof payload.error === 'string'
          ? payload.error
          : `Request failed (${res.status})`,
      conflict: payload.conflict === true,
      note: payload.note as NoteDetail | undefined,
    };
  }
  return { success: true, data: payload.data as T };
}

function parseSseBlock(block: string): ManyStreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    const event = JSON.parse(data) as ManyStreamEvent;
    return event && typeof event === 'object' && 'type' in event ? event : null;
  } catch {
    return null;
  }
}

export async function streamManyHttp(
  token: string,
  request:
    | ManyStreamBody
    | { path: '/v1/ai/stream'; body: ManyStreamBody }
    | { path: '/v1/ai/resume'; body: ManyResumeBody },
  onEvent: (event: ManyStreamEvent) => void,
): Promise<ApiResult<StreamResult>> {
  const requestSpec =
    'path' in request
      ? request
      : ({ path: '/v1/ai/stream', body: request } as const);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${requestSpec.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestSpec.body),
    });
  } catch {
    return {
      success: false,
      error: 'Dome is not open. Launch the desktop app and try again.',
    };
  }
  if (!res.ok || !res.body) {
    return { success: false, error: `AI request failed (${res.status})` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let terminal: StreamResult['terminal'] = 'done';

  const consume = (block: string): ApiResult<StreamResult> | null => {
    const event = parseSseBlock(block);
    if (!event) return null;
    onEvent(event);
    if (event.type === 'delta') full += event.text;
    if (event.type === 'approval') terminal = 'approval';
    if (event.type === 'error') {
      return { success: false, error: event.error || 'AI error' };
    }
    return null;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';
    for (const part of parts) {
      const failed = consume(part);
      if (failed) return failed;
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const failed = consume(buffer);
    if (failed) return failed;
  }
  return { success: true, data: { text: full, terminal } };
}

export function pair(code: string, clientName: string) {
  return request<PairResult>({
    path: '/v1/pair',
    method: 'POST',
    body: { code, clientName },
  });
}

export function health() {
  return request<{ ok: boolean; version: number; port: number }>({
    path: '/v1/health',
  });
}

export function getContext(token: string) {
  return request<{
    projectId: string;
    projectName: string;
    projects: ProjectSummary[];
  }>({ path: '/v1/context', token });
}

export function listNotes(token: string, projectId: string) {
  return request<{ notes: NoteSummary[] }>({
    path: `/v1/notes?projectId=${encodeURIComponent(projectId)}`,
    token,
  });
}

export function getNote(token: string, id: string) {
  return request<NoteDetail>({ path: `/v1/notes/${id}`, token });
}

export function createNote(
  token: string,
  body: { projectId: string; title: string; markdown?: string },
) {
  return request<NoteDetail>({
    path: '/v1/notes',
    method: 'POST',
    token,
    body,
  });
}

export function updateNote(
  token: string,
  id: string,
  body: {
    markdown: string;
    expectedUpdatedAt: number;
    expectedRevision?: string;
    title?: string;
  },
) {
  return request<NoteDetail>({
    path: `/v1/notes/${id}`,
    method: 'PUT',
    token,
    body,
  });
}

export function appendSelection(
  token: string,
  id: string,
  body: {
    text: string;
    title?: string;
    url: string;
    expectedUpdatedAt: number;
    capturedAt?: number;
  },
) {
  return request<NoteDetail>({
    path: `/v1/notes/${id}/append`,
    method: 'POST',
    token,
    body,
  });
}

export function saveContact(
  token: string,
  body: ContactDraft & { projectId: string },
) {
  return request<{ person: { id: string; displayName: string } }>({
    path: '/v1/contact',
    method: 'POST',
    token,
    body,
  });
}

export function captureUrl(
  token: string,
  body: {
    projectId: string;
    url: string;
    title: string;
    readableText?: string;
    mediaKind?: string;
  },
) {
  return request<CaptureResult>({
    path: '/v1/capture-url',
    method: 'POST',
    token,
    body,
  });
}

export function cancelMany(token: string, streamId: string) {
  return request<{ cancelled: boolean }>({
    path: '/v1/ai/cancel',
    method: 'POST',
    token,
    body: { streamId },
  });
}
