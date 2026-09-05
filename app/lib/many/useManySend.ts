import { useCallback, useEffect, useMemo, type MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import {
  getAIConfig,
  checkChatProviderReady,
  createManyToolsForContext,
  toOpenAIToolDefinitions,
  type AnyAgentTool,
} from '@/lib/ai';
import {
  buildSharedResourceHint,
  buildSharedUiContextBlock,
  getUiLocationDescription,
} from '@/lib/ai/shared-capabilities';
import { createRememberFactTool } from '@/lib/ai/tools/memory';
import { buildManyFloatingPrompt, getPartOfDay } from '@/lib/prompts/loader';
import { buildDomeSystemPrompt, formatVolatileSourceContext } from '@/lib/chat/buildDomeSystemPrompt';
import { appendRunSkillsToPrompt } from '@/lib/skills/resolve-run-skills';
import { resolveMemoryDomains } from '@/lib/personality/domainMemory';
import { showToast } from '@/lib/store/useToastStore';
import type { CompactionNoticeData, ManyMessageData } from '@/lib/many/types';
import { db } from '@/lib/db/client';
import { capturePostHog } from '@/lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { abortRun, startAgentRun, type PersistentRun } from '@/lib/automations/api';
import { registerManyMessageSender, type ManySendOptions } from '@/lib/many/manySendController';
import { runPdfRegionStream } from '@/lib/hooks/usePdfRegionStream';
import { buildUserRunMessage, type ChatRunMessage } from '@/lib/chat/attachmentTypes';
import { redactBase64FromText } from '@/lib/chat/userMessageVisual';
import { prepareVideoAttachmentsForRun } from '@/lib/chat/processAttachmentFile';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import type { LiveTokenUsage } from '@/lib/chat/contextUsage';
import type { RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import {
  useManyStore,
  type ManyChatSession,
  type ManyMessage,
  type ManyStatus,
  type PendingPdfRegion,
  type PinnedResource,
  type SessionRunPhase,
} from '@/lib/store/useManyStore';
import type { DomeTab } from '@/lib/store/useTabStore';
import { hydratePinnedContext } from '@/lib/many/hydratePinnedContext';

type Updater<T> = T | ((prev: T) => T);

type PreparedManySendInput = {
  textPart: string;
  pinSnapshot: Array<{ id: string; title: string; type: string; kind: 'person' | 'resource' | 'issue' | 'email' | 'social_post' }>;
  userRunMessage: ChatRunMessage;
  userMessage: string;
  hasAttachments: boolean;
};

type PrepareInputArgs = {
  messageOverride: string | undefined;
  input: string;
  pinnedResources: PinnedResource[];
  chatAttachments: ChatAttachment[];
  isSubmittingRef: MutableRefObject<boolean>;
  t: TFunction;
};

async function prepareManySendInput(
  args: PrepareInputArgs,
): Promise<PreparedManySendInput | null> {
  const textPart = (args.messageOverride ?? args.input).trim();
  const pinSnapshot = args.pinnedResources.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    kind: r.kind ?? ('resource' as const),
  }));
  if (
    (!textPart && args.chatAttachments.length === 0 && pinSnapshot.length === 0) ||
    args.isSubmittingRef.current
  ) {
    return null;
  }

  const preparedAttachments = await prepareVideoAttachmentsForRun(args.chatAttachments);
  const userRunMessage = buildUserRunMessage(
    textPart,
    preparedAttachments,
    args.t('chat.attachment_extraction_empty'),
  );
  const userMessage = redactBase64FromText(userRunMessage.content);
  const hasAttachments =
    (userRunMessage.attachments?.images?.length ?? 0) > 0 ||
    (userRunMessage.attachments?.videos?.length ?? 0) > 0;
  if (!userMessage && !hasAttachments && pinSnapshot.length === 0) return null;

  return { textPart, pinSnapshot, userRunMessage, userMessage, hasAttachments };
}

type ValidateConfigArgs = {
  t: TFunction;
  setError: (error: string | null) => void;
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
};

/**
 * Resolves the AI provider config and reports inline assistant messages on
 * bailout (no config / provider not ready). Returns the validated config when
 * ready. Mirrors the early-return semantics of the original handler.
 */
async function validateManyAIConfig(
  args: ValidateConfigArgs,
): Promise<Awaited<ReturnType<typeof getAIConfig>>> {
  const config = await getAIConfig();
  if (!config) {
    args.addMessage({
      role: 'assistant',
      content: args.t('chat.no_ai_config'),
    });
    return null;
  }

  const providerReady = await checkChatProviderReady(config);
  if (!providerReady.ready) {
    const isApiKey = providerReady.messageKey === 'chat.no_api_key';
    if (isApiKey) args.setError(args.t('chat.api_key_error_inline'));
    args.addMessage({
      role: 'assistant',
      content: args.t(providerReady.messageKey),
    });
    return null;
  }

  return config;
}

type ReportErrorArgs = {
  err: unknown;
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
  t: TFunction;
};

function reportManySendError({ err, addMessage, t }: ReportErrorArgs): void {
  console.error('[Many] Error:', err);
  const msg = err instanceof Error ? err.message : t('chat.error_unknown');
  addMessage({ role: 'assistant', content: t('chat.error_prefix', { msg }) });
  showToast('error', t('chat.many_error_toast', { msg }));
}

type FinalizeArgs = {
  providerForAnalytics: string | null;
  delegatedToRunEngine: boolean;
  chatSuccess: boolean;
  messageCount: number;
  abortControllerRef: MutableRefObject<AbortController | null>;
  setIsLoading: (loading: boolean) => void;
  setStatus: (status: ManyStatus) => void;
  setStreamingMessage: (updater: Updater<ManyMessageData | null>) => void;
  setPendingApproval: (approval: RunPendingApproval | null) => void;
  isHeadless: boolean;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  isSubmittingRef: MutableRefObject<boolean>;
};

function finalizeManySend({
  providerForAnalytics,
  delegatedToRunEngine,
  chatSuccess,
  messageCount,
  abortControllerRef,
  setIsLoading,
  setStatus,
  setStreamingMessage,
  setPendingApproval,
  isHeadless,
  inputRef,
  isSubmittingRef,
}: FinalizeArgs): void {
  if (providerForAnalytics && !delegatedToRunEngine) {
    capturePostHog(ANALYTICS_EVENTS.AI_CHAT_COMPLETED, {
      success: chatSuccess,
      provider: providerForAnalytics,
      message_count: messageCount,
    });
  }
  isSubmittingRef.current = false;
  if (!delegatedToRunEngine) {
    setIsLoading(false);
    setStatus('idle');
    setStreamingMessage(null);
    setPendingApproval(null);
    abortControllerRef.current = null;
  }
  if (!isHeadless) inputRef.current?.focus();
}

type ExecuteLaunchArgs = {
  config: NonNullable<Awaited<ReturnType<typeof getAIConfig>>>;
  t: TFunction;
  buildStaticPersona: () => string;
  pathname: string;
  homeSidebarSection: string | undefined;
  activeShellTabType: DomeTab['type'] | undefined;
  effectiveResourceTitle: string | null;
  effectiveResourceId: string | null;
  activeShellTab: DomeTab | undefined;
  currentFolderId: string | null;
  pinnedResources: PinnedResource[];
  toolsEnabled: boolean;
  memoryEnabled: boolean;
  userMemory: string;
  activeTools: AnyAgentTool[];
  supportsTools: boolean;
  mcpEnabled: boolean;
  currentSessionId: string | null;
  currentSession: ManyChatSession | null;
  chatProjectId: string;
  sendOptions: ManySendOptions | undefined;
  setStreamingMessage: (updater: Updater<ManyMessageData | null>) => void;
  setActiveRunId: (runId: string | null) => void;
  applyRunSnapshot: (run: PersistentRun | null) => void;
  voiceAutoSpeakForRunIdRef: MutableRefObject<string | null>;
  historyMessages: ManyMessage[];
  textPart: string;
  pinSnapshot: PreparedManySendInput['pinSnapshot'];
  userRunMessage: ChatRunMessage;
  userMessage: string;
};

/**
 * Resolves the user's memory block for the prompt. Pulls any matching
 * domain-pack memory from the main process and appends it to the
 * caller-supplied user memory. Domain-pack fetch is best-effort: a failure
 * is swallowed so a missing memory backend never aborts the run.
 */
async function resolveManyMemoryForPrompt(args: {
  memoryEnabled: boolean;
  userMemory: string;
  toolsEnabled: boolean;
  activeTools: AnyAgentTool[];
  activeShellTabType: DomeTab['type'] | undefined;
}): Promise<string | undefined> {
  const baseMemory =
    args.memoryEnabled && args.userMemory ? args.userMemory : undefined;
  if (!args.memoryEnabled) return baseMemory;

  const toolIdsForMemory = args.toolsEnabled
    ? args.activeTools.map((tool) => tool.name)
    : [];
  const domains = resolveMemoryDomains({
    shellTabType: args.activeShellTabType,
    toolNames: toolIdsForMemory,
  });
  if (domains.length === 0) return baseMemory;

  let domainBlock = '';
  try {
    const domainRes = await window.electron?.personality?.getAgentMemoryContext?.({
      memoryEnabled: true,
      includeProject: false,
      includeDomains: domains,
    });
    domainBlock = domainRes?.success ? domainRes.data?.domainMemory ?? '' : '';
  } catch {
    /* domain pack optional */
  }
  if (!domainBlock.trim()) return baseMemory;
  return [baseMemory, domainBlock.trim()].filter(Boolean).join('\n\n');
}

type PinnedPeople = ReturnType<
  typeof hydratePinnedContext
> extends Promise<infer R>
  ? R extends { people: infer P }
    ? P
    : never
  : never;
type PinnedSources = ReturnType<
  typeof hydratePinnedContext
> extends Promise<infer R>
  ? R extends { sources: infer S }
    ? S
    : never
  : never;
type PinnedDocs = ReturnType<
  typeof hydratePinnedContext
> extends Promise<infer R>
  ? R extends { docs: infer D }
    ? D
    : never
  : never;

/**
 * Builds the `volatileContext` block the system prompt consumes: location /
 * date line, UI context, and the pinned-source/people/docs excerpts.
 */
function buildManyVolatileContext(
  dateLine: string,
  uiContextBlock: string,
  memoryForPrompt: string | undefined,
  activeResourceType: string | undefined,
  deps: {
    pinnedPeople: PinnedPeople;
    enrichedSources: PinnedSources;
    pinnedDocs: PinnedDocs;
    effectiveResourceId: string | null;
    effectiveResourceTitle: string | null;
  },
): string {
  const { pinnedPeople, enrichedSources, pinnedDocs, effectiveResourceId, effectiveResourceTitle } = deps;
  return formatVolatileSourceContext({
    dateLine,
    uiContext: uiContextBlock,
    userMemory: memoryForPrompt,
    pinnedPeople:
      pinnedPeople.length > 0
        ? pinnedPeople.map((person) => ({
            id: person.id,
            title: person.title,
            identities: person.identities,
          }))
        : undefined,
    pinnedSources:
      enrichedSources.length > 0
        ? enrichedSources
            .filter(
              (src): src is typeof src & { kind: 'issue' | 'email' | 'social_post' } =>
                src.kind === 'issue' || src.kind === 'email' || src.kind === 'social_post',
            )
            .map((src) => ({
              kind: src.kind,
              id: src.id,
              title: src.title,
              meta: src.meta ?? null,
            }))
        : undefined,
    pinnedResources:
      pinnedDocs.length > 0
        ? pinnedDocs.map((r) => ({
            id: r.id,
            title: r.title,
            type: r.type,
          }))
        : undefined,
    activeResource:
      effectiveResourceId && effectiveResourceTitle
        ? {
            id: effectiveResourceId,
            title: effectiveResourceTitle,
            ...(activeResourceType ? { type: activeResourceType } : {}),
          }
        : null,
  });
}

/**
 * Resolves the OpenAI-style tool definitions, tool ids, and enabled MCP server
 * ids for the run. MCP loading is gated on `toolsEnabled && mcpEnabled`.
 */
async function resolveManyToolDefinitions(args: {
  toolsEnabled: boolean;
  supportsTools: boolean;
  activeTools: AnyAgentTool[];
  mcpEnabled: boolean;
}): Promise<{
  toolDefinitions: unknown[];
  toolIds: string[];
  mcpServerIds: string[];
}> {
  const toolDefinitions =
    args.toolsEnabled && args.supportsTools && args.activeTools.length > 0
      ? toOpenAIToolDefinitions(args.activeTools)
      : [];
  const toolIds = args.toolsEnabled ? args.activeTools.map((tool) => tool.name) : [];
  const mcpServerIds: string[] = [];
  if (args.toolsEnabled && args.mcpEnabled) {
    const servers = await loadMcpServersSetting();
    for (const server of servers) {
      if (server.enabled === false) continue;
      mcpServerIds.push(server.name);
    }
  }
  return { toolDefinitions, toolIds, mcpServerIds };
}

/**
 * Builds the unified system prompt (persona + volatile context + tool hint +
 * skills) and the final run messages array (system + history + current turn).
 */
async function buildManyRunMessages(args: {
  buildStaticPersona: () => string;
  volatileContext: string;
  t: TFunction;
  pathname: string;
  homeSidebarSection: string | undefined;
  currentFolderId: string | null;
  effectiveResourceId: string | null;
  effectiveResourceTitle: string | null;
  textPart: string;
  pinSnapshot: PreparedManySendInput['pinSnapshot'];
  userRunMessage: ChatRunMessage;
  userMessage: string;
  historyMessages: ManyMessage[];
  currentSessionId: string | null;
  sendOptions: ManySendOptions | undefined;
  voiceLanguage: string;
}): Promise<Array<{ role: string; content: string }>> {
  const staticPersona = args.buildStaticPersona();
  const toolHint = buildSharedResourceHint({
    pathname: args.pathname || '/',
    homeSidebarSection: args.homeSidebarSection,
    currentFolderId: args.currentFolderId,
    currentResourceId: args.effectiveResourceId,
    currentResourceTitle: args.effectiveResourceTitle,
  });
  let unifiedSystemPrompt = buildDomeSystemPrompt({
    staticPersona,
    volatileContext: args.volatileContext,
    extraSections: [toolHint],
    voiceLanguage: args.sendOptions?.autoSpeak ? args.voiceLanguage : null,
    coreToolsMode: 'minimal',
  });

  const manySkillState = useManyStore.getState();
  const stickySkillId = args.currentSessionId
    ? manySkillState.activeSkillIdBySession[args.currentSessionId] ?? null
    : null;
  unifiedSystemPrompt = await appendRunSkillsToPrompt(unifiedSystemPrompt, {
    messageText: args.textPart,
    pendingOneShotSkillId: manySkillState.pendingOneShotSkillId,
    activeStickySkillId: stickySkillId,
  });
  manySkillState.setPendingOneShotSkill(null);

  // The pinned context lives in the system prompt (`mentioned-sources`
  // / `mentioned-people`), not in the user's message. Appending it here
  // too duplicated every pin in the payload and — because the JSONL
  // session is the source of truth on reload — leaked the raw block into
  // the visible user bubble.
  const userText =
    args.userMessage.trim() ||
    (args.pinSnapshot.length > 0 ? 'Analyze the pinned context.' : '');

  const runUserMessage: ChatRunMessage = {
    ...args.userRunMessage,
    content: userText || args.userRunMessage.content,
    ...(args.pinSnapshot.length > 0 ? { pinnedResources: args.pinSnapshot } : {}),
  };

  return [
    { role: 'system', content: unifiedSystemPrompt },
    ...args.historyMessages.map((m) => ({ role: m.role, content: m.content })),
    runUserMessage,
  ];
}

/**
 * Persists the chat session (and the user turn) to the local DB. Returns the
 * new session id when persistence succeeds; null otherwise. Failures are
 * logged but never block the run.
 */
async function persistManyChatSession(args: {
  currentSessionId: string | null;
  effectiveResourceId: string | null;
  chatProjectId: string;
  toolIds: string[];
  mcpServerIds: string[];
  threadId: string;
  userMessage: string;
}): Promise<string | null> {
  if (!db.isAvailable() || !args.currentSessionId) return null;
  try {
    const sessionResult = await db.createChatSession({
      id: args.currentSessionId,
      agentId: null,
      resourceId: args.effectiveResourceId ?? null,
      threadId: args.threadId,
      toolIds: args.toolIds,
      mcpServerIds: args.mcpServerIds,
      mode: 'many',
      contextId: args.effectiveResourceId ?? null,
      projectId: args.chatProjectId,
    });
    if (!sessionResult.success || !sessionResult.data) return null;
    const dbSessionId = sessionResult.data.id;
    await db.addChatMessage({
      sessionId: dbSessionId,
      role: 'user',
      content: args.userMessage,
    });
    return dbSessionId;
  } catch (e) {
    console.warn('[Many] Could not persist chat to DB:', e);
    return null;
  }
}

/**
 * Hands the run off to the agent run engine, updates local run state, and
 * applies the returned snapshot to the live UI.
 */
async function dispatchManyAgentRun(args: {
  t: TFunction;
  setActiveRunId: (runId: string | null) => void;
  applyRunSnapshot: (run: PersistentRun | null) => void;
  voiceAutoSpeakForRunIdRef: MutableRefObject<string | null>;
  sendOptions: ManySendOptions | undefined;
  currentSessionId: string | null;
  currentSession: ManyChatSession | null;
  effectiveResourceId: string | null;
  chatProjectId: string;
  userMessage: string;
  runMessages: Array<{ role: string; content: string }>;
  toolDefinitions: unknown[];
  toolIds: string[];
  mcpServerIds: string[];
  dbSessionId: string | null;
  threadId: string;
  pinnedDocs: PinnedDocs;
  memoryEnabled: boolean;
  userMemory: string;
  workspacePath: string | undefined;
  voiceLanguage: string;
}): Promise<PersistentRun> {
  const run = await startAgentRun({
    ownerType: 'many',
    ownerId: args.currentSessionId || `many-${Date.now()}`,
    title: args.userMessage.slice(0, 80) || args.t('chat.many_run_title'),
    sessionId: args.dbSessionId,
    contextId: args.effectiveResourceId ?? null,
    sessionTitle: args.currentSession?.title || null,
    messages: args.runMessages,
    toolDefinitions: args.toolDefinitions,
    toolIds: args.toolIds,
    mcpServerIds: args.mcpServerIds,
    subagentIds: [],
    threadId: args.threadId,
    projectId: args.chatProjectId,
    autoSpeak: args.sendOptions?.autoSpeak ? true : undefined,
    voiceLanguage: args.sendOptions?.autoSpeak ? args.voiceLanguage : undefined,
    pinnedResourceIds:
      args.pinnedDocs.length > 0 ? args.pinnedDocs.map((r) => r.id) : undefined,
    userMemory: args.memoryEnabled && args.userMemory ? args.userMemory : undefined,
    workspacePath: args.workspacePath,
    thinkingLevel: args.currentSessionId
      ? useManyStore.getState().thinkingLevelBySession[args.currentSessionId] ?? 'off'
      : 'off',
  });
  if (args.sendOptions?.autoSpeak) {
    args.voiceAutoSpeakForRunIdRef.current = run.id;
  }
  args.setActiveRunId(run.id);
  args.applyRunSnapshot(run);
  return run;
}

/**
 * Orchestrates the run launch: builds the payload, persists the DB session,
 * and dispatches the agent run. The caller is responsible for having validated
 * the AI config and prepared the user input.
 */
async function executeManyRunLaunch(args: ExecuteLaunchArgs): Promise<void> {
  const uiLoc = getUiLocationDescription(
    args.pathname || '/',
    args.homeSidebarSection,
    args.activeShellTabType,
  );
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const partOfDay = getPartOfDay(now);
  const dateLine = [
    `- Location: ${uiLoc.location}`,
    `- The user is ${uiLoc.description}`,
    `- Date: ${dateStr}`,
    `- Time of day: ${partOfDay}`,
    args.effectiveResourceTitle ? `- Active resource title: "${args.effectiveResourceTitle}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const uiContextBlock = buildSharedUiContextBlock({
    pathname: args.pathname || '/',
    homeSidebarSection: args.homeSidebarSection,
    shellTabType: args.activeShellTabType,
    currentFolderId: args.currentFolderId,
    currentResourceId: args.effectiveResourceId,
    currentResourceTitle: args.effectiveResourceTitle,
  });

  const activeResourceType =
    args.activeShellTab?.type === 'note' || args.activeShellTab?.type === 'notebook'
      ? args.activeShellTab.type
      : args.activeShellTab?.splitResource?.resourceType;

  // Prefetch bodies/excerpts for chip-only pins (email / issue / social / person / docs).
  const hydrated = await hydratePinnedContext(args.pinnedResources);

  // A pinned issue bound to a local clone turns this turn into a coding
  // session: the main process resolves the path into the run's cwd.
  const workspacePath = hydrated.sources.reduce<string | undefined>((found, src) => {
    if (found) return found;
    const candidate = src.kind === 'issue' ? src.meta?.localPath : null;
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
  }, undefined);

  const memoryForPrompt = await resolveManyMemoryForPrompt({
    memoryEnabled: args.memoryEnabled,
    userMemory: args.userMemory,
    toolsEnabled: args.toolsEnabled,
    activeTools: args.activeTools,
    activeShellTabType: args.activeShellTabType,
  });

  const volatileContext = buildManyVolatileContext(
    dateLine,
    uiContextBlock,
    memoryForPrompt,
    typeof activeResourceType === 'string' ? activeResourceType : undefined,
    {
      pinnedPeople: hydrated.people,
      enrichedSources: hydrated.sources,
      pinnedDocs: hydrated.docs,
      effectiveResourceId: args.effectiveResourceId,
      effectiveResourceTitle: args.effectiveResourceTitle,
    },
  );

  const { toolDefinitions, toolIds, mcpServerIds } = await resolveManyToolDefinitions({
    toolsEnabled: args.toolsEnabled,
    supportsTools: args.supportsTools,
    activeTools: args.activeTools,
    mcpEnabled: args.mcpEnabled,
  });

  capturePostHog(ANALYTICS_EVENTS.AI_CHAT_STARTED, {
    provider: args.config.provider,
    has_tools: toolDefinitions.length > 0 || mcpServerIds.length > 0,
  });

  const voiceLanguage =
    args.sendOptions?.voiceLanguage ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('dome:language') : null) ||
    'es';

  const runMessages = await buildManyRunMessages({
    buildStaticPersona: args.buildStaticPersona,
    volatileContext,
    t: args.t,
    pathname: args.pathname,
    homeSidebarSection: args.homeSidebarSection,
    currentFolderId: args.currentFolderId,
    effectiveResourceId: args.effectiveResourceId,
    effectiveResourceTitle: args.effectiveResourceTitle,
    textPart: args.textPart,
    pinSnapshot: args.pinSnapshot,
    userRunMessage: args.userRunMessage,
    userMessage: args.userMessage,
    historyMessages: args.historyMessages,
    currentSessionId: args.currentSessionId,
    sendOptions: args.sendOptions,
    voiceLanguage,
  });

  args.setStreamingMessage({
    id: `streaming-${Date.now()}`,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
    toolCalls: [],
    streamingLabel:
      toolDefinitions.length > 0 || mcpServerIds.length > 0
        ? args.t('chat.thinking_evaluating_tools')
        : args.t('chat.processing'),
  });

  const threadId = args.currentSessionId!;
  const dbSessionId = await persistManyChatSession({
    currentSessionId: args.currentSessionId,
    effectiveResourceId: args.effectiveResourceId,
    chatProjectId: args.chatProjectId,
    toolIds,
    mcpServerIds,
    threadId,
    userMessage: args.userMessage,
  });

  await dispatchManyAgentRun({
    t: args.t,
    setActiveRunId: args.setActiveRunId,
    applyRunSnapshot: args.applyRunSnapshot,
    voiceAutoSpeakForRunIdRef: args.voiceAutoSpeakForRunIdRef,
    sendOptions: args.sendOptions,
    currentSessionId: args.currentSessionId,
    currentSession: args.currentSession,
    effectiveResourceId: args.effectiveResourceId,
    chatProjectId: args.chatProjectId,
    userMessage: args.userMessage,
    runMessages,
    toolDefinitions,
    toolIds,
    mcpServerIds,
    dbSessionId,
    threadId,
    pinnedDocs: hydrated.docs,
    memoryEnabled: args.memoryEnabled,
    userMemory: args.userMemory,
    workspacePath,
    voiceLanguage,
  });
}

export interface UseManySendOptions {
  input: string;
  setInput: (value: string) => void;
  chatAttachments: ChatAttachment[];
  setChatAttachments: (attachments: ChatAttachment[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  messages: ManyMessage[];
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
  setStatus: (status: ManyStatus) => void;
  setError: (error: string | null) => void;
  setPendingApproval: (approval: RunPendingApproval | null) => void;
  currentSessionId: string | null;
  currentSession: ManyChatSession | null;
  pinnedResources: PinnedResource[];
  petPromptOverride: string | null;
  pathname: string;
  homeSidebarSection: string | undefined;
  activeShellTabType: DomeTab['type'] | undefined;
  currentFolderId: string | null;
  chatProjectId: string;
  effectiveResourceId: string | null;
  effectiveResourceTitle: string | null;
  activeShellTab: DomeTab | undefined;
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  memoryEnabled: boolean;
  mcpEnabled: boolean;
  supportsTools: boolean;
  soulContent: string;
  userMemory: string;
  isHeadless: boolean;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  setStreamingMessage: (updater: Updater<ManyMessageData | null>) => void;
  setLiveUsage: (usage: LiveTokenUsage | null) => void;
  setCompactionNotice: (notice: CompactionNoticeData | null) => void;
  setActiveRunId: (runId: string | null) => void;
  applyRunSnapshot: (run: PersistentRun | null) => void;
  setPdfRegionStreamingMessage: (updater: Updater<ManyMessageData | null>) => void;
  pdfRegionStreamingMessage: ManyMessageData | null;
  activeRunSessionIdRef: MutableRefObject<string | null>;
  voiceAutoSpeakForRunIdRef: MutableRefObject<string | null>;
  isSubmittingRef: MutableRefObject<boolean>;
  activeRunId: string | null;
  abortControllerRef: MutableRefObject<AbortController | null>;
  scrollToBottom: (force?: boolean) => void;
  resetScrollLock: () => void;
  setSessionRunState: (sessionId: string, state: SessionRunPhase | null) => void;
  clearPendingPdfRegion: () => void;
  t: TFunction;
}

export function useManySend(options: UseManySendOptions) {
  const {
    input,
    setInput,
    chatAttachments,
    setChatAttachments,
    isLoading,
    setIsLoading,
    messages,
    addMessage,
    setStatus,
    setError,
    setPendingApproval,
    currentSessionId,
    currentSession,
    pinnedResources,
    petPromptOverride,
    pathname,
    homeSidebarSection,
    activeShellTabType,
    currentFolderId,
    chatProjectId,
    effectiveResourceId,
    effectiveResourceTitle,
    activeShellTab,
    toolsEnabled,
    resourceToolsEnabled,
    memoryEnabled,
    mcpEnabled,
    supportsTools,
    soulContent,
    userMemory,
    isHeadless,
    inputRef,
    setStreamingMessage,
    setLiveUsage,
    setCompactionNotice,
    setActiveRunId,
    applyRunSnapshot,
    setPdfRegionStreamingMessage,
    pdfRegionStreamingMessage,
    activeRunSessionIdRef,
    voiceAutoSpeakForRunIdRef,
    isSubmittingRef,
    activeRunId,
    abortControllerRef,
    scrollToBottom,
    resetScrollLock,
    setSessionRunState,
    clearPendingPdfRegion,
    t,
  } = options;

  const activeTools = useMemo(() => {
    const tools: AnyAgentTool[] = createManyToolsForContext(pathname || '/', {
      includeWeb: toolsEnabled,
      includeResources: resourceToolsEnabled,
    });
    if (memoryEnabled) {
      tools.push(createRememberFactTool());
    }
    return tools;
  }, [toolsEnabled, resourceToolsEnabled, memoryEnabled, pathname]);

  const buildStaticPersona = useCallback(() => {
    if (petPromptOverride) {
      return petPromptOverride;
    }
    if (soulContent.trim()) {
      return soulContent.trim();
    }
    return buildManyFloatingPrompt();
  }, [petPromptOverride, soulContent]);

  const hasAgentStream = typeof window !== 'undefined' && !!window.electron?.ai?.streamAgent;

  const handlePdfRegionSend = useCallback(
    async (userMessage: string, pending: PendingPdfRegion) => {
      if (isSubmittingRef.current) return;
      if (!window.electron?.db?.cloudLlm?.pdfRegionStream) {
        addMessage({ role: 'assistant', content: t('many.cloud_vision_unavailable') });
        return;
      }

      isSubmittingRef.current = true;
      setInput('');
      setError(null);
      addMessage({ role: 'user', content: userMessage });
      scrollToBottom(true);

      const streamBubbleId = `pdf-region-stream-${Date.now()}`;
      let accumulated = '';
      setPdfRegionStreamingMessage({
        id: streamBubbleId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        streamingLabel: t('many.pdf_region_streaming'),
      });

      const result = await runPdfRegionStream({
        imageDataUrl: pending.imageDataUrl,
        question: userMessage,
        onChunk: (text) => {
          accumulated += text;
          setPdfRegionStreamingMessage((prev) => (prev ? { ...prev, content: accumulated } : null));
        },
      });

      setPdfRegionStreamingMessage(null);
      isSubmittingRef.current = false;
      setStatus('idle');

      if (result.ok) {
        addMessage({
          role: 'assistant',
          content: accumulated,
          source: 'pdf_region',
          pdfRegionMeta: {
            resourceId: pending.resourceId,
            page: pending.page,
            resourceTitle: pending.resourceTitle,
            question: userMessage,
          },
        });
        clearPendingPdfRegion();
      } else {
        const errMsg =
          result.error === 'cloud_unavailable' ? t('many.cloud_vision_unavailable_detail') : result.error;
        addMessage({
          role: 'assistant',
          content: `**${t('common.error')}:** ${errMsg}`,
        });
      }
      scrollToBottom(true);
    },
    [
      addMessage,
      clearPendingPdfRegion,
      isSubmittingRef,
      scrollToBottom,
      setError,
      setInput,
      setPdfRegionStreamingMessage,
      setStatus,
      t,
    ],
  );

  const handleSend = useCallback(
    async (messageOverride?: string, sendOptions?: ManySendOptions) => {
      const prepared = await prepareManySendInput({
        messageOverride,
        input,
        pinnedResources,
        chatAttachments,
        isSubmittingRef,
        t,
      });
      if (!prepared) return;
      const { textPart, pinSnapshot, userRunMessage, userMessage } = prepared;

      if (pdfRegionStreamingMessage?.isStreaming) return;

      const pendingRegion = useManyStore.getState().pendingPdfRegion;
      if (pendingRegion) {
        if (sendOptions?.openPanel) {
          useManyStore.getState().setOpen(true);
        }
        await handlePdfRegionSend(userMessage, pendingRegion);
        return;
      }

      if (isLoading) return;

      if (sendOptions?.openPanel) {
        useManyStore.getState().setOpen(true);
      }

      isSubmittingRef.current = true;
      setInput('');
      setChatAttachments([]);
      // Pins travel with the message that was just sent, like attachments. Left
      // in the composer they silently ride along on every following turn.
      useManyStore.getState().clearPinnedResources();
      setIsLoading(true);
      setStatus('thinking');
      setError(null);
      setStreamingMessage(null);
      setLiveUsage(null);
      setCompactionNotice(null);
      abortControllerRef.current = null;

      addMessage({
        role: 'user',
        content: userMessage,
        attachments: userRunMessage.attachments,
        ...(pinSnapshot.length > 0 ? { pinnedResources: pinSnapshot } : {}),
      });
      if (currentSessionId) {
        activeRunSessionIdRef.current = currentSessionId;
        setSessionRunState(currentSessionId, 'thinking');
      }
      scrollToBottom(true);
      resetScrollLock();

      const fullResponse = '';
      let chatSuccess = true;
      let providerForAnalytics: string | null = null;
      let delegatedToRunEngine = false;

      try {
        const config = await validateManyAIConfig({ t, setError, addMessage });
        if (!config) {
          return;
        }
        if (!hasAgentStream) {
          throw new Error(t('chat.agent_tools_required'));
        }
        providerForAnalytics = config.provider;

        await executeManyRunLaunch({
          config,
          t,
          buildStaticPersona,
          pathname,
          homeSidebarSection,
          activeShellTabType,
          effectiveResourceTitle,
          effectiveResourceId,
          activeShellTab,
          currentFolderId,
          pinnedResources,
          toolsEnabled,
          memoryEnabled,
          userMemory,
          activeTools,
          supportsTools,
          mcpEnabled,
          currentSessionId,
          currentSession,
          chatProjectId,
          sendOptions,
          setStreamingMessage,
          setActiveRunId,
          applyRunSnapshot,
          voiceAutoSpeakForRunIdRef,
          historyMessages: messages.slice(-10),
          textPart,
          pinSnapshot,
          userRunMessage,
          userMessage,
        });
        delegatedToRunEngine = true;
      } catch (err) {
        chatSuccess = false;
        if (err instanceof Error && err.name === 'AbortError') {
          if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
        } else {
          reportManySendError({ err, addMessage, t });
        }
      } finally {
        finalizeManySend({
          providerForAnalytics,
          delegatedToRunEngine,
          chatSuccess,
          messageCount: messages.length + (fullResponse ? 1 : 0),
          abortControllerRef,
          setIsLoading,
          setStatus,
          setStreamingMessage,
          setPendingApproval,
          isHeadless,
          inputRef,
          isSubmittingRef,
        });
      }
    },
    [
      input,
      isLoading,
      messages,
      addMessage,
      setStatus,
      buildStaticPersona,
      effectiveResourceId,
      pathname,
      homeSidebarSection,
      activeShellTabType,
      currentFolderId,
      userMemory,
      memoryEnabled,
      pinnedResources,
      toolsEnabled,
      mcpEnabled,
      supportsTools,
      hasAgentStream,
      activeTools,
      scrollToBottom,
      resetScrollLock,
      effectiveResourceTitle,
      activeShellTab?.resourceId,
      activeShellTab?.title,
      currentSession,
      currentSessionId,
      applyRunSnapshot,
      isHeadless,
      chatProjectId,
      handlePdfRegionSend,
      pdfRegionStreamingMessage?.isStreaming,
      t,
      chatAttachments,
      setSessionRunState,
      abortControllerRef,
      activeRunSessionIdRef,
      setChatAttachments,
      setCompactionNotice,
      setError,
      setIsLoading,
      setLiveUsage,
      setPendingApproval,
      setStreamingMessage,
      setActiveRunId,
      voiceAutoSpeakForRunIdRef,
      isSubmittingRef,
      inputRef,
      setInput,
    ],
  );

  useEffect(() => {
    registerManyMessageSender(async (text, opts) => {
      await handleSend(text, opts);
    });
    return () => registerManyMessageSender(null);
  }, [handleSend]);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text) void handleSend(text);
    };
    window.addEventListener('dome:quick-reply', handler);
    return () => window.removeEventListener('dome:quick-reply', handler);
  }, [handleSend]);

  const handleAbort = useCallback(() => {
    if (activeRunId) {
      void abortRun(activeRunId);
      return;
    }
    abortControllerRef.current?.abort();
  }, [activeRunId, abortControllerRef]);

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex <= 0) return;
      let userMsgIndex = messageIndex - 1;
      while (userMsgIndex >= 0 && messages[userMsgIndex]?.role !== 'user') {
        userMsgIndex--;
      }
      if (userMsgIndex < 0) return;
      const userMessage = messages[userMsgIndex]?.content;
      if (!userMessage) return;
      await handleSend(userMessage);
    },
    [messages, handleSend],
  );

  return {
    handleSend,
    handlePdfRegionSend,
    handleAbort,
    handleRegenerate,
    buildStaticPersona,
    activeTools,
  };
}
