import type { ToolRequest } from './agent-tools';
import type { ContactDraft } from './protocol';
import type {
  ApiResult,
  ApprovalDecision,
  CaptureResult,
  HydratedResourceResult,
  ManyBootstrap,
  ManyConfig,
  ManyResumeBody,
  ManySessionDetail,
  ManySessionSummary,
  ManyStreamBody,
  ManyStreamEvent,
  McpCatalog,
  ModelsCatalog,
  NoteDetail,
  PairResult,
  ResourceSearchResult,
  SkillCatalogItem,
  StreamResult,
} from './http';

export type {
  ApiResult,
  ApprovalActionRequest,
  ApprovalDecision,
  ApprovalReviewConfig,
  BudgetBreakdown,
  CaptureResult,
  HydratedResourceResult,
  ImageAttachment,
  ManyBootstrap,
  ManyConfig,
  ManySessionDetail,
  ManySessionMessage,
  ManySessionSummary,
  ManyStreamBody,
  ManyStreamEvent,
  McpCatalog,
  McpCatalogServer,
  ModelCatalogItem,
  ModelsCatalog,
  NoteDetail,
  PairResult,
  PinnedResource,
  ResourceSearchItem,
  ResourceSearchResult,
  SkillCatalogItem,
  ThinkingLevel,
  TokenUsage,
} from './http';

type HttpMessage = {
  type: 'DOME_HTTP';
  path: string;
  method?: string;
  body?: unknown;
  token?: string | null;
};

type ManyPortRequest =
  | { kind: 'stream'; token: string; body: ManyStreamBody }
  | { kind: 'resume'; token: string; body: ManyResumeBody };

type ManyPortEvent =
  | ManyStreamEvent
  | { type: 'transport_end'; terminal: StreamResult['terminal'] };

async function send<T>(message: HttpMessage): Promise<ApiResult<T>> {
  try {
    return (await browser.runtime.sendMessage(message)) as ApiResult<T>;
  } catch {
    return {
      success: false,
      error: 'Could not reach the Dome extension background page.',
    };
  }
}

function sessionPath(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ':');
}

export function pair(code: string, clientName: string) {
  return send<PairResult>({
    type: 'DOME_HTTP',
    path: '/v1/pair',
    method: 'POST',
    body: { code, clientName },
  });
}

export function health() {
  return send<{ ok: boolean; version: number; port: number }>({
    type: 'DOME_HTTP',
    path: '/v1/health',
  });
}

export function getContext(token: string) {
  return send<{
    projectId: string;
    projectName: string;
    projects: Array<{ id: string; name: string }>;
  }>({ type: 'DOME_HTTP', path: '/v1/context', token });
}

export function getBootstrap(token: string) {
  return send<ManyBootstrap>({
    type: 'DOME_HTTP',
    path: '/v1/bootstrap',
    token,
  });
}

export function getConfig(token: string) {
  return send<ManyConfig>({
    type: 'DOME_HTTP',
    path: '/v1/config',
    token,
  });
}

export function getSkillsCatalog(token: string) {
  return send<{ skills: SkillCatalogItem[] }>({
    type: 'DOME_HTTP',
    path: '/v1/catalogs/skills',
    token,
  });
}

export function getMcpCatalog(token: string) {
  return send<McpCatalog>({
    type: 'DOME_HTTP',
    path: '/v1/catalogs/mcp',
    token,
  });
}

export function getModelsCatalog(token: string) {
  return send<ModelsCatalog>({
    type: 'DOME_HTTP',
    path: '/v1/catalogs/models',
    token,
  });
}

export function searchResources(
  token: string,
  body: {
    query: string;
    projectId?: string;
    type?: string;
    limit?: number;
    semanticMinScore?: number;
  },
) {
  return send<ResourceSearchResult>({
    type: 'DOME_HTTP',
    path: '/v1/resources/search',
    method: 'POST',
    token,
    body,
  });
}

export function hydrateResources(
  token: string,
  body: {
    ids: string[];
    includeContent?: boolean;
    maxContentChars?: number;
  },
) {
  return send<{ resources: HydratedResourceResult[] }>({
    type: 'DOME_HTTP',
    path: '/v1/resources/hydrate',
    method: 'POST',
    token,
    body,
  });
}

export function listNotes(token: string, projectId: string) {
  return send<{
    notes: Array<{ id: string; title: string; updatedAt: number }>;
  }>({
    type: 'DOME_HTTP',
    path: `/v1/notes?projectId=${encodeURIComponent(projectId)}`,
    token,
  });
}

export function getNote(token: string, id: string) {
  return send<NoteDetail>({
    type: 'DOME_HTTP',
    path: `/v1/notes/${sessionPath(id)}`,
    token,
  });
}

export function createNote(
  token: string,
  body: { projectId: string; title: string; markdown?: string },
) {
  return send<NoteDetail>({
    type: 'DOME_HTTP',
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
  return send<NoteDetail>({
    type: 'DOME_HTTP',
    path: `/v1/notes/${sessionPath(id)}`,
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
  return send<NoteDetail>({
    type: 'DOME_HTTP',
    path: `/v1/notes/${sessionPath(id)}/append`,
    method: 'POST',
    token,
    body,
  });
}

export function saveContact(
  token: string,
  body: ContactDraft & { projectId: string },
) {
  return send<{ person: { id: string; displayName: string } }>({
    type: 'DOME_HTTP',
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
  return send<CaptureResult>({
    type: 'DOME_HTTP',
    path: '/v1/capture-url',
    method: 'POST',
    token,
    body,
  });
}

export function cancelMany(token: string, streamId: string) {
  return send<{ cancelled: boolean }>({
    type: 'DOME_HTTP',
    path: '/v1/ai/cancel',
    method: 'POST',
    token,
    body: { streamId },
  });
}

export function listManySessions(token: string) {
  return send<{ sessions: ManySessionSummary[] }>({
    type: 'DOME_HTTP',
    path: '/v1/ai/sessions',
    token,
  });
}

export function readManySession(token: string, id: string) {
  return send<ManySessionDetail>({
    type: 'DOME_HTTP',
    path: `/v1/ai/sessions/${sessionPath(id)}`,
    token,
  });
}

export function deleteManySession(token: string, id: string) {
  return send<{ id: string; deleted: boolean }>({
    type: 'DOME_HTTP',
    path: `/v1/ai/sessions/${sessionPath(id)}`,
    method: 'DELETE',
    token,
  });
}

export function pinManySession(token: string, id: string, pinned: boolean) {
  return send<{ id: string; pinned: boolean }>({
    type: 'DOME_HTTP',
    path: `/v1/ai/sessions/${sessionPath(id)}/pin`,
    method: 'PUT',
    token,
    body: { pinned },
  });
}

export function getManyApproval(token: string, streamId: string) {
  return send<{
    streamId: string;
    threadId?: string;
    expiresAt: number;
    actionRequests: Array<{
      name: string;
      args: Record<string, unknown>;
      description?: string;
    }>;
    reviewConfigs: Array<{ actionName: string; allowedDecisions: string[] }>;
  }>({
    type: 'DOME_HTTP',
    path: `/v1/ai/approvals/${sessionPath(streamId)}`,
    token,
  });
}

function runManyPort(
  request: ManyPortRequest,
  onEvent: (event: ManyStreamEvent) => void,
  onTool?: (request: ToolRequest) => Promise<Record<string, unknown>>,
): Promise<ApiResult<StreamResult>> {
  return new Promise((resolve) => {
    const port = browser.runtime.connect({ name: 'dome-ai-v2' });
    let full = '';
    let terminal: StreamResult['terminal'] = 'done';
    let toolQueue = Promise.resolve();
    let settled = false;

    const finish = (result: ApiResult<StreamResult>) => {
      if (settled) return;
      settled = true;
      try {
        port.disconnect();
      } catch {
        // The browser already closed the transport.
      }
      resolve(result);
    };

    const forwardTool = (event: ToolRequest) => {
      toolQueue = toolQueue
        .then(async () => {
          if (settled) return;
          const result = onTool
            ? await onTool(event)
            : { success: false, error: 'Browser tools are unavailable.' };
          if (settled) return;
          await send({
            type: 'DOME_HTTP',
            path: '/v1/ai/tool-result',
            method: 'POST',
            token: request.token,
            body: {
              streamId: event.streamId,
              callId: event.callId,
              result,
            },
          });
        })
        .catch(() => {
          finish({ success: false, error: 'Browser tool failed' });
        });
    };

    port.onMessage.addListener((event: ManyPortEvent) => {
      switch (event.type) {
        case 'browser_tool':
          onEvent(event);
          forwardTool(event);
          return;
        case 'delta':
          full += event.text;
          onEvent(event);
          return;
        case 'approval':
          terminal = 'approval';
          onEvent(event);
          return;
        case 'error':
          onEvent(event);
          finish({ success: false, error: event.error || 'AI error' });
          return;
        case 'done':
          onEvent(event);
          return;
        case 'transport_end':
          finish({ success: true, data: { text: full, terminal: event.terminal } });
          return;
        case 'start':
        case 'reasoning':
        case 'tool_call':
        case 'tool_progress':
        case 'tool_result':
        case 'usage':
        case 'budget':
        case 'compaction':
        case 'harness':
          onEvent(event);
          return;
        default: {
          const exhaustive: never = event;
          return exhaustive;
        }
      }
    });
    port.onDisconnect.addListener(() => {
      finish(
        full || terminal === 'approval'
          ? { success: true, data: { text: full, terminal } }
          : { success: false, error: 'Many stream disconnected.' },
      );
    });
    port.postMessage(request);
  });
}

export function streamMany(
  token: string,
  body: ManyStreamBody,
  onEvent: (event: ManyStreamEvent) => void,
  onTool?: (request: ToolRequest) => Promise<Record<string, unknown>>,
) {
  return runManyPort({ kind: 'stream', token, body }, onEvent, onTool);
}

export function resumeMany(
  token: string,
  streamId: string,
  decision: ApprovalDecision,
  onEvent: (event: ManyStreamEvent) => void,
  onTool?: (request: ToolRequest) => Promise<Record<string, unknown>>,
) {
  return runManyPort(
    { kind: 'resume', token, body: { streamId, decision } },
    onEvent,
    onTool,
  );
}
