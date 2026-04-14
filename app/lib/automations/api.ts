'use client';

export type AutomationTargetType = 'many' | 'agent' | 'workflow';
export type AutomationTriggerType = 'manual' | 'schedule' | 'contextual';
export type AutomationOutputMode = 'chat_only' | 'studio_output' | 'mixed';
export type PersistentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PersistentRunStepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'done'
  | 'failed'
  | 'error'
  | 'cancelled';

export interface AutomationDefinition {
  id: string;
  projectId?: string;
  title: string;
  description?: string;
  targetType: AutomationTargetType;
  targetId: string;
  triggerType: AutomationTriggerType;
  schedule?: {
    cadence?: 'daily' | 'weekly' | 'cron-lite';
    hour?: number;
    weekday?: number | null;
    intervalMinutes?: number;
    /** When triggerType is contextual: tags that must match (e.g. resource_opened) */
    contextTags?: string[];
  } | null;
  inputTemplate?: {
    prompt?: string;
    projectId?: string | null;
    contextId?: string | null;
    toolIds?: string[];
    mcpServerIds?: string[];
    subagentIds?: Array<'research' | 'library' | 'writer' | 'data'>;
  } | null;
  outputMode?: AutomationOutputMode;
  enabled: boolean;
  legacySource?: string | null;
  lastRunAt?: number | null;
  lastRunStatus?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface PersistentRunStep {
  id: string;
  runId: string;
  parentStepId?: string | null;
  stepType: string;
  title: string;
  status: PersistentRunStepStatus;
  content?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface PersistentRunLink {
  id: string;
  runId: string;
  linkType: string;
  linkId: string;
  createdAt: number;
}

/** Token usage persisted on `PersistentRun.metadata.usage` (see run-engine / langgraph-agent). */
export interface PersistentRunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface PersistentRun {
  id: string;
  projectId?: string;
  automationId?: string | null;
  ownerType: 'many' | 'agent' | 'workflow' | 'automation';
  ownerId: string;
  title: string;
  status: PersistentRunStatus;
  sessionId?: string | null;
  workflowId?: string | null;
  workflowExecutionId?: string | null;
  threadId?: string | null;
  outputText?: string;
  summary?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number | null;
  lastHeartbeatAt?: number | null;
  steps?: PersistentRunStep[];
  links?: PersistentRunLink[];
}

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const AUTOMATIONS_CHANGED_EVENT = 'dome:automations-changed';

function notifyAutomationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTOMATIONS_CHANGED_EVENT));
  }
}

function ensureElectron() {
  if (typeof window === 'undefined' || !window.electron?.invoke) {
    throw new Error('Electron no disponible');
  }
  return window.electron;
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const electron = ensureElectron();
  const result = await electron.invoke(channel, payload) as Result<T>;
  if (!result?.success) {
    throw new Error(result?.error || `Error invoking ${channel}`);
  }
  return result.data as T;
}

export async function listAutomations(filters?: {
  targetType?: AutomationTargetType;
  targetId?: string;
  projectId?: string;
}): Promise<AutomationDefinition[]> {
  return invoke<AutomationDefinition[]>('automations:list', filters);
}

export async function getAutomation(automationId: string): Promise<AutomationDefinition | null> {
  return invoke<AutomationDefinition | null>('automations:get', automationId);
}

export async function saveAutomation(automation: Partial<AutomationDefinition>): Promise<AutomationDefinition> {
  const saved = await invoke<AutomationDefinition>('automations:upsert', automation);
  notifyAutomationsChanged();
  return saved;
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await invoke<void>('automations:delete', automationId);
  notifyAutomationsChanged();
}

export async function runAutomationNow(automationId: string): Promise<PersistentRun> {
  return invoke<PersistentRun>('automations:runNow', automationId);
}

export async function listRuns(filters?: {
  ownerType?: string;
  ownerId?: string;
  automationId?: string;
  sessionId?: string;
  projectId?: string;
  limit?: number;
}): Promise<PersistentRun[]> {
  return invoke<PersistentRun[]>('runs:list', filters);
}

export async function getRun(runId: string): Promise<PersistentRun | null> {
  return invoke<PersistentRun | null>('runs:get', runId);
}

export async function deleteRun(runId: string): Promise<void> {
  await invoke<void>('runs:delete', runId);
}

export async function getActiveRunBySession(sessionId: string): Promise<PersistentRun | null> {
  return invoke<PersistentRun | null>('runs:getActiveBySession', sessionId);
}

export async function startLangGraphRun(params: {
  automationId?: string | null;
  projectId?: string;
  ownerType: 'many' | 'agent';
  ownerId: string;
  title: string;
  sessionId?: string | null;
  workflowId?: string | null;
  contextId?: string | null;
  sessionTitle?: string | null;
  messages: Array<{ role: string; content: string }>;
  toolDefinitions?: unknown[];
  toolIds?: string[];
  mcpServerIds?: string[];
  subagentIds?: Array<'research' | 'library' | 'writer' | 'data'>;
  provider?: string;
  model?: string;
  threadId?: string;
  skipHitl?: boolean;
  /** Many voice: read reply with TTS when run completes */
  autoSpeak?: boolean;
  voiceLanguage?: string;
}): Promise<PersistentRun> {
  return invoke<PersistentRun>('runs:startLangGraph', params);
}

export async function startWorkflowRun(params: {
  workflowId: string;
  projectId?: string;
  automationId?: string | null;
  title?: string;
  inputTemplate?: AutomationDefinition['inputTemplate'];
  outputMode?: AutomationOutputMode;
  provider?: string;
  model?: string;
}): Promise<PersistentRun> {
  return invoke<PersistentRun>('runs:startWorkflow', params);
}

export async function resumeRun(runId: string, decisions: Array<unknown>): Promise<PersistentRun> {
  return invoke<PersistentRun>('runs:resume', { runId, decisions });
}

export async function abortRun(runId: string): Promise<void> {
  await invoke<void>('runs:abort', runId);
}

export function onRunUpdated(callback: (payload: { run: PersistentRun }) => void): () => void {
  const electron = ensureElectron();
  return electron.on('runs:updated', callback);
}

export function onRunStep(callback: (payload: { step: PersistentRunStep }) => void): () => void {
  const electron = ensureElectron();
  return electron.on('runs:step', callback);
}

export function onRunChunk(callback: (payload: {
  runId: string;
  type: string;
  text?: string;
  toolCall?: { id: string; name: string; arguments: string };
  toolCallId?: string;
  result?: string;
  actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
  threadId?: string;
}) => void): () => void {
  const electron = ensureElectron();
  return electron.on('runs:chunk', callback);
}
