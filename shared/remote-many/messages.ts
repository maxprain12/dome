/**
 * Wire payloads for Remote Many. Field names are taken from
 * `electron/remote/executor.cjs` and related public DTO helpers — do not invent keys.
 */
import type { ManyAgentMode, RemoteCommandType, RemoteEventType } from './protocol.ts';

export interface RemoteCommand<T extends RemoteCommandType = RemoteCommandType> {
  id: string;
  type: T;
  threadId?: string;
  payload: RemoteCommandPayloadMap[T];
  createdAt: number;
}

export interface RemoteEvent<T extends RemoteEventType = RemoteEventType> {
  id: string;
  type: T;
  threadId?: string | null;
  runId?: string | null;
  seq?: number;
  payload: RemoteEventPayloadMap[T];
  createdAt: number;
}

export interface RemoteRefPin {
  id: string;
  title: string;
  type: string;
  kind: 'resource' | 'skill' | 'mcp';
  description?: string;
}

export interface RemoteSkillPin {
  id: string;
  name: string;
}

export interface RemotePlanTodo {
  step: number;
  text: string;
  completed: boolean;
}

export interface RemotePlanPayload {
  kind: 'plan';
  phase: 'choose' | 'executing';
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  todos: RemotePlanTodo[];
}

export interface RemoteQuestionnaireOption {
  value: string;
  label: string;
  description?: string;
}

export interface RemoteQuestionnaireQuestion {
  id: string;
  label: string;
  prompt: string;
  allowOther: boolean;
  options: RemoteQuestionnaireOption[];
}

export interface RemoteApprovalPayload {
  kind: 'questionnaire' | 'tool' | string;
  runId?: string | null;
  toolCallId?: string | null;
  summary?: string;
  toolName?: string | null;
  questions?: RemoteQuestionnaireQuestion[];
}

export interface RemoteVisualCard {
  kind: string;
  name: string;
  handle?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  url?: string | null;
  followers?: number | null;
  postsCount?: number | null;
  following?: number | null;
  type?: string;
  excerpt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  count?: number | null;
  items?: RemoteVisualCard[];
  resourceId?: string;
}

export interface RemotePreviewSlide {
  index: number;
  title: string;
  excerpt: string;
}

export interface RemoteResourcePreview {
  title: string;
  type?: string;
  kind: string;
  excerpt: string;
  slides: RemotePreviewSlide[];
  viewable: boolean;
}

export interface RemoteFileChunk {
  name?: string;
  mime?: string;
  kind?: string;
  bytes?: number;
  viewable: boolean;
  chunkIndex?: number;
  chunkCount?: number;
  data?: string;
  error?: string;
}

export interface RemoteModelOption {
  id: string;
  label: string;
  provider?: string | null;
}

export interface RemoteCapabilitiesPayload {
  protocolVersion: number;
  model: string | null;
  modelLabel: string;
  provider?: string | null;
  models: RemoteModelOption[];
  tools: string[];
  sessions: string[];
  modes: ManyAgentMode[];
  agentMode: ManyAgentMode;
  streamEvents: string[];
  requiresLocalUi: string[];
  remoteOnly: boolean;
}

export interface RemoteCommandPayloadMap {
  'session.start': { threadId?: string };
  'session.list': Record<string, never>;
  'session.get': { threadId?: string };
  'message.send': {
    text?: string;
    threadId?: string;
    projectId?: string;
    mode?: ManyAgentMode;
    pinnedResources?: RemoteRefPin[];
    skills?: RemoteSkillPin[];
    mcpServerIds?: Array<string | { id?: string; name?: string; title?: string }>;
  };
  'run.cancel': { runId?: string };
  'run.resume': { runId: string };
  'approval.decide': {
    runId: string;
    answers?: unknown[];
    cancelled?: boolean;
    approved?: boolean;
    toolCallId?: string;
  };
  'capabilities.request': Record<string, never>;
  'model.set': { model: string };
  'refs.list': { query?: string };
  'refs.preview': { href?: string; resourceId?: string; id?: string };
  'refs.export': { href?: string; resourceId?: string; id?: string; offset?: number };
  'mode.set': { mode?: ManyAgentMode };
}

export interface RemoteEventPayloadMap {
  presence: Record<string, unknown>;
  start: { runId: string; threadId: string; status: string };
  text: { text: string };
  thinking: Record<string, unknown>;
  tool_call: { toolCall: unknown; agentName: string | null };
  tool_progress: Record<string, unknown>;
  tool_result: {
    toolCallId?: string;
    toolName: string | null;
    isError: boolean;
    visual: RemoteVisualCard | null;
  };
  approval: RemoteApprovalPayload;
  plan: RemotePlanPayload;
  done: Record<string, never>;
  error: { error: string };
  'session.list': Record<string, unknown>;
  capabilities: RemoteCapabilitiesPayload;
  'run.status': { status: string; error?: string | null };
  visual: RemoteVisualCard;
  refs:
    | { resources?: RemoteRefPin[]; skills?: RemoteRefPin[]; mcp?: RemoteRefPin[] }
    | { preview: RemoteResourcePreview }
    | { file: RemoteFileChunk };
}
