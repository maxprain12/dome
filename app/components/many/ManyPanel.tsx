import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import ContextUsageIndicator, { type BudgetBreakdown, type LiveTokenUsage } from './ContextUsageIndicator';
import CompactionNotice, { type CompactionNoticeData } from './CompactionNotice';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Search, FolderOpen, ClipboardList, Bot, BarChart2, Calendar, Mail, AlertCircle } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import ManyChatHistoryPanel from './ManyChatHistoryPanel';
import ChatHistoryPanel from '@/components/chat/ChatHistoryPanel';
import UnifiedChatInput from '@/components/chat/UnifiedChatInput';
import ManyChatInput from '@/components/many/ManyChatInput';
import { useManyStore, type ManyChatSession, type ManyMessage, type PendingPdfRegion } from '@/lib/store/useManyStore';
import { useManyConversationSettings } from './useManyConversationSettings';
import {
  filterOutDeletedSessions,
  deriveManySessionTitle,
  persistManySessions,
  sanitizeManySessionTitle,
  syncManyDeletedIdsFromDb,
} from '@/lib/store/manySessionStorage';
import {
  fetchManyMessagesFromThread,
  refreshManySessionFromThread,
} from '@/lib/chat/manyThreadBridge';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import {
  getAIConfig,
  checkChatProviderReady,
  createManyToolsForContext,
  toOpenAIToolDefinitions,
  type AnyAgentTool,
} from '@/lib/ai';
import { estimateLiveBudget } from '@/lib/chat/estimateLiveBudget';
import { estimateClientBudgetFromChat } from '@/lib/chat/contextUsage';
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
import ChatMessageGroup from '@/components/chat/ChatMessageGroup';
import { groupMessagesByRole } from '@/lib/chat/groupMessagesByRole';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';
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
  startAgentRun,
  type PersistentRun,
} from '@/lib/automations/api';
import { registerManyMessageSender, type ManySendOptions } from '@/lib/many/manySendController';
import { runPdfRegionStream } from '@/lib/hooks/usePdfRegionStream';
import UICursorOverlay from './UICursorOverlay';
import PdfRegionBanner from '@/components/many/PdfRegionBanner';
import { streamingLabelForActiveRun, streamingLabelForToolCall, streamingLabelFromRunMetadata } from '@/lib/chat/streamingLabels';
import { useAgentRunStream, type RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import { coalesceDuplicateToolCalls, mergeTerminalToolCalls } from '@/lib/chat/coalesceToolCalls';
import { mergeRunSnapshotIntoStreamingMessage } from '@/lib/chat/runSnapshotMerge';
import { useChatAutoScroll } from '@/lib/chat/useChatAutoScroll';
import { manyContextSlotPlacement } from '@/lib/many/contextSlotPlacement';
import ManyHitlInlineSection from '@/components/many/ManyHitlInlineSection';
import { useApprovalStore } from '@/lib/store/useApprovalStore';
import { cn } from '@/lib/utils';
import { UnifiedChatMessageArea } from '@/components/chat/UnifiedChatMessages';
import { buildUserRunMessage, type ChatRunMessage } from '@/lib/chat/attachmentTypes';
import { syncManyActiveRunIndicators } from '@/lib/chat/syncManyActiveRunIndicators';
import { redactBase64FromText } from '@/lib/chat/userMessageVisual';
import { prepareVideoAttachmentsForRun } from '@/lib/chat/processAttachmentFile';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';

interface ManyPanelProps {
  width: number;
  onClose: () => void;
  isVisible: boolean;
  isFullscreen?: boolean;
  /** Standalone Electron popout at /standalone/many */
  isPopout?: boolean;
  /** Motor de mensajes sin UI (voz global con panel lateral cerrado / pestaña Chat). */
  mode?: 'full' | 'headless';
}

export default function ManyPanel({ width, onClose, isVisible, isFullscreen = false, isPopout = false, mode = 'full' }: ManyPanelProps) {
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
    hydrateFromThreads,
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
      hydrateFromThreads: s.hydrateFromThreads,
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
  const activeShellTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const activeShellTabType = activeShellTab?.type;
  const chatProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const pendingManyHandoff = useManyStore((s) => s.pendingManyHandoff);
  const setPendingManyHandoff = useManyStore((s) => s.setPendingManyHandoff);
  const setSessionRunState = useManyStore((s) => s.setSessionRunState);
  const currentSessionRunPhase = useManyStore((s) =>
    currentSessionId ? s.activeRunBySessionId[currentSessionId] : undefined,
  );

  const [input, setInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    toolsEnabled, setToolsEnabled,
    resourceToolsEnabled, setResourceToolsEnabled,
    memoryEnabled, setMemoryEnabled,
    mcpEnabled,
    supportsTools,
    soulContent,
    userMemory,
    providerInfo,
    providerId,
    budgetCapApprox,
  } = useManyConversationSettings();
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [pdfRegionStreamingMessage, setPdfRegionStreamingMessage] = useState<ChatMessageData | null>(null);
  const [pendingApproval, setPendingApproval] = useState<RunPendingApproval | null>(null);
  const approvalQueueLen = useApprovalStore((s) => s.queue.length);
  const showHitlInline = Boolean(pendingApproval || approvalQueueLen > 0);
  const [lastBudget, setLastBudget] = useState<BudgetBreakdown | null>(null);
  const [lastBudgetSessionId, setLastBudgetSessionId] = useState<string | null>(null);
  const [liveUsage, setLiveUsage] = useState<LiveTokenUsage | null>(null);
  const [liveUsageSessionId, setLiveUsageSessionId] = useState<string | null>(null);
  const [compactionNotice, setCompactionNotice] = useState<CompactionNoticeData | null>(null);
  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<ChatMessageData | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingApprovalRef = useRef<HTMLDivElement>(null);
  const hitlDecisionsRef = useRef<Array<unknown> | null>(null);
  const isSubmittingRef = useRef(false);
  const voiceAutoSpeakForRunIdRef = useRef<string | null>(null);
  const activeRunSessionIdRef = useRef<string | null>(null);
  // Ref so the onRunUpdated listener always calls the latest refreshSessionFromThread
  // without re-registering the listener every time currentSession changes.
  const refreshSessionFromThreadRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const scrollToBottomRef = useRef<(force?: boolean) => void>(() => {});
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  useEffect(() => {
    if (activeRunId || isSubmittingRef.current) return;

    if (currentSessionRunPhase) {
      setIsLoading(true);
      setStatus('thinking');
      setStreamingMessage((prev) =>
        prev ?? {
          id: `synced-run-${currentSessionId ?? 'unknown'}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          toolCalls: [],
          streamingLabel:
            currentSessionRunPhase === 'streaming'
              ? t('chat.reconnecting_run')
              : t('chat.thinking_evaluating_tools'),
        },
      );
      return;
    }

    setIsLoading(false);
    setStatus('idle');
    setStreamingMessage((prev) => (prev?.id.startsWith('synced-run-') ? null : prev));
  }, [activeRunId, currentSessionId, currentSessionRunPhase, setStatus, t]);

  const effectiveResourceId =
    currentResourceId ||
    activeShellTab?.resourceId ||
    (pathname?.startsWith('/workspace') ? searchParams.get('id') : null);
  const effectiveResourceTitle = currentResourceTitle || activeShellTab?.title || null;

  useEffect(() => {
    streamingMessageRef.current = streamingMessage;
  }, [streamingMessage]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const prevHandoffRef = useRef<string | null>(null);
  if (
    pendingManyHandoff &&
    pendingManyHandoff !== prevHandoffRef.current &&
    isVisible &&
    !isHeadless
  ) {
    const text = pendingManyHandoff;
    prevHandoffRef.current = text;
    setInput(text);
    setPendingManyHandoff(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = text.length;
      el.setSelectionRange(len, len);
    });
  } else if (!pendingManyHandoff && prevHandoffRef.current !== null) {
    prevHandoffRef.current = null;
  }

  // Hydrate session list from JSONL on startup.
  useEffect(() => {
    let cancelled = false;
    void syncManyDeletedIdsFromDb()
      .then(() => {
        if (cancelled) return;
        const state = useManyStore.getState();
        const purged = filterOutDeletedSessions(state.sessions);
        if (purged.length !== state.sessions.length) {
          persistManySessions(purged);
          const nextCurrent =
            state.currentSessionId && purged.some((s) => s.id === state.currentSessionId)
              ? state.currentSessionId
              : (purged[0]?.id ?? null);
          const nextMessages =
            nextCurrent && nextCurrent === state.currentSessionId
              ? state.messages
              : (purged.find((s) => s.id === nextCurrent)?.messages ?? []);
          useManyStore.setState({
            sessions: purged,
            currentSessionId: nextCurrent,
            messages: nextMessages,
          });
        }
        return hydrateFromThreads().then(() => {
          const ids = useManyStore.getState().sessions.slice(0, 20).map((s) => s.id);
          return syncManyActiveRunIndicators(ids);
        });
      })
      .catch((err) => {
        console.warn('[Many] JSONL session hydration failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateFromThreads]);

  // Re-scope Many history when the active project changes: start a fresh draft
  // for the new project and re-hydrate the list (which filters by project).
  const prevChatProjectIdRef = useRef(chatProjectId);
  useEffect(() => {
    if (prevChatProjectIdRef.current === chatProjectId) return;
    prevChatProjectIdRef.current = chatProjectId;
    startNewChat();
    void hydrateFromThreads();
  }, [chatProjectId, startNewChat, hydrateFromThreads]);

  // Load messages from JSONL when switching chats.
  //
  // A non-empty thread that renders empty was a real bug: the JSONL (source of
  // truth) can lag a tick behind the UI right after a run finishes, or a single
  // `threads:get-state` call can transiently fail/return empty. The old code did
  // ONE fetch and silently bailed on empty, leaving a titled session stuck on the
  // empty state until remount. We now retry a few times with backoff before
  // accepting "genuinely empty", and only hydrate when we actually got messages.
  useEffect(() => {
    if (!currentSessionId || !window.electron?.threads?.getState) return;

    const sessionId = currentSessionId;
    let cancelled = false;
    const RETRY_DELAYS_MS = [0, 250, 600, 1200];

    const loadWithRetry = async () => {
      for (const delay of RETRY_DELAYS_MS) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (cancelled || currentSessionIdRef.current !== sessionId) return;

        let threadMessages: Awaited<ReturnType<typeof fetchManyMessagesFromThread>> = [];
        try {
          threadMessages = await fetchManyMessagesFromThread(sessionId);
        } catch (error) {
          console.warn('[Many] Could not load session from JSONL:', error);
          continue; // transient failure — retry
        }
        if (cancelled || currentSessionIdRef.current !== sessionId) return;
        if (threadMessages.length === 0) {
          // Could be a not-yet-flushed thread or a genuinely empty draft. If the
          // store already holds messages for this session, stop (don't clobber);
          // otherwise keep retrying until the budget runs out.
          if (useManyStore.getState().messages.length > 0) return;
          continue;
        }

        const localMessages = useManyStore.getState().messages;
        if (localMessages.length > threadMessages.length) return;

        const localSession = useManyStore.getState().sessions.find((s) => s.id === sessionId);
        const firstUser = threadMessages.find((m) => m.role === 'user')?.content ?? '';
        hydrateSession({
          id: sessionId,
          title: deriveManySessionTitle({
            storedTitle: localSession?.title,
            messages: threadMessages,
            firstUser,
          }),
          messages: threadMessages,
          createdAt: localSession?.createdAt ?? threadMessages[0]?.timestamp ?? Date.now(),
          updatedAt: threadMessages[threadMessages.length - 1]?.timestamp ?? localSession?.updatedAt,
          pinned: localSession?.pinned,
        } satisfies ManyChatSession);
        return;
      }
    };

    void loadWithRetry();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, hydrateSession]);

  const refreshSessionFromThread = useCallback(async (): Promise<boolean> => {
    if (!currentSessionId || !window.electron?.threads?.getState) {
      return false;
    }
    const localMessages = useManyStore.getState().messages;
    const refreshed = await refreshManySessionFromThread(currentSessionId, localMessages);
    if (!refreshed) return false;

    hydrateSession({
      id: currentSessionId,
      title: refreshed.title || currentSession?.title || t('chat.session_fallback_new'),
      messages: refreshed.messages,
      createdAt: currentSession?.createdAt ?? refreshed.messages[0]?.timestamp ?? Date.now(),
      updatedAt: refreshed.messages[refreshed.messages.length - 1]?.timestamp,
    } satisfies ManyChatSession);
    return true;
  }, [currentSession, currentSessionId, hydrateSession, t]);
  refreshSessionFromThreadRef.current = refreshSessionFromThread;

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
      const sid = run.sessionId || currentSessionIdRef.current;
      if (sid) {
        activeRunSessionIdRef.current = sid;
        setSessionRunState(sid, run.outputText?.trim() ? 'streaming' : 'thinking');
      }
      setIsLoading(true);
      setStatus('thinking');
      setStreamingMessage((prev) =>
        mergeRunSnapshotIntoStreamingMessage(prev, {
          id: prev?.id || `run-${run.id}`,
          content: run.outputText || '',
          timestamp: run.updatedAt || Date.now(),
          isStreaming: run.status !== 'waiting_approval',
          streamingLabel:
            run.status === 'waiting_approval'
              ? t('chat.waiting_approval')
              : (prev?.streamingLabel ||
                  streamingLabelFromRunMetadata(t, run.metadata as Record<string, unknown>, {
                    hasContent: Boolean(run.outputText?.trim()),
                    reconnecting: true,
                  })),
        }),
      );
      return;
    }
    setIsLoading(false);
    setStatus('idle');
    setStreamingMessage(null);
    setPendingApproval(null);
    if (activeRunSessionIdRef.current) {
      setSessionRunState(activeRunSessionIdRef.current, null);
      activeRunSessionIdRef.current = null;
    }
  }, [setStatus, t, setSessionRunState]);

  useEffect(() => {
    setLastBudget(null);
    setLastBudgetSessionId(null);
    setLiveUsage(null);
    setLiveUsageSessionId(null);
    setCompactionNotice(null);
    setStreamingMessage(null);
    setPendingApproval(null);
    setIsLoading(false);
    setStatus('idle');
    setActiveRunId(null);
    setError(null);

    if (!currentSessionId) {
      return;
    }

    let cancelled = false;
    void getActiveRunBySession(currentSessionId)
      .then((run) => {
        if (!cancelled && currentSessionIdRef.current === currentSessionId) {
          applyRunSnapshot(run);
        }
      })
      .catch((error) => {
        console.warn('[Many] Could not load active run:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [applyRunSnapshot, currentSessionId, setStatus]);

  const historySessionIdsKey = useMemo(
    () => sessions.slice(0, 20).map((s) => s.id).join('\0'),
    [sessions],
  );

  useEffect(() => {
    if (!showHistory) return;
    const ids = historySessionIdsKey.split('\0').filter(Boolean);
    if (ids.length === 0) return;
    void syncManyActiveRunIndicators(ids);
  }, [showHistory, historySessionIdsKey]);

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
      const runSid = run.sessionId || activeRunSessionIdRef.current;
      if (runSid) {
        setSessionRunState(runSid, null);
      }
      activeRunSessionIdRef.current = null;

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
        const streamToolCalls = coalesceDuplicateToolCalls(prev?.toolCalls ?? streamSnap?.toolCalls ?? []);
        const toolCalls = mergeTerminalToolCalls(metaToolCallsRaw, streamToolCalls);
        if (prev) {
          if (isFailed && errorMsg && !run.outputText) {
            return { ...prev, isStreaming: false, toolCalls, content: prev.content ? `${prev.content}\n\n${errorMsg}` : errorMsg };
          }
          return { ...prev, isStreaming: false, toolCalls };
        }
        if (!run.outputText && toolCalls.length === 0) {
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
          toolCalls,
        };
      });
      const finalToolCalls = mergeTerminalToolCalls(
        Array.isArray(run.metadata?.toolCalls) ? (run.metadata.toolCalls as ToolCallData[]) : [],
        coalesceDuplicateToolCalls(streamSnap?.toolCalls ?? []),
      );
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
        void refreshSessionFromThreadRef
          .current()
          .then((hydrated) => {
            if (hydrated) {
              requestAnimationFrame(() => scrollToBottomRef.current(true));
            } else if (attemptsLeft > 0) {
              setTimeout(() => tryRefresh(attemptsLeft - 1), 600);
            }
          })
          .catch((err) => {
            console.warn('[Many] refreshSessionFromThread failed after run terminal:', err);
          });
      };
      tryRefresh(2);
      requestAnimationFrame(() => scrollToBottomRef.current(true));
      if (run.status === 'completed') {
        window.dispatchEvent(new Event('dome:resources-changed'));
      }
    },
    [addMessage, setStatus, t, setSessionRunState],
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

  useAgentRunStream({
    activeRunId,
    setStreamingMessage,
    setPendingApproval: handleManyPendingApproval,
    onRunStatus: handleManyRunStatus,
    onRunTerminal: handleManyRunTerminal,
    onBudget: (breakdown) => {
      const sid = currentSessionIdRef.current;
      if (!sid) return;
      setLastBudgetSessionId(sid);
      setLastBudget(breakdown);
    },
    onUsage: (usage) => {
      const sid = currentSessionIdRef.current;
      if (!sid) return;
      setLiveUsageSessionId(sid);
      setLiveUsage(usage);
    },
    onCompaction: (event) => {
      const sid = currentSessionIdRef.current;
      if (!sid) return;
      setCompactionNotice({ ...event, at: Date.now() });
      setLastBudgetSessionId(sid);
      setLastBudget((prev) => {
        if (!prev) return prev;
        const nextTotal =
          event.tokensAfter != null && event.tokensAfter > 0
            ? event.tokensAfter
            : Math.max(prev.systemApprox + prev.toolsApprox, Math.round(event.tokensBefore * 0.35));
        const summarizedDelta = Math.max(
          prev.summarizedApprox ?? 0,
          Math.round(event.tokensBefore * 0.55),
        );
        const conversationApprox = Math.max(0, (prev.conversationApprox ?? prev.historyApprox) - summarizedDelta);
        return {
          ...prev,
          totalApprox: nextTotal,
          historyApprox: summarizedDelta + conversationApprox,
          summarizedApprox: summarizedDelta,
          conversationApprox,
        };
      });
    },
    onStreamingActivity: () => {
      const sid = activeRunSessionIdRef.current;
      if (sid) setSessionRunState(sid, 'streaming');
    },
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

  const { scrollToBottom, resetScrollLock } = useChatAutoScroll(
    messagesContainerRef,
    messagesEndRef,
    [messages, streamingMessage, pdfRegionStreamingMessage],
    { isStreaming: Boolean(streamingMessage?.isStreaming || isLoading) },
  );
  scrollToBottomRef.current = scrollToBottom;

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
    const userMessage = redactBase64FromText(userRunMessage.content);
    const hasAttachments =
      (userRunMessage.attachments?.images?.length ?? 0) > 0 ||
      (userRunMessage.attachments?.videos?.length ?? 0) > 0;
    if (!userMessage && !hasAttachments) return;

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

    addMessage({ role: 'user', content: userMessage, attachments: userRunMessage.attachments });
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
        pinnedResourceIds: pinnedResources.length > 0 ? pinnedResources.map((r) => r.id) : undefined,
        userMemory: userMemory || undefined,
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
    abortControllerRef.current?.abort();
  }, [activeRunId]);

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
          attachments: m.attachments,
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

  const contextDescription = effectiveResourceTitle?.trim() ?? '';

  const clientBudgetEstimate = useMemo(() => {
    if (messages.length === 0 && !isLoading) return null;
    return estimateClientBudgetFromChat({
      messages,
      toolCount: activeTools.length,
      userMemoryChars: userMemory.length,
      mcpToolCount: toolsEnabled && mcpEnabled ? 8 : 0,
    });
  }, [messages, isLoading, activeTools.length, userMemory.length, toolsEnabled, mcpEnabled]);

  const sessionLiveUsage =
    liveUsage && liveUsageSessionId === currentSessionId && isLoading ? liveUsage : null;

  const displayBudget = useMemo(() => {
    const serverBudget =
      lastBudget && lastBudgetSessionId === currentSessionId ? lastBudget : null;
    const base = serverBudget ?? clientBudgetEstimate;
    if (!base) return null;
    return estimateLiveBudget(base, streamingMessage);
  }, [
    lastBudget,
    lastBudgetSessionId,
    currentSessionId,
    clientBudgetEstimate,
    streamingMessage,
  ]);

  const loadingHint = useMemo(() => {
    if (showHitlInline || pendingApproval) return t('chat.waiting_approval');
    const calls = coalesceDuplicateToolCalls(streamingMessage?.toolCalls ?? []);
    const running = calls.find((tc) => tc.status === 'running');
    if (running?.name) {
      return streamingLabelForToolCall(running, t);
    }
    if (streamingMessage?.content?.trim()) {
      return t('chat.generating_response');
    }
    if (isLoading && streamingMessage?.thinking) {
      return t('chat.thinking');
    }
    if (isLoading) {
      return t('chat.thinking_evaluating_tools');
    }
    return undefined;
  }, [showHitlInline, pendingApproval, streamingMessage, isLoading, t]);

  const showContextUsage = Boolean(
    displayBudget &&
      !showHitlInline &&
      (messages.length > 0 || isLoading || lastBudgetSessionId === currentSessionId),
  );

  // Indicator lives in the header when docked, in the composer when fullscreen —
  // never both (was duplicated in sidebar). See contextSlotPlacement.
  const contextSlot = manyContextSlotPlacement({ isFullscreen, showContextUsage });

  const composerContextUsageSlot = contextSlot.composer ? (
    <ManyChatInput.ContextUsage>
      <ContextUsageIndicator
        key={currentSessionId ?? 'none'}
        breakdown={displayBudget!}
        liveUsage={sessionLiveUsage}
        budgetCapApprox={budgetCapApprox}
        variant="header"
      />
    </ManyChatInput.ContextUsage>
  ) : null;

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === currentSessionId) {
        setShowHistory(false);
        return;
      }
      startTransition(() => {
        _switchSession(id);
      });
      setShowHistory(false);
    },
    [_switchSession, currentSessionId],
  );

  const prevIsFullscreenRef = useRef(isFullscreen);
  if (isFullscreen !== prevIsFullscreenRef.current) {
    prevIsFullscreenRef.current = isFullscreen;
    setShowHistory(isFullscreen);
  }

  const handleToggleHistory = useCallback(() => {
    setShowHistory((v) => !v);
  }, []);

  const openChatTab = useTabStore((s) => s.openChatTab);

  const handleToggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      const { tabs, activeTabId, closeTab } = useTabStore.getState();
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      if (activeTab?.type === 'chat') {
        closeTab(activeTab.id);
      }
      window.dispatchEvent(new CustomEvent('dome:many-sidebar-open'));
      return;
    }
    const sid = currentSessionId ?? useManyStore.getState().currentSessionId;
    if (!sid) {
      startNewChat();
    }
    const sessionId = useManyStore.getState().currentSessionId;
    if (!sessionId) return;
    const session = useManyStore.getState().sessions.find((s) => s.id === sessionId);
    const title = session?.title
      ? sanitizeManySessionTitle(session.title)
      : t('shell.new_chat');
    openChatTab(sessionId, title);
  }, [isFullscreen, currentSessionId, startNewChat, openChatTab, t]);

  const handlePopout = useCallback(async () => {
    if (!window.electron?.invoke) return;
    const sessionId = currentSessionId ?? useManyStore.getState().currentSessionId;
    const session = sessionId
      ? useManyStore.getState().sessions.find((s) => s.id === sessionId)
      : null;
    const title = session?.title
      ? sanitizeManySessionTitle(session.title)
      : t('many.many');
    let backgroundColor: string | undefined;
    if (typeof document !== 'undefined') {
      backgroundColor =
        getComputedStyle(document.documentElement).getPropertyValue('--dome-bg').trim() || undefined;
    }
    const route = sessionId
      ? `/standalone/many?session=${encodeURIComponent(sessionId)}`
      : '/standalone/many';
    try {
      await window.electron.invoke('window:create', {
        id: 'many-popout',
        route,
        options: {
          width: 520,
          height: 780,
          minWidth: 380,
          minHeight: 520,
          title: `${title} — Many`,
          transparent: false,
          vibrancy: null,
          ...(backgroundColor ? { backgroundColor } : {}),
        },
      });
    } catch (err) {
      console.error('[ManyPanel] Failed to open popout:', err);
    }
  }, [currentSessionId, t]);

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
        isPopout && 'many-panel--popout',
      )}
      data-density="compact"
      style={
        isFullscreen
          ? {
              position: 'relative',
              width: '100%',
              minWidth: 0,
              maxWidth: 'none',
              ...(isPopout ? {} : { background: 'var(--bg)' }),
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
        sessionTitle={
          currentSession?.title
            ? sanitizeManySessionTitle(currentSession.title)
            : undefined
        }
        historyOpen={showHistory}
        onClear={handleClear}
        onStartNewChat={() => { startNewChat(); setShowHistory(false); }}
        onToggleHistory={handleToggleHistory}
        onClose={onClose}
        showClose={!isFullscreen || isPopout}
        showHistoryToggle
        isPopout={isPopout}
        showFullscreenToggle={!isPopout}
        isFullscreenActive={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        showPopoutToggle={!isPopout}
        onPopout={() => void handlePopout()}
      >
        {contextSlot.header ? (
          <ManyChatHeader.ContextUsage>
            <ContextUsageIndicator
              key={currentSessionId ?? 'none'}
              breakdown={displayBudget!}
              liveUsage={sessionLiveUsage}
              budgetCapApprox={budgetCapApprox}
              variant="header"
            />
          </ManyChatHeader.ContextUsage>
        ) : null}
      </ManyChatHeader>

      {showHistory && !isFullscreen ? (
        <ManyChatHistoryPanel
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={() => { startNewChat(); setShowHistory(false); }}
          onDeleteSession={_deleteSession}
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
        <div
          className={cn(
            'many-popout-welcome flex flex-1 min-h-0 flex-col items-center justify-center px-6 py-10',
            isPopout && 'many-popout-welcome--window',
          )}
        >
          <div className="mb-5">
            <ManyAvatar size="lg" state="idle" />
          </div>
          <h1 className="many-welcome-title">{t('chat.welcome_heading')}</h1>

          <p className="many-welcome-subtitle mx-auto mb-8 max-w-xl px-4 text-center">
            {t('many.welcome_hints')}
          </p>

          {/* Big centered input */}
          <div className="many-welcome-composer w-full max-w-2xl mb-6">
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
          className={cn('many-panel-messages py-6 px-4', isPopout && 'many-popout-messages')}
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
                    key={stableMessageGroupKey(group)}
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
                    onDismissApproval={() => setPendingApproval(null)}
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

      {compactionNotice && !showHitlInline ? (
        <CompactionNotice event={compactionNotice} onDismiss={() => setCompactionNotice(null)} />
      ) : null}

      {isLoading && loadingHint && !showHitlInline ? (
        <div
          className="mx-4 mb-1 flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'var(--bg-secondary)' }}
          aria-live="polite"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
          <span className="truncate">{loadingHint}</span>
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
            <div className={cn('px-4 pb-4', isPopout && 'many-popout-composer-inner')}>
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
              >
                {composerContextUsageSlot}
              </UnifiedChatInput>
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
          >
            {composerContextUsageSlot}
          </UnifiedChatInput>
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
