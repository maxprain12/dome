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
      const textPart = (messageOverride ?? input).trim();
      const pinSnapshot = pinnedResources.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        kind: r.kind ?? ('resource' as const),
      }));
      if (
        (!textPart && chatAttachments.length === 0 && pinSnapshot.length === 0) ||
        isSubmittingRef.current
      ) {
        return;
      }

      const preparedAttachments = await prepareVideoAttachmentsForRun(chatAttachments);
      const userRunMessage = buildUserRunMessage(
        textPart,
        preparedAttachments,
        t('chat.attachment_extraction_empty'),
      );
      const userMessage = redactBase64FromText(userRunMessage.content);
      const hasAttachments =
        (userRunMessage.attachments?.images?.length ?? 0) > 0 ||
        (userRunMessage.attachments?.videos?.length ?? 0) > 0;
      if (!userMessage && !hasAttachments && pinSnapshot.length === 0) return;

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
        const config = await getAIConfig();
        if (!config) {
          addMessage({
            role: 'assistant',
            content: t('chat.no_ai_config'),
          });
          return;
        }

        const providerReady = await checkChatProviderReady(config);
        if (!providerReady.ready) {
          const isApiKey = providerReady.messageKey === 'chat.no_api_key';
          if (isApiKey) setError(t('chat.api_key_error_inline'));
          addMessage({
            role: 'assistant',
            content: t(providerReady.messageKey),
          });
          return;
        }

        if (!hasAgentStream) {
          throw new Error(t('chat.agent_tools_required'));
        }

        const staticPersona = buildStaticPersona();
        const uiLoc = getUiLocationDescription(pathname || '/', homeSidebarSection, activeShellTabType);
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
          effectiveResourceTitle ? `- Active resource title: "${effectiveResourceTitle}"` : null,
        ]
          .filter(Boolean)
          .join('\n');

        const uiContextBlock = buildSharedUiContextBlock({
          pathname: pathname || '/',
          homeSidebarSection,
          shellTabType: activeShellTabType,
          currentFolderId,
          currentResourceId: effectiveResourceId,
          currentResourceTitle: effectiveResourceTitle,
        });

        const activeResourceType =
          activeShellTab?.type === 'note' || activeShellTab?.type === 'notebook'
            ? activeShellTab.type
            : activeShellTab?.splitResource?.resourceType;

        // Prefetch bodies/excerpts for chip-only pins (email / issue / social / person / docs).
        const hydrated = await hydratePinnedContext(pinnedResources);
        const pinnedPeople = hydrated.people;
        const enrichedSources = hydrated.sources;
        const pinnedDocs = hydrated.docs;

        const toolIdsForMemory = toolsEnabled ? activeTools.map((tool) => tool.name) : [];
        let memoryForPrompt = memoryEnabled && userMemory ? userMemory : undefined;
        if (memoryEnabled) {
          const domains = resolveMemoryDomains({
            shellTabType: activeShellTabType,
            toolNames: toolIdsForMemory,
          });
          if (domains.length > 0) {
            try {
              const domainRes = await window.electron?.personality?.getAgentMemoryContext?.({
                memoryEnabled: true,
                includeProject: false,
                includeDomains: domains,
              });
              const domainBlock = domainRes?.success ? domainRes.data?.domainMemory : '';
              if (domainBlock?.trim()) {
                memoryForPrompt = [memoryForPrompt, domainBlock.trim()].filter(Boolean).join('\n\n');
              }
            } catch {
              /* domain pack optional */
            }
          }
        }

        const volatileContext = formatVolatileSourceContext({
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

        const sharedContext = {
          pathname: pathname || '/',
          homeSidebarSection,
          currentFolderId,
          currentResourceId: effectiveResourceId,
          currentResourceTitle: effectiveResourceTitle,
        };
        const toolHint = buildSharedResourceHint(sharedContext);
        const rawToolDefinitions =
          toolsEnabled && supportsTools && activeTools.length > 0
            ? toOpenAIToolDefinitions(activeTools)
            : [];
        const toolDefinitions = rawToolDefinitions;
        const toolIds = toolsEnabled ? activeTools.map((tool) => tool.name) : [];
        const mcpServerIds: string[] = [];
        if (toolsEnabled && mcpEnabled) {
          const servers = await loadMcpServersSetting();
          for (const server of servers) {
            if (server.enabled === false) continue;
            mcpServerIds.push(server.name);
          }
        }

        providerForAnalytics = config.provider;
        capturePostHog(ANALYTICS_EVENTS.AI_CHAT_STARTED, {
          provider: config.provider,
          has_tools: toolDefinitions.length > 0 || mcpServerIds.length > 0,
        });

        const voiceLanguage =
          sendOptions?.voiceLanguage ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('dome:language') : null) ||
          'es';

        let unifiedSystemPrompt = buildDomeSystemPrompt({
          staticPersona,
          volatileContext,
          extraSections: [toolHint],
          voiceLanguage: sendOptions?.autoSpeak ? voiceLanguage : null,
        });

        const manySkillState = useManyStore.getState();
        const stickySkillId = currentSessionId
          ? (manySkillState.activeSkillIdBySession[currentSessionId] ?? null)
          : null;
        unifiedSystemPrompt = await appendRunSkillsToPrompt(unifiedSystemPrompt, {
          messageText: textPart,
          pendingOneShotSkillId: manySkillState.pendingOneShotSkillId,
          activeStickySkillId: stickySkillId,
        });
        manySkillState.setPendingOneShotSkill(null);

        const userText =
          userMessage.trim() ||
          (pinSnapshot.length > 0 ? 'Analyze the pinned context.' : '');
        const agentUserContent = [userText, ...hydrated.agentBlocks]
          .filter((part) => part && String(part).trim())
          .join('\n\n');

        const runUserMessage: ChatRunMessage = {
          ...userRunMessage,
          content: agentUserContent || userRunMessage.content,
        };

        const runMessages = [
          { role: 'system', content: unifiedSystemPrompt },
          ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          runUserMessage,
        ];

        setStreamingMessage({
          id: `streaming-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          toolCalls: [],
          streamingLabel:
            toolDefinitions.length > 0 || mcpServerIds.length > 0
              ? t('chat.thinking_evaluating_tools')
              : t('chat.processing'),
        });

        const threadId = currentSessionId!;

        let dbSessionId: string | null = null;
        if (db.isAvailable() && currentSessionId) {
          try {
            const sessionResult = await db.createChatSession({
              id: currentSessionId,
              agentId: null,
              resourceId: effectiveResourceId ?? null,
              threadId,
              toolIds,
              mcpServerIds,
              mode: 'many',
              contextId: effectiveResourceId ?? null,
              projectId: chatProjectId,
            });
            if (sessionResult.success && sessionResult.data) {
              dbSessionId = sessionResult.data.id;
              await db.addChatMessage({
                sessionId: dbSessionId,
                role: 'user',
                content: userMessage,
              });
            }
          } catch (e) {
            console.warn('[Many] Could not persist chat to DB:', e);
          }
        }

        const run = await startAgentRun({
          ownerType: 'many',
          ownerId: currentSessionId || `many-${Date.now()}`,
          title: userMessage.slice(0, 80) || t('chat.many_run_title'),
          sessionId: dbSessionId,
          contextId: effectiveResourceId ?? null,
          sessionTitle: currentSession?.title || null,
          messages: runMessages,
          toolDefinitions,
          toolIds,
          mcpServerIds,
          subagentIds: [],
          threadId,
          projectId: chatProjectId,
          autoSpeak: sendOptions?.autoSpeak ? true : undefined,
          voiceLanguage: sendOptions?.autoSpeak ? voiceLanguage : undefined,
          pinnedResourceIds:
            pinnedDocs.length > 0 ? pinnedDocs.map((r) => r.id) : undefined,
          userMemory: memoryEnabled && userMemory ? userMemory : undefined,
        });
        delegatedToRunEngine = true;
        if (sendOptions?.autoSpeak) {
          voiceAutoSpeakForRunIdRef.current = run.id;
        }
        setActiveRunId(run.id);
        applyRunSnapshot(run);
      } catch (err) {
        chatSuccess = false;
        if (err instanceof Error && err.name === 'AbortError') {
          if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
        } else {
          console.error('[Many] Error:', err);
          const msg = err instanceof Error ? err.message : t('chat.error_unknown');
          addMessage({ role: 'assistant', content: t('chat.error_prefix', { msg }) });
          showToast('error', t('chat.many_error_toast', { msg }));
        }
      } finally {
        if (providerForAnalytics && !delegatedToRunEngine) {
          capturePostHog(ANALYTICS_EVENTS.AI_CHAT_COMPLETED, {
            success: chatSuccess,
            provider: providerForAnalytics,
            message_count: messages.length + (fullResponse ? 1 : 0),
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
