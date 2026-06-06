import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import TokenBudgetBadge, { type BudgetBreakdown, type LiveTokenUsage } from './TokenBudgetBadge';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Search, FolderOpen, ClipboardList, Bot, BarChart2, Calendar, Mail, AlertCircle } from 'lucide-react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import ManyChatHistoryPanel from './ManyChatHistoryPanel';
import ChatHistoryPanel from '@/components/chat/ChatHistoryPanel';
import UnifiedChatInput from '@/components/chat/UnifiedChatInput';
import { useManyStore, type ManyChatSession, type ManyMessage, type PendingPdfRegion } from '@/lib/store/useManyStore';
import { mergeManySessionMessages } from '@/lib/chat/mergeManySessionMessages';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import {
  getAIConfig,
  checkChatProviderReady,
  createManyToolsForContext,
  findModelById,
  providerSupportsTools,
  toOpenAIToolDefinitions,
  type AIProviderType,
  type AnyAgentTool,
} from '@/lib/ai';
import { estimateLiveBudget } from '@/lib/chat/estimateLiveBudget';
import {
  buildSharedResourceHint,
  buildSharedUiContextBlock,
  getUiLocationDescription,
} from '@/lib/ai/shared-capabilities';
import { createRememberFactTool } from '@/lib/ai/tools/memory';
import { buildManyFloatingPrompt, getPartOfDay } from '@/lib/prompts/loader';
import { buildDomeSystemPrompt, formatVolatileSourceContext } from '@/lib/chat/buildDomeSystemPrompt';
import { appendRunSkillsToPrompt } from '@/lib/skills/resolve-run-skills';
import { showToast } from '@/lib/store/useToastStore';
import ManyAvatar from './ManyAvatar';
import ManyMinimalStatusRow from './ManyMinimalStatusRow';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildCitationMap } from '@/lib/utils/citations';
import { db } from '@/lib/db/client';
import { capturePostHog } from '@/lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import {
  abortRun,
  getActiveRunBySession,
  resumeRun,
  startLangGraphRun,
  type PersistentRun,
} from '@/lib/automations/api';
import { registerManyMessageSender, type ManySendOptions } from '@/lib/many/manySendController';
import { runPdfRegionStream } from '@/lib/hooks/usePdfRegionStream';
import UICursorOverlay from './UICursorOverlay';
import PdfRegionBanner from '@/components/many/PdfRegionBanner';
import { streamingLabelForToolName } from '@/lib/chat/streamingLabels';
import { useLangGraphRunStream, type RunPendingApproval } from '@/lib/chat/useLangGraphRunStream';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import ManyHitlInlineSection from '@/components/many/ManyHitlInlineSection';
import { useApprovalStore } from '@/lib/store/useApprovalStore';
import { cn } from '@/lib/utils';
import { UnifiedChatMessageArea } from '@/components/chat/UnifiedChatMessages';
import { buildUserRunMessage, type ChatRunMessage } from '@/lib/chat/attachmentTypes';
import { prepareVideoAttachmentsForRun } from '@/lib/chat/processAttachmentFile';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';

interface ManyPanelProps {
  width: number;
  onClose: () => void;
  isVisible: boolean;
  isFullscreen?: boolean;
  /** Motor de mensajes sin UI (voz global con panel lateral cerrado / pestaña Chat). */
  mode?: 'full' | 'headless';
}

export default function ManyPanel({ width, onClose, isVisible, isFullscreen = false, mode = 'full' }: ManyPanelProps) {
  const isHeadless = mode === 'headless';
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const {
    status,
    setFullscreen: _setFullscreen,
    setStatus,
    messages,
    addMessage,
    clearMessages,
    startNewChat,
    switchSession: _switchSession,
    deleteSession: _deleteSession,
    hydrateSession,
    sessions,
    currentSessionId,
    currentResourceId,
    currentResourceTitle,
    petPromptOverride,
    pinnedResources,
  } = useManyStore(
    useShallow((s) => ({
      status: s.status,
      setFullscreen: s.setFullscreen,
      setStatus: s.setStatus,
      messages: s.messages,
      addMessage: s.addMessage,
      clearMessages: s.clearMessages,
      startNewChat: s.startNewChat,
      switchSession: s.switchSession,
      deleteSession: s.deleteSession,
      hydrateSession: s.hydrateSession,
      sessions: s.sessions,
      currentSessionId: s.currentSessionId,
      currentResourceId: s.currentResourceId,
      currentResourceTitle: s.currentResourceTitle,
      petPromptOverride: s.petPromptOverride,
      pinnedResources: s.pinnedResources,
    })),
  );
  const pendingPdfRegion = useManyStore((s) => s.pendingPdfRegion);
  const clearPendingPdfRegion = useManyStore((s) => s.clearPendingPdfRegion);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const activeShellTabType = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.type);
  const chatProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const pendingManyHandoff = useManyStore((s) => s.pendingManyHandoff);
  const setPendingManyHandoff = useManyStore((s) => s.setPendingManyHandoff);

  const [input, setInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userMemory, setUserMemory] = useState<string>('');
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [mcpEnabled, setMcpEnabledState] = useState(true);
  const [supportsTools, setSupportsTools] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [pdfRegionStreamingMessage, setPdfRegionStreamingMessage] = useState<ChatMessageData | null>(null);
  const [pendingApproval, setPendingApproval] = useState<RunPendingApproval | null>(null);
  const approvalQueueLen = useApprovalStore((s) => s.queue.length);
  const showHitlInline = Boolean(pendingApproval || approvalQueueLen > 0);
  const prefersReducedMotion = useReducedMotion();
  const [providerInfo, setProviderInfo] = useState<string>('');
  const [providerId, setProviderId] = useState<string>('');
  const [lastBudget, setLastBudget] = useState<BudgetBreakdown | null>(null);
  const [liveUsage, setLiveUsage] = useState<LiveTokenUsage | null>(null);
  const [budgetCapApprox, setBudgetCapApprox] = useState(200_000);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<ChatMessageData | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingApprovalRef = useRef<HTMLDivElement>(null);
  const hitlDecisionsRef = useRef<Array<unknown> | null>(null);
  const isSubmittingRef = useRef(false);
  const voiceAutoSpeakForRunIdRef = useRef<string | null>(null);
  // Ref so the onRunUpdated listener always calls the latest refreshSessionFromDb
  // without re-registering the listener every time currentSession changes.
  const refreshSessionFromDbRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  const effectiveResourceId =
    currentResourceId ||
    (pathname?.startsWith('/workspace') ? searchParams.get('id') : null);

  useEffect(() => {
    streamingMessageRef.current = streamingMessage;
  }, [streamingMessage]);

  useEffect(() => {
    const loadProviderInfo = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        const model =
          config.provider === 'ollama'
            ? (config.ollamaModel || 'default')
            : (config.model || 'default');
        const displayInfo = model.startsWith(`${config.provider}/`) ? config.provider : `${config.provider} / ${model}`;
        setProviderId(String(config.provider));
        setProviderInfo(displayInfo);
        setSupportsTools(providerSupportsTools(config.provider as AIProviderType));
        const modelId = config.provider === 'ollama' ? config.ollamaModel : config.model;
        const found = modelId ? findModelById(modelId) : undefined;
        setBudgetCapApprox(found?.model.contextWindow ?? 200_000);
      } else {
        setProviderInfo(t('chat.not_configured'));
        setProviderId('');
        setSupportsTools(false);
        setBudgetCapApprox(200_000);
      }
    };
    loadProviderInfo();
    const handleConfigChanged = () => loadProviderInfo();
    window.addEventListener('dome:ai-config-changed', handleConfigChanged);
    return () => window.removeEventListener('dome:ai-config-changed', handleConfigChanged);
  }, [t]);

  useEffect(() => {
    if (!isVisible || isHeadless) return;
    if (!pendingManyHandoff) return;
    const text = pendingManyHandoff;
    setInput(text);
    setPendingManyHandoff(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = text.length;
      el.setSelectionRange(len, len);
    });
  }, [isVisible, isHeadless, pendingManyHandoff, setPendingManyHandoff]);

  useEffect(() => {
    const loadMcpEnabled = async () => {
      if (db.isAvailable()) {
        const res = await db.getMcpGlobalEnabled();
        setMcpEnabledState(res.success ? res.data !== false : true);
      }
    };
    loadMcpEnabled();
  }, []);

  useEffect(() => {
    const loadMemory = async () => {
      if (!window.electron?.personality?.readFile) return;
      const [memRes, userRes] = await Promise.all([
        window.electron.personality.readFile('MEMORY.md'),
        window.electron.personality.readFile('USER.md'),
      ]);
      const parts: string[] = [];
      if (memRes?.data?.trim()) parts.push(memRes.data.trim());
      if (userRes?.data?.trim()) parts.push(userRes.data.trim());
      setUserMemory(parts.join('\n\n'));
    };
    loadMemory();
  }, []);

  // Startup: sync current session from DB — recovers messages that survived an app restart
  // even if localStorage was cleared or quota-failed.
  useEffect(() => {
    if (!currentSessionId || !db.isAvailable()) {
      return;
    }

    let cancelled = false;
    void db.getChatSession(currentSessionId).then((result) => {
      if (cancelled || !result.success || !result.data) {
        return;
      }

      const persistedMessages: ManyMessage[] = result.data.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.created_at,
        toolCalls: message.tool_calls ?? undefined,
        thinking: message.thinking ?? undefined,
      }));

      // Must have at least one user message and one assistant message to be worth hydrating.
      // If DB only has an assistant message (partial write), keep localStorage as-is.
      const hasUserMsg = persistedMessages.some((m) => m.role === 'user');
      const hasAssistantMsg = persistedMessages.some((m) => m.role === 'assistant');
      if (!hasUserMsg || !hasAssistantMsg) return;

      const localMessages = currentSession?.messages ?? [];
      const mergedMessages = mergeManySessionMessages(localMessages, persistedMessages);
      const localCount = localMessages.length;
      const localAssistants = localMessages.filter((m) => m.role === 'assistant').length;
      const mergedAssistants = mergedMessages.filter((m) => m.role === 'assistant').length;

      if (mergedMessages.length <= localCount && mergedAssistants <= localAssistants) {
        return;
      }

      hydrateSession({
        id: currentSessionId,
        title: result.data.title || currentSession?.title || t('chat.session_fallback_new'),
        messages: mergedMessages,
        createdAt: currentSession?.createdAt ?? result.data.messages[0]?.created_at ?? Date.now(),
      } satisfies ManyChatSession);
    }).catch((error) => {
      console.warn('[Many] Could not hydrate session from DB:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, currentSession, hydrateSession, t]);

  // Startup: recover sessions from DB that are missing from localStorage.
  // Runs once on mount. Handles the case where localStorage was cleared but DB survived.
  useEffect(() => {
    if (!db.isAvailable()) return;
    let cancelled = false;

    void (async () => {
      try {
        const listResult = await db.getChatSessionsGlobal(20);
        if (cancelled || !listResult.success || !Array.isArray(listResult.data)) return;

        const { sessions: localSessions, hydrateSession: hydrateS } = useManyStore.getState();
        const localIds = new Set(localSessions.map((s) => s.id));

        // The SQL SELECT * returns all columns; cast through unknown to access title/mode
        type DbSessionRow = { id: string; title?: string | null; created_at?: number; updated_at?: number; mode?: string | null };
        for (const dbSession of (listResult.data as unknown as DbSessionRow[])) {
          if (cancelled) break;
          // Skip if already in localStorage
          if (localIds.has(dbSession.id)) continue;

          // Load full session to get messages
          const fullResult = await db.getChatSession(dbSession.id);
          if (cancelled || !fullResult.success || !fullResult.data) continue;

          const msgs: ManyMessage[] = fullResult.data.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.created_at,
            toolCalls: m.tool_calls ?? undefined,
            thinking: m.thinking ?? undefined,
          }));

          // Only recover sessions that have at least one user+assistant exchange
          const hasUser = msgs.some((m) => m.role === 'user');
          const hasAssistant = msgs.some((m) => m.role === 'assistant');
          if (!hasUser || !hasAssistant) continue;

          hydrateS({
            id: dbSession.id,
            title: fullResult.data.title || dbSession.title || t('chat.session_fallback_chat'),
            messages: msgs,
            createdAt: dbSession.created_at ?? Date.now(),
          } satisfies ManyChatSession);
        }
      } catch (err) {
        console.warn('[Many] DB session recovery failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [t]); // also when language changes

  const refreshSessionFromDb = useCallback(async (): Promise<boolean> => {
    if (!currentSessionId || !db.isAvailable()) {
      return false;
    }
    const result = await db.getChatSession(currentSessionId);
    if (!result.success || !result.data) {
      return false;
    }
    const dbMessages = result.data.messages.map((message) => ({
      id: message.id,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp: message.created_at,
      toolCalls: message.tool_calls ?? undefined,
      thinking: message.thinking ?? undefined,
    }));
    // Guard: the last DB message must be an assistant message.
    // If it's a user message (or missing), the run's assistant write hasn't
    // landed yet (sessionId null, DB error, or race). Keep streaming visible.
    const lastDbMessage = dbMessages[dbMessages.length - 1];
    if (!lastDbMessage || lastDbMessage.role !== 'assistant') return false;
    // Guard: the DB session must have at least one user message before the assistant.
    // If DB only has assistant messages (user message write failed), don't hydrate —
    // that would wipe the user message that's already visible in localStorage.
    const hasUserMessage = dbMessages.some((m) => m.role === 'user');
    if (!hasUserMessage) return false;
    // Guard: if the last assistant message has neither content nor tool calls,
    // the write may have landed but with empty output. Keep streaming visible.
    const hasContent = !!lastDbMessage.content?.trim();
    const hasToolCalls = Array.isArray(lastDbMessage.toolCalls) && lastDbMessage.toolCalls.length > 0;
    if (!hasContent && !hasToolCalls) return false;

    const localMessages = useManyStore.getState().messages;
    const mergedMessages = mergeManySessionMessages(localMessages, dbMessages);
    const localAssistants = localMessages.filter((m) => m.role === 'assistant').length;
    const mergedAssistants = mergedMessages.filter((m) => m.role === 'assistant').length;
    if (mergedMessages.length < localMessages.length || mergedAssistants < localAssistants) {
      return false;
    }

    hydrateSession({
      id: currentSessionId,
      title: result.data.title || currentSession?.title || t('chat.session_fallback_new'),
      messages: mergedMessages,
      createdAt: currentSession?.createdAt ?? result.data.messages[0]?.created_at ?? Date.now(),
    } satisfies ManyChatSession);
    return true;
  }, [currentSession, currentSessionId, hydrateSession, t]);
  refreshSessionFromDbRef.current = refreshSessionFromDb;

  const applyRunSnapshot = useCallback((run: PersistentRun | null) => {
    if (!run) {
      setActiveRunId(null);
      return;
    }
    setActiveRunId(run.id);
    if (run.status === 'waiting_approval') {
      const pending = run.metadata?.pendingApproval as
        | {
            actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
            reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
          }
        | undefined;
      if (pending?.actionRequests && pending.actionRequests.length > 0) {
        setPendingApproval({
          actionRequests: pending.actionRequests,
          reviewConfigs: Array.isArray(pending.reviewConfigs) ? pending.reviewConfigs : [],
          submitResume: (decisions: Array<unknown>) => {
            hitlDecisionsRef.current = decisions;
            void resumeRun(run.id, decisions);
          },
        });
      }
    } else {
      setPendingApproval(null);
    }
    if (['queued', 'running', 'waiting_approval'].includes(run.status)) {
      setIsLoading(true);
      setStatus('thinking');
      setStreamingMessage((prev) => ({
        id: prev?.id || `run-${run.id}`,
        role: 'assistant',
        content: run.outputText || '',
        timestamp: run.updatedAt || Date.now(),
        isStreaming: run.status !== 'waiting_approval',
        toolCalls: prev?.toolCalls || [],
        streamingLabel:
          run.status === 'waiting_approval'
            ? t('chat.waiting_approval')
            : (prev?.streamingLabel || t('chat.running_background')),
      }));
      return;
    }
    setIsLoading(false);
    setStatus('idle');
    setStreamingMessage(null);
    setPendingApproval(null);
  }, [setStatus, t]);

  useEffect(() => {
    if (!currentSessionId) {
      setActiveRunId(null);
      return;
    }
    let cancelled = false;
    void getActiveRunBySession(currentSessionId)
      .then((run) => {
        if (!cancelled) {
          applyRunSnapshot(run);
        }
      })
      .catch((error) => {
        console.warn('[Many] Could not load active run:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [applyRunSnapshot, currentSessionId]);

  const handleManyRunStatus = useCallback(
    (run: PersistentRun) => {
      if (!['completed', 'failed', 'cancelled'].includes(run.status)) {
        applyRunSnapshot(run);
      }
    },
    [applyRunSnapshot],
  );

  const handleManyRunTerminal = useCallback(
    (run: PersistentRun) => {
      if (voiceAutoSpeakForRunIdRef.current === run.id) {
        voiceAutoSpeakForRunIdRef.current = null;
      }
      const streamSnap = streamingMessageRef.current;
      setActiveRunId(null);
      setIsLoading(false);
      setStatus('idle');
      setPendingApproval(null);

      const isCancelled = run.status === 'cancelled';
      const isFailed = run.status === 'failed';
      const errorMsg = isFailed
        ? (run.error
          ? t('chat.run_failed_error', { error: run.error })
          : t('chat.run_failed_generic'))
        : null;

      setStreamingMessage((prev) => {
        const metaToolCallsRaw = Array.isArray(run.metadata?.toolCalls)
          ? (run.metadata.toolCalls as ToolCallData[])
          : [];
        const metaToolCalls = coalesceDuplicateToolCalls(metaToolCallsRaw);
        if (prev) {
          const toolCalls = metaToolCalls.length > 0 ? metaToolCalls : coalesceDuplicateToolCalls(prev.toolCalls ?? []);
          // For failed runs with no output, append the error to the streamed content
          if (isFailed && errorMsg && !run.outputText) {
            return { ...prev, isStreaming: false, toolCalls, content: prev.content ? `${prev.content}\n\n${errorMsg}` : errorMsg };
          }
          return { ...prev, isStreaming: false, toolCalls };
        }
        if (!run.outputText && metaToolCalls.length === 0) {
          // For failed runs show the error instead of vanishing silently
          if (isFailed && errorMsg) {
            return {
              id: `run-${run.id}`,
              role: 'assistant',
              content: errorMsg,
              timestamp: run.updatedAt || Date.now(),
              isStreaming: false,
              toolCalls: [],
            };
          }
          return null;
        }
        return {
          id: `run-${run.id}`,
          role: 'assistant',
          content: run.outputText || '',
          timestamp: run.updatedAt || Date.now(),
          isStreaming: false,
          toolCalls: metaToolCalls,
        };
      });
      const metaToolCalls = coalesceDuplicateToolCalls(
        Array.isArray(run.metadata?.toolCalls) ? (run.metadata.toolCalls as ToolCallData[]) : [],
      );
      const streamToolCalls = coalesceDuplicateToolCalls(streamSnap?.toolCalls ?? []);
      const finalToolCalls: ToolCallData[] =
        metaToolCalls.length > 0 ? metaToolCalls : streamToolCalls;
      const finalContent =
        (run.outputText || streamSnap?.content || '').trim() ||
        (isFailed && errorMsg ? errorMsg : '') ||
        (isCancelled ? t('many.run_stopped_partial') : '');

      const persistPartialToSession = () => {
        if (!finalContent && finalToolCalls.length === 0) return;
        const lastMessage = useManyStore.getState().messages.at(-1);
        if (
          lastMessage?.role === 'assistant' &&
          lastMessage.content.trim() === finalContent.trim() &&
          (lastMessage.toolCalls?.length ?? 0) === finalToolCalls.length
        ) {
          setStreamingMessage(null);
          return;
        }
        addMessage({
          role: 'assistant',
          content: finalContent,
          toolCalls: finalToolCalls,
        });
        setStreamingMessage(null);
      };

      if (finalContent || finalToolCalls.length > 0) {
        persistPartialToSession();
      } else {
        setStreamingMessage(null);
      }

      const tryRefresh = (attemptsLeft: number) => {
        void refreshSessionFromDbRef
          .current()
          .then((hydrated) => {
            if (!hydrated && attemptsLeft > 0) {
              setTimeout(() => tryRefresh(attemptsLeft - 1), 600);
            }
          })
          .catch((err) => {
            console.warn('[Many] refreshSessionFromDb failed after run terminal:', err);
          });
      };
      tryRefresh(2);
      if (run.status === 'completed') {
        window.dispatchEvent(new Event('dome:resources-changed'));
      }
    },
    [addMessage, setStatus, t],
  );

  const handleManyPendingApproval = useCallback(
    (approval: { actionRequests: Array<{ name: string; args: Record<string, unknown>; description?: string }>; reviewConfigs: Array<{ actionName: string; allowedDecisions: string[] }>; submitResume: (decisions: Array<unknown>) => void } | null) => {
      if (!approval) {
        setPendingApproval(null);
        return;
      }
      setPendingApproval({
        actionRequests: approval.actionRequests,
        reviewConfigs: approval.reviewConfigs,
        submitResume: (decisions: Array<unknown>) => {
          hitlDecisionsRef.current = decisions;
          approval.submitResume(decisions);
        },
      });
    },
    [],
  );

  useLangGraphRunStream({
    activeRunId,
    setStreamingMessage,
    setPendingApproval: handleManyPendingApproval,
    onRunStatus: handleManyRunStatus,
    onRunTerminal: handleManyRunTerminal,
    onBudget: setLastBudget,
    onUsage: (usage) => setLiveUsage(usage),
    t,
  });


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

  const scrollToBottom = useCallback(
    (force = false) => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (force || isNearBottom) {
        messagesEndRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }
    },
    [prefersReducedMotion],
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, pdfRegionStreamingMessage, scrollToBottom]);

  useEffect(() => {
    if (showHitlInline && pendingApprovalRef.current) {
      pendingApprovalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showHitlInline]);

  useEffect(() => {
    if (isHeadless) return;
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeoutId);
  }, [isHeadless]);

  const hadPendingApprovalRef = useRef(false);
  useEffect(() => {
    const has = Boolean(pendingApproval);
    // Solo el Many en sidebar (no headless ni pestaña Chat fullscreen): ahí el HITL no es inline.
    const shouldOpenShellPanel = !isHeadless && !isFullscreen;
    if (has && shouldOpenShellPanel) {
      window.dispatchEvent(new CustomEvent('dome:many-requires-panel', { detail: { reason: 'hitl' } }));
    } else if (!has && hadPendingApprovalRef.current) {
      window.dispatchEvent(new CustomEvent('dome:many-hitl-cleared'));
    }
    hadPendingApprovalRef.current = has;
  }, [pendingApproval, isHeadless, isFullscreen]);

  const buildStaticPersona = useCallback(() => {
    if (petPromptOverride) {
      return petPromptOverride;
    }
    return buildManyFloatingPrompt();
  }, [petPromptOverride]);

  const hasLangGraph = typeof window !== 'undefined' && !!window.electron?.ai?.streamLangGraph;

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
    [addMessage, clearPendingPdfRegion, scrollToBottom, setStatus, t],
  );

  const handleSend = useCallback(async (messageOverride?: string, sendOptions?: ManySendOptions) => {
    const textPart = (messageOverride ?? input).trim();
    if ((!textPart && chatAttachments.length === 0) || isSubmittingRef.current) return;

    const preparedAttachments = await prepareVideoAttachmentsForRun(chatAttachments);
    const userRunMessage = buildUserRunMessage(
      textPart,
      preparedAttachments,
      t('chat.attachment_extraction_empty'),
    );
    const userMessage = userRunMessage.content;
    if (!userMessage) return;

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
    setLastBudget(null);
    setLiveUsage(null);
    setAbortController(null);

    addMessage({ role: 'user', content: userMessage });
    scrollToBottom(true);

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

      if (!hasLangGraph) {
        throw new Error(t('chat.langgraph_required'));
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
        currentResourceTitle ? `- Active resource title: "${currentResourceTitle}"` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const uiContextBlock = buildSharedUiContextBlock({
        pathname: pathname || '/',
        homeSidebarSection,
        shellTabType: activeShellTabType,
        currentFolderId,
        currentResourceId: effectiveResourceId,
        currentResourceTitle: currentResourceTitle || null,
      });

      const volatileContext = formatVolatileSourceContext({
        dateLine,
        uiContext: uiContextBlock,
        userMemory: userMemory || undefined,
        pinnedResources:
          pinnedResources.length > 0
            ? pinnedResources.map((r) => ({
                id: r.id,
                title: r.title,
                type: r.type,
              }))
            : undefined,
        activeResource:
          effectiveResourceId && currentResourceTitle
            ? { id: effectiveResourceId, title: currentResourceTitle }
            : null,
      });

      const sharedContext = {
        pathname: pathname || '/',
        homeSidebarSection,
        currentFolderId,
        currentResourceId: effectiveResourceId,
        currentResourceTitle: currentResourceTitle || null,
      };
      const toolHint = buildSharedResourceHint(sharedContext);
      const rawToolDefinitions =
        toolsEnabled && supportsTools && activeTools.length > 0
          ? toOpenAIToolDefinitions(activeTools)
          : [];
      const toolDefinitions = rawToolDefinitions;
      const toolIds = toolsEnabled ? activeTools.map((tool) => tool.name) : [];
      const mcpServerIds =
        toolsEnabled && mcpEnabled
          ? (await loadMcpServersSetting())
              .filter((server) => server.enabled !== false)
              .map((server) => server.name)
          : [];

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
        ? manySkillState.activeSkillIdBySession[currentSessionId] ?? null
        : null;
      unifiedSystemPrompt = await appendRunSkillsToPrompt(unifiedSystemPrompt, {
        messageText: textPart,
        pendingOneShotSkillId: manySkillState.pendingOneShotSkillId,
        activeStickySkillId: stickySkillId,
      });
      manySkillState.setPendingOneShotSkill(null);

      const runMessages = [
        { role: 'system', content: unifiedSystemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        userRunMessage as ChatRunMessage,
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

      const threadId = `many_${effectiveResourceId || 'global'}_${Date.now()}`;

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

      const run = await startLangGraphRun({
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
        pinnedResourceIds: pinnedResources.length > 0 ? pinnedResources.map((r) => r.id) : undefined,
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
        setAbortController(null);
      }
      if (!isHeadless) inputRef.current?.focus();
    }
  }, [
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
    pinnedResources,
    toolsEnabled,
    mcpEnabled,
    supportsTools,
    hasLangGraph,
    activeTools,
    scrollToBottom,
    currentResourceTitle,
    currentSession,
    currentSessionId,
    applyRunSnapshot,
    isHeadless,
    chatProjectId,
    handlePdfRegionSend,
    pdfRegionStreamingMessage?.isStreaming,
    t,
    chatAttachments,
  ]);

  useEffect(() => {
    registerManyMessageSender(async (text, opts) => {
      await handleSend(text, opts);
    });
    return () => registerManyMessageSender(null);
  }, [handleSend]);

  // Soft confirmation quick-reply (needs_confirmation pattern in ChatToolCard)
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text) void handleSend(text);
    };
    window.addEventListener('dome:quick-reply', handler);
    return () => window.removeEventListener('dome:quick-reply', handler);
  }, [handleSend]);

  // TTS → store sync lives in ManyVoiceBridge (AppShell) so status updates work when
  // this panel is hidden or replaced by ChatHistoryPanel.
  // `dome:ui-action` IPC is handled once in AppShell → `installDomeUiActionBridge()`.

  const handleAbort = useCallback(() => {
    if (activeRunId) {
      void abortRun(activeRunId);
      return;
    }
    if (abortController) abortController.abort();
  }, [abortController, activeRunId]);

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

  const handleDismissManyError = useCallback(() => setError(null), []);

  const handleReportManyError = useCallback(() => {
    if (!error) return;
    void navigator.clipboard
      .writeText(error)
      .then(() => {
        showToast('info', t('many.error_copied'));
      })
      .catch(() => {
        showToast('error', t('viewer.transcript_copy_failed'));
      });
  }, [error, t]);

  const chatMessages: ChatMessageData[] = useMemo(
    () =>
      messages.map((m) => {
        const toolCalls = m.toolCalls?.map((toolCall) => ({
          ...toolCall,
          status: toolCall.status ?? 'success',
        })) as ToolCallData[] | undefined;

        return {
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          toolCalls,
          citationMap: buildCitationMap(toolCalls as Array<{ name: string; result?: unknown }> | undefined),
          thinking: m.thinking,
          pdfRegionMeta: m.pdfRegionMeta,
        };
      }),
    [messages],
  );

  const messageGroups = useMemo(() => {
    const withPdfRegion = pdfRegionStreamingMessage
      ? [
          ...chatMessages,
          {
            ...pdfRegionStreamingMessage,
            citationMap: buildCitationMap(
              pdfRegionStreamingMessage.toolCalls as Array<{ name: string; result?: unknown }> | undefined,
            ),
          },
        ]
      : chatMessages;
    const liveStreamingMessage = streamingMessage
      ? {
          ...streamingMessage,
          citationMap: buildCitationMap(
            streamingMessage.toolCalls as Array<{ name: string; result?: unknown }> | undefined,
          ),
        }
      : null;
    const all = liveStreamingMessage ? [...withPdfRegion, liveStreamingMessage] : withPdfRegion;
    return groupMessagesByRole(all);
  }, [chatMessages, streamingMessage, pdfRegionStreamingMessage]);

  const handleClear = useCallback(() => {
    if (window.confirm(t('chat.clear_confirm'))) {
      clearMessages();
      showToast('info', t('chat.chat_cleared'));
    }
  }, [clearMessages, t]);

  const contextDescription = currentResourceTitle?.trim() ?? '';

  const displayBudget = useMemo(
    () => (lastBudget ? estimateLiveBudget(lastBudget, streamingMessage) : null),
    [lastBudget, streamingMessage],
  );

  const loadingHint = useMemo(() => {
    if (showHitlInline) return t('many.hitl_waiting');
    const calls = coalesceDuplicateToolCalls(streamingMessage?.toolCalls ?? []);
    const running = calls.find((tc) => tc.status === 'running');
    if (running?.name) {
      return streamingLabelForToolName(running.name, t);
    }
    if (isLoading && toolsEnabled && status === 'thinking') {
      return t('chat.executing_tools');
    }
    return undefined;
  }, [showHitlInline, streamingMessage?.toolCalls, isLoading, toolsEnabled, status, t]);

  const showComposerMetaBar = Boolean(
    isFullscreen && chatMessages.length > 0 && displayBudget && !showHitlInline,
  );

  /** Fullscreen: columna de historial a la derecha (mismo UI compacto). Sidebar: overlay. */
  useEffect(() => {
    if (isFullscreen) {
      setShowHistory(true);
    } else {
      setShowHistory(false);
    }
  }, [isFullscreen]);

  const handleToggleHistory = useCallback(() => {
    setShowHistory((v) => !v);
  }, []);

  if (isHeadless) {
    return null;
  }

  return (
    <>
    <UICursorOverlay />
    <div
      className={cn(
        'many-density-scope flex flex-col h-full overflow-hidden shrink-0 border-l',
        isFullscreen && 'many-panel-fullscreen',
      )}
      data-density="compact"
      style={
        isFullscreen
          ? {
              position: 'relative',
              width: '100%',
              minWidth: 0,
              maxWidth: 'none',
              background: 'var(--bg)',
              borderLeftWidth: 0,
              opacity: 1,
              pointerEvents: 'auto',
            }
          : {
              position: 'relative',
              width: isVisible ? `${width}px` : '0px',
              minWidth: isVisible ? 320 : 0,
              maxWidth: isVisible ? 600 : 0,
              background: 'var(--bg)',
              borderColor: 'var(--border)',
              borderLeftWidth: isVisible ? undefined : '0px',
              opacity: isVisible ? 1 : 0,
              pointerEvents: isVisible ? 'auto' : 'none',
              transition: 'width 180ms ease, opacity 140ms ease',
            }
      }
    >
      <ManyChatHeader
        status={status}
        providerInfo={providerInfo}
        providerId={providerId}
        contextDescription={contextDescription}
        messagesCount={messages.length}
        loadingHint={loadingHint}
        sessionTitle={currentSession?.title}
        historyOpen={showHistory}
        onClear={handleClear}
        onStartNewChat={() => { startNewChat(); setShowHistory(false); }}
        onToggleHistory={handleToggleHistory}
        onClose={onClose}
        showClose={!isFullscreen}
        showHistoryToggle
      />

      {showHistory && !isFullscreen ? (
        <ManyChatHistoryPanel
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={(id) => { _switchSession(id); setShowHistory(false); }}
          onNewChat={() => { startNewChat(); setShowHistory(false); }}
          onClose={() => setShowHistory(false)}
        />
      ) : null}

      <div className="many-panel-body">
        <div className="many-panel-main">
      {/* ── WELCOME SCREEN (fullscreen, no messages) ── */}
      {isFullscreen &&
      chatMessages.length === 0 &&
      !streamingMessage &&
      !pdfRegionStreamingMessage &&
      !pendingPdfRegion ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 px-6 py-12">
          <div style={{ marginBottom: 20 }}><ManyAvatar size="lg" state="idle" /></div>
          <h1
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 'clamp(28px, 4vw, 42px)',
              fontWeight: 600,
              color: 'var(--primary-text)',
              textAlign: 'center',
              lineHeight: 1.2,
              marginBottom: 36,
            }}
          >
            {t('chat.welcome_heading')}
          </h1>

          <p className="mx-auto mb-8 max-w-xl px-4 text-center text-[14px] text-[var(--secondary-text)]">
            {t('many.welcome_hints')}
          </p>

          {/* Big centered input */}
          <div className="w-full max-w-2xl mb-6">
            <UnifiedChatInput
              mode="many"
              input={input}
              setInput={setInput}
              inputRef={inputRef}
              isLoading={isLoading}
              toolsEnabled={toolsEnabled}
              resourceToolsEnabled={resourceToolsEnabled}
              memoryEnabled={memoryEnabled}
              setToolsEnabled={setToolsEnabled}
              setResourceToolsEnabled={setResourceToolsEnabled}
              setMemoryEnabled={setMemoryEnabled}
              supportsTools={supportsTools}
              onSend={() => handleSend()}
              onAbort={handleAbort}
              isWelcomeScreen
              inputPlaceholderOverride={
                pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null
              }
              attachments={chatAttachments}
              onAttachmentsChange={setChatAttachments}
            />
          </div>

          {/* Quick prompt pills */}
          <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
            <div className="flex flex-wrap justify-center gap-2">
              {([
                { Icon: Search, labelKey: 'chat.quick_search_library' as const },
                { Icon: FolderOpen, labelKey: 'chat.quick_organize' as const },
                { Icon: ClipboardList, labelKey: 'chat.quick_prepare_meeting' as const },
              ] as const).map(({ Icon, labelKey }) => (
                <button
                  key={labelKey}
                  type="button"
                  onClick={() => { setInput(t(labelKey)); inputRef.current?.focus(); }}
                  className="many-welcome-pill"
                >
                  <Icon size={14} />
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {([
                { Icon: Bot, labelKey: 'chat.quick_ai_strategy' as const },
                { Icon: BarChart2, labelKey: 'chat.quick_create_table' as const },
                { Icon: Calendar, labelKey: 'chat.quick_weekly_report' as const },
                { Icon: Mail, labelKey: 'chat.quick_draft_email' as const },
              ] as const).map(({ Icon, labelKey }) => (
                <button
                  key={labelKey}
                  type="button"
                  onClick={() => { setInput(t(labelKey)); inputRef.current?.focus(); }}
                  className="many-welcome-pill"
                >
                  <Icon size={14} />
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── MESSAGES AREA ── */
        <UnifiedChatMessageArea
          ref={messagesContainerRef}
          className="many-panel-messages py-6 px-4"
          dataSurface="many"
          dataDensity="compact"
        >
          <div className={cn('many-msgs-inner', !isFullscreen && 'many-msgs-inner--sidebar')}>
          {chatMessages.length === 0 && !streamingMessage && !pdfRegionStreamingMessage ? (
            <div className="py-10 text-center">
              <div className="mb-3 flex justify-center">
                <ManyAvatar size="lg" state="idle" />
              </div>
              <p className="text-[15px] font-medium text-[var(--primary-text)]">{t('chat.many_welcome_title')}</p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-[var(--tertiary-text)]">
                {t('chat.many_welcome_subtitle')}
              </p>
              <p className="mx-auto mt-3 max-w-md text-[13px] text-[var(--secondary-text)]">
                {t('many.welcome_hints')}
              </p>
              <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2">
                {[
                  'chat.quick_empty_summarize',
                  'chat.quick_empty_focus',
                  'chat.quick_empty_organize',
                  ...(supportsTools ? (['chat.quick_empty_search_resources', 'chat.quick_empty_query_db'] as const) : []),
                ].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setInput(t(key)); inputRef.current?.focus(); }}
                    className="many-welcome-pill text-[12px]"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messageGroups.map((group, index) => {
                const isLastGroup = index === messageGroups.length - 1;
                const lastMsg = group[group.length - 1];
                const groupState =
                  isLastGroup && lastMsg?.role === 'assistant' && lastMsg?.isStreaming
                    ? 'thinking'
                    : 'idle';
                return (
                  <ChatMessageGroup
                    key={`group-${index}-${group[0]?.id || index}`}
                    className="many-message-group"
                    surfaceVariant="many"
                    messages={group}
                    onRegenerate={handleRegenerate}
                    assistantState={groupState}
                  />
                );
              })}
              {isLoading && !streamingMessage ? (
                <div className="flex gap-2 mt-5 many-message-group">
                  <div className="w-8 shrink-0 flex justify-center">
                    <ManyAvatar size="sm" state="thinking" />
                  </div>
                  <div
                    className="many-thread-rule w-px shrink-0 self-stretch min-h-[2.5rem] bg-[var(--border)] opacity-45"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 items-center py-0.5">
                    <ManyMinimalStatusRow variant="dots" label={t('chat.analyzing')} />
                  </div>
                </div>
              ) : null}
              {showHitlInline ? (
                <div ref={pendingApprovalRef}>
                  <ManyHitlInlineSection
                    pendingApproval={pendingApproval}
                    onDismissLangGraph={() => setPendingApproval(null)}
                  />
                </div>
              ) : null}
              {error ? (
                <div className="many-error-card" role="alert">
                  <AlertCircle className="size-5 shrink-0 text-[var(--error)]" aria-hidden />
                  <div className="many-error-card__body">
                    <div className="many-error-card__title">{t('common.error')}</div>
                    <p className="many-error-card__msg">{error}</p>
                    <div className="many-error-card__actions">
                      <button type="button" className="many-error-card__btn many-error-card__btn--primary" onClick={handleDismissManyError}>
                        {t('chat.try_again')}
                      </button>
                      <button type="button" className="many-error-card__btn many-error-card__btn--ghost" onClick={handleReportManyError}>
                        {t('many.error_report')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
          <div ref={messagesEndRef} />
          </div>
        </UnifiedChatMessageArea>
      )}

      {isVisible && !isHeadless && pendingPdfRegion ? (
        <PdfRegionBanner
          pending={pendingPdfRegion}
          onDismiss={() => clearPendingPdfRegion()}
        />
      ) : null}

      {/* Token budget — sidebar / compact badge; fullscreen + messages uses composer meta bar */}
      {displayBudget && !showHitlInline && !showComposerMetaBar ? (
        <div className="flex justify-end px-3 py-0.5">
          <TokenBudgetBadge breakdown={displayBudget} liveUsage={liveUsage} budgetCapApprox={budgetCapApprox} />
        </div>
      ) : null}

      {/* Hide bottom input when welcome screen is showing centered input */}
      {!(
        isFullscreen &&
        chatMessages.length === 0 &&
        !streamingMessage &&
        !pdfRegionStreamingMessage &&
        !pendingPdfRegion
      ) && (
        isFullscreen ? (
          <div className="many-composer-anchor">
            {showComposerMetaBar ? (
              <div className="many-composer-meta px-4 pt-3 pb-1">
                <div className="many-composer-meta-row">
                  <TokenBudgetBadge
                    breakdown={displayBudget!}
                    liveUsage={liveUsage}
                    variant="pill"
                    budgetCapApprox={budgetCapApprox}
                  />
                </div>
              </div>
            ) : null}
            <div className="px-4 pb-4">
              <UnifiedChatInput
                mode="many"
                input={input}
                setInput={setInput}
                inputRef={inputRef}
                isLoading={isLoading || !!pdfRegionStreamingMessage?.isStreaming}
                toolsEnabled={toolsEnabled}
                resourceToolsEnabled={resourceToolsEnabled}
                memoryEnabled={memoryEnabled}
                setToolsEnabled={setToolsEnabled}
                setResourceToolsEnabled={setResourceToolsEnabled}
                setMemoryEnabled={setMemoryEnabled}
                supportsTools={supportsTools}
                onSend={() => handleSend()}
                onAbort={handleAbort}
                inputPlaceholderOverride={
                  pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null
                }
                attachments={chatAttachments}
                onAttachmentsChange={setChatAttachments}
                showComposerKeyboardHint
              />
            </div>
          </div>
        ) : (
          <UnifiedChatInput
            mode="many"
            input={input}
            setInput={setInput}
            inputRef={inputRef}
            isLoading={isLoading || !!pdfRegionStreamingMessage?.isStreaming}
            toolsEnabled={toolsEnabled}
            resourceToolsEnabled={resourceToolsEnabled}
            memoryEnabled={memoryEnabled}
            setToolsEnabled={setToolsEnabled}
            setResourceToolsEnabled={setResourceToolsEnabled}
            setMemoryEnabled={setMemoryEnabled}
            supportsTools={supportsTools}
            onSend={() => handleSend()}
            onAbort={handleAbort}
            inputPlaceholderOverride={
              pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null
            }
            attachments={chatAttachments}
            onAttachmentsChange={setChatAttachments}
            showComposerKeyboardHint
            compact={!isFullscreen}
          />
        )
      )}
        </div>

        {isFullscreen && showHistory ? (
          <ChatHistoryPanel placement="inline-right" onClose={() => setShowHistory(false)} />
        ) : null}
      </div>
    </div>
    </>
  );
}
