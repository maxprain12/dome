import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompactionNoticeData, ManyMessageData } from '@/lib/many/types';
import type { BudgetBreakdown, LiveTokenUsage } from '@/lib/chat/contextUsage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { useManyStore, type ManyMessage, type ManyStatus } from '@/lib/store/useManyStore';
import { estimateLiveBudget } from '@/lib/chat/estimateLiveBudget';
import { groupMessagesByRole } from '@/lib/chat/groupMessagesByRole';
import { buildCitationMap } from '@/lib/utils/citations';
import {
  getActiveRunBySession,
  resumeRun,
  type PersistentRun,
} from '@/lib/automations/api';
import { useAgentRunStream, type RunPendingApproval } from '@/lib/chat/useAgentRunStream';
import { coalesceDuplicateToolCalls, mergeTerminalToolCalls } from '@/lib/chat/coalesceToolCalls';
import { mergeRunSnapshotIntoStreamingMessage } from '@/lib/chat/runSnapshotMerge';
import { streamingLabelForToolCall, streamingLabelFromRunMetadata } from '@/lib/chat/streamingLabels';
import { useApprovalStore } from '@/lib/store/useApprovalStore';

export interface UseManyRunLifecycleOptions {
  currentSessionId: string | null;
  currentSessionIdRef: MutableRefObject<string | null>;
  refreshSessionFromThreadRef: MutableRefObject<() => Promise<boolean>>;
  scrollToBottomRef: MutableRefObject<(force?: boolean) => void>;
  messages: ManyMessage[];
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  setStatus: (status: ManyStatus) => void;
  addMessage: (message: Omit<ManyMessage, 'id' | 'timestamp'>) => void;
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;
  isSubmittingRef: MutableRefObject<boolean>;
  currentSessionRunPhase: 'thinking' | 'streaming' | undefined;
  /** Client-side budget estimate when no server breakdown is available yet. */
  clientBudgetEstimate: BudgetBreakdown | null;
}

export function useManyRunLifecycle({
  currentSessionId,
  currentSessionIdRef,
  refreshSessionFromThreadRef,
  scrollToBottomRef,
  messages,
  isLoading,
  setIsLoading,
  setStatus,
  addMessage,
  activeRunId,
  setActiveRunId,
  isSubmittingRef,
  currentSessionRunPhase,
  clientBudgetEstimate,
}: UseManyRunLifecycleOptions) {
  const { t } = useTranslation();
  const setSessionRunState = useManyStore((s) => s.setSessionRunState);

  const [streamingMessage, setStreamingMessage] = useState<ManyMessageData | null>(null);
  const [pdfRegionStreamingMessage, setPdfRegionStreamingMessage] = useState<ManyMessageData | null>(null);
  const [pendingApproval, setPendingApproval] = useState<RunPendingApproval | null>(null);
  const approvalQueueLen = useApprovalStore((s) => s.queue.length);
  const showHitlInline = Boolean(pendingApproval || approvalQueueLen > 0);
  const [lastBudget, setLastBudget] = useState<BudgetBreakdown | null>(null);
  const [lastBudgetSessionId, setLastBudgetSessionId] = useState<string | null>(null);
  const [liveUsage, setLiveUsage] = useState<LiveTokenUsage | null>(null);
  const [liveUsageSessionId, setLiveUsageSessionId] = useState<string | null>(null);
  const [compactionNotice, setCompactionNotice] = useState<CompactionNoticeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamingMessageRef = useRef<ManyMessageData | null>(null);
  const hitlDecisionsRef = useRef<Array<unknown> | null>(null);
  const voiceAutoSpeakForRunIdRef = useRef<string | null>(null);
  const activeRunSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    streamingMessageRef.current = streamingMessage;
  }, [streamingMessage]);

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
  }, [activeRunId, currentSessionId, currentSessionRunPhase, isSubmittingRef, setIsLoading, setStatus, t]);

  const applyRunSnapshot = useCallback(
    (run: PersistentRun | null) => {
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
    },
    [currentSessionIdRef, setActiveRunId, setIsLoading, setSessionRunState, setStatus, t],
  );

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
      .catch((loadError) => {
        console.warn('[Many] Could not load active run:', loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [applyRunSnapshot, currentSessionId, currentSessionIdRef, setActiveRunId, setIsLoading, setStatus]);

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
        const scheduleRetry = () => tryRefresh(attemptsLeft - 1);
        void refreshSessionFromThreadRef
          .current()
          .then((hydrated) => {
            if (hydrated) {
              requestAnimationFrame(() => scrollToBottomRef.current(true));
            } else if (attemptsLeft > 0) {
              setTimeout(scheduleRetry, 600);
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
    [addMessage, refreshSessionFromThreadRef, scrollToBottomRef, setActiveRunId, setIsLoading, setSessionRunState, setStatus, t],
  );

  const handleManyPendingApproval = useCallback(
    (
      approval: {
        actionRequests: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
        reviewConfigs: Array<{ actionName: string; allowedDecisions: string[] }>;
        submitResume: (decisions: Array<unknown>) => void;
      } | null,
    ) => {
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

  const chatMessages: ManyMessageData[] = useMemo(
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

  const lastUserGroupIndex = useMemo(() => {
    for (let i = messageGroups.length - 1; i >= 0; i--) {
      if (messageGroups[i][0]?.role === 'user') return i;
    }
    return -1;
  }, [messageGroups]);

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

  return {
    streamingMessage,
    setStreamingMessage,
    pdfRegionStreamingMessage,
    setPdfRegionStreamingMessage,
    pendingApproval,
    setPendingApproval,
    lastBudget,
    lastBudgetSessionId,
    liveUsage,
    liveUsageSessionId,
    compactionNotice,
    setCompactionNotice,
    error,
    setError,
    setLiveUsage,
    applyRunSnapshot,
    handleManyPendingApproval,
    chatMessages,
    messageGroups,
    lastUserGroupIndex,
    displayBudget,
    sessionLiveUsage,
    loadingHint,
    showContextUsage,
    showHitlInline,
    streamingMessageRef,
    hitlDecisionsRef,
    voiceAutoSpeakForRunIdRef,
    activeRunSessionIdRef,
  };
}
