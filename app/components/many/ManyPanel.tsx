import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, FolderOpen, ClipboardList, Bot, BarChart2, Calendar, Mail } from 'lucide-react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import UnifiedChatInput from '@/components/chat/UnifiedChatInput';
import { useManyStore, type ManyChatSession, type ManyMessage, type PendingPdfRegion } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { HOME_TAB_ID, useTabStore } from '@/lib/store/useTabStore';
import {
  getAIConfig,
  createManyToolsForContext,
  createLoadSkillTools,
  providerSupportsTools,
  toOpenAIToolDefinitions,
  type AIProviderType,
  type AnyAgentTool,
} from '@/lib/ai';
import {
  buildSharedResourceHint,
  buildSharedUiContextBlock,
  getUiLocationDescription,
} from '@/lib/ai/shared-capabilities';
import { createRememberFactTool } from '@/lib/ai/tools/memory';
import { buildManyFloatingPrompt, getPartOfDay } from '@/lib/prompts/loader';
import { buildDomeSystemPrompt } from '@/lib/chat/buildDomeSystemPrompt';
import { showToast } from '@/lib/store/useToastStore';
import ManyAvatar from './ManyAvatar';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import ReadingIndicator from '@/components/chat/ReadingIndicator';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildCitationMap } from '@/lib/utils/citations';
import { db } from '@/lib/db/client';
import { listSkills, filterToolsBySkill } from '@/lib/skills/client';
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
import { useUICursorStore, resolveSelector } from '@/lib/store/useUICursorStore';
import PdfRegionBanner from '@/components/many/PdfRegionBanner';
import { streamingLabelForToolName } from '@/lib/chat/streamingLabels';
import { useLangGraphRunStream } from '@/lib/chat/useLangGraphRunStream';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { UnifiedChatMessageArea } from '@/components/chat/UnifiedChatMessages';
import { buildAttachmentPrefix } from '@/lib/chat/attachmentTypes';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';

/** Singleton shell tabs whose row buttons only render after opening that shell destination. */
const SHELL_TAB_POINT_OPENERS: Record<string, () => void> = {
  home: () => useTabStore.getState().activateTab(HOME_TAB_ID),
  settings: () => useTabStore.getState().openSettingsTab(),
  calendar: () => useTabStore.getState().openCalendarTab(),
  agents: () => useTabStore.getState().openAgentsTab(),
  learn: () => useTabStore.getState().openLearnTab(),
  flashcards: () => useTabStore.getState().openFlashcardsTab(),
  marketplace: () => useTabStore.getState().openMarketplaceTab(),
  tags: () => useTabStore.getState().openTagsTab(),
  workflows: () => useTabStore.getState().openWorkflowsTab(),
  automations: () => useTabStore.getState().openAutomationsTab(),
  runs: () => useTabStore.getState().openRunsTab(),
  projects: () => useTabStore.getState().openProjectsTab(),
  studio: () => useTabStore.getState().openStudioTab(),
  transcriptions: () => useTabStore.getState().openTranscriptionsTab(),
};

/** Minimal path check for skill `paths:` (avoids bundling micromatch in the renderer). */
function skillPathPatternsMatch(patterns: string[], ctxPath: string, pathnameOnly: string): boolean {
  for (const raw of patterns) {
    const p = String(raw || '').trim();
    if (!p) continue;
    const norm = p.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^\//, '');
    if (!norm) continue;
    if (ctxPath.includes(norm) || pathnameOnly.includes(norm)) return true;
  }
  return false;
}

type ResourceContextPayload = {
  content?: string | null;
  summary?: string | null;
  transcription?: string | null;
  metadata?: Record<string, unknown> | null;
};

function getPreferredResourceContextContent(resource: ResourceContextPayload): string {
  const scrapedContent = typeof resource.metadata?.scraped_content === 'string'
    ? resource.metadata.scraped_content
    : '';
  const metadataSummary = typeof resource.metadata?.summary === 'string'
    ? resource.metadata.summary
    : '';

  return (
    [resource.content, scrapedContent, resource.summary, resource.transcription, metadataSummary]
      .find((value) => typeof value === 'string' && value.trim().length > 0)
      ?.trim() || ''
  );
}

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
    whatsappConnected,
    pinnedResources,
  } = useManyStore();
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
  const [isLoading, setIsLoading] = useState(false);
  const [userMemory, setUserMemory] = useState<string>('');
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true);
  const [mcpEnabled, setMcpEnabledState] = useState(true);
  const [supportsTools, setSupportsTools] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [pdfRegionStreamingMessage, setPdfRegionStreamingMessage] = useState<ChatMessageData | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    actionRequests: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
    reviewConfigs: Array<{ actionName: string; allowedDecisions: string[] }>;
    submitResume: (decisions: Array<{ type: 'approve' } | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } } | { type: 'reject'; message?: string }>) => void;
  } | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [providerInfo, setProviderInfo] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingApprovalRef = useRef<HTMLDivElement>(null);
  const hitlDecisionsRef = useRef<Array<{ type: 'approve' } | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } } | { type: 'reject'; message?: string }> | null>(null);
  const isSubmittingRef = useRef(false);
  const voiceAutoSpeakForRunIdRef = useRef<string | null>(null);
  /** Dedupe identical ui_point_to bursts (double IPC / dev double-invoke) to reduce overlay flicker. */
  const lastUiPointRef = useRef<{ target: string; at: number } | null>(null);
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
    const loadProviderInfo = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        const model =
          config.provider === 'ollama'
            ? (config.ollamaModel || 'default')
            : (config.model || 'default');
        const displayInfo = model.startsWith(`${config.provider}/`) ? config.provider : `${config.provider} / ${model}`;
        setProviderInfo(displayInfo);
        setSupportsTools(providerSupportsTools(config.provider as AIProviderType));
      } else {
        setProviderInfo(t('chat.not_configured'));
        setSupportsTools(false);
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

      // Only hydrate if DB has strictly more messages than localStorage,
      // OR if count matches but last message IDs differ (different persistence sources).
      // Never replace localStorage with fewer DB messages (avoid losing messages).
      const localCount = currentSession?.messages?.length ?? 0;
      const shouldHydrate = persistedMessages.length > localCount;

      if (!shouldHydrate) {
        return;
      }

      hydrateSession({
        id: currentSessionId,
        title: result.data.title || currentSession?.title || t('chat.session_fallback_new'),
        messages: persistedMessages,
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
    hydrateSession({
      id: currentSessionId,
      title: result.data.title || currentSession?.title || t('chat.session_fallback_new'),
      messages: dbMessages,
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
      if (pending?.actionRequests && pending.reviewConfigs) {
        setPendingApproval({
          actionRequests: pending.actionRequests,
          reviewConfigs: pending.reviewConfigs,
          submitResume: (decisions) => {
            hitlDecisionsRef.current = decisions;
            void resumeRun(run.id, decisions as Array<unknown>);
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
      setActiveRunId(null);
      setIsLoading(false);
      setStatus('idle');
      setPendingApproval(null);
      setStreamingMessage((prev) => {
        const metaToolCallsRaw = Array.isArray(run.metadata?.toolCalls)
          ? (run.metadata.toolCalls as ToolCallData[])
          : [];
        const metaToolCalls = coalesceDuplicateToolCalls(metaToolCallsRaw);
        if (prev) {
          const toolCalls = metaToolCalls.length > 0 ? metaToolCalls : coalesceDuplicateToolCalls(prev.toolCalls ?? []);
          return { ...prev, isStreaming: false, toolCalls };
        }
        if (!run.outputText && metaToolCalls.length === 0) return null;
        return {
          id: `run-${run.id}`,
          role: 'assistant',
          content: run.outputText || '',
          timestamp: run.updatedAt || Date.now(),
          isStreaming: false,
          toolCalls: metaToolCalls,
        };
      });
      const finalContent = run.outputText || '';
      const finalToolCalls: ToolCallData[] = coalesceDuplicateToolCalls(
        Array.isArray(run.metadata?.toolCalls) ? (run.metadata.toolCalls as ToolCallData[]) : [],
      );
      const tryRefresh = (attemptsLeft: number) => {
        void refreshSessionFromDbRef
          .current()
          .then((hydrated) => {
            if (hydrated) {
              setStreamingMessage(null);
            } else if (attemptsLeft > 0) {
              setTimeout(() => tryRefresh(attemptsLeft - 1), 600);
            } else {
              if (finalContent || finalToolCalls.length > 0) {
                addMessage({ role: 'assistant', content: finalContent, toolCalls: finalToolCalls });
              }
              setStreamingMessage(null);
            }
          })
          .catch((err) => {
            console.warn('[Many] refreshSessionFromDb failed, persisting to localStorage:', err);
            if (finalContent || finalToolCalls.length > 0) {
              addMessage({ role: 'assistant', content: finalContent, toolCalls: finalToolCalls });
            }
            setStreamingMessage(null);
          });
      };
      tryRefresh(2);
      if (run.status === 'completed') {
        window.dispatchEvent(new Event('dome:resources-changed'));
      }
    },
    [addMessage, setStatus],
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
        submitResume: (decisions) => {
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
    t,
  });

  const setMcpEnabled = useCallback(async (value: boolean) => {
    setMcpEnabledState(value);
    if (db.isAvailable()) {
      await db.setMcpGlobalEnabled(value);
    }
  }, []);

  const activeTools = useMemo(() => {
    const tools: AnyAgentTool[] = createManyToolsForContext(pathname || '/', {
      includeWeb: toolsEnabled,
      includeResources: resourceToolsEnabled,
    });
    tools.push(createRememberFactTool());
    tools.push(...createLoadSkillTools());
    return tools;
  }, [toolsEnabled, resourceToolsEnabled, pathname]);

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
    if (pendingApproval && pendingApprovalRef.current) {
      pendingApprovalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [pendingApproval]);

  useEffect(() => {
    if (isHeadless) return;
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeoutId);
  }, [isHeadless]);

  const hadPendingApprovalRef = useRef(false);
  useEffect(() => {
    const has = Boolean(pendingApproval);
    if (has) {
      window.dispatchEvent(new CustomEvent('dome:many-requires-panel', { detail: { reason: 'hitl' } }));
    } else if (hadPendingApprovalRef.current) {
      window.dispatchEvent(new CustomEvent('dome:many-hitl-cleared'));
    }
    hadPendingApprovalRef.current = has;
  }, [pendingApproval]);

  const buildStaticPersona = useCallback(() => {
    if (petPromptOverride) {
      return petPromptOverride;
    }
    return buildManyFloatingPrompt({ whatsappConnected });
  }, [petPromptOverride, whatsappConnected]);

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
    const attPrefix = buildAttachmentPrefix(chatAttachments, t('chat.attachment_extraction_empty'));
    const textPart = (messageOverride ?? input).trim();
    const userMessage = [attPrefix, textPart].filter((s) => s.length > 0).join('\n\n').trim();
    if (!userMessage || isSubmittingRef.current) return;

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

      const needsApiKey = ['openai', 'anthropic', 'google'].includes(config.provider);
      const hasApiKey = !!config.apiKey;
      if (needsApiKey && !hasApiKey && !['synthetic', 'venice'].includes(config.provider)) {
        setError(t('chat.api_key_error_inline'));
        addMessage({
          role: 'assistant',
          content: t('chat.no_api_key'),
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

      const volatileParts: string[] = [];
      volatileParts.push(
        `## Current Context\n- Location: ${uiLoc.location}\n- The user is ${uiLoc.description}\n- Date: ${dateStr}\n- Time of day: ${partOfDay}` +
          (currentResourceTitle ? `\n- Active resource: "${currentResourceTitle}"` : ''),
      );
      volatileParts.push(
        buildSharedUiContextBlock({
          pathname: pathname || '/',
          homeSidebarSection,
          shellTabType: activeShellTabType,
          currentFolderId,
          currentResourceId: effectiveResourceId,
          currentResourceTitle: currentResourceTitle || null,
        }),
      );
      if (userMemory) {
        volatileParts.push(`## What I know about you\n${userMemory}`);
      }

      if (pinnedResources.length > 0 && typeof window.electron?.ai?.tools?.resourceGet === 'function') {
        const pinnedIds = pinnedResources.map((r) => r.id);
        let pinnedBlock =
          '## Pinned Context Resources\nThe following resources have been added to context by the user. Use their content directly — do NOT call resource_get or resource_search for these IDs unless you need pages not shown here.\n';
        for (const resource of pinnedResources) {
          try {
            const result = await window.electron.ai.tools.resourceGet(resource.id, {
              includeContent: true,
              maxContentLength: 5000,
            });
            if (result?.success && result?.resource) {
              const r = result.resource;
              const content = getPreferredResourceContextContent(r);
              pinnedBlock += `\n### [${resource.title}] (id: ${resource.id}, type: ${resource.type})\n`;
              if (content?.trim()) {
                pinnedBlock += content.slice(0, 5000);
                if (content.length > 5000) pinnedBlock += '\n[Content truncated]';
              } else {
                pinnedBlock += '(No content available)';
              }
            }
          } catch {
            pinnedBlock += `\n### [${resource.title}] (id: ${resource.id})\n(Could not load content)`;
          }
        }
        pinnedBlock += `\n\n> Already loaded resource IDs (skip fetching): ${pinnedIds.join(', ')}`;
        volatileParts.push(pinnedBlock);
      }

      if (effectiveResourceId && typeof window.electron?.ai?.tools?.resourceGet === 'function') {
        try {
          const result = await window.electron.ai.tools.resourceGet(effectiveResourceId, {
            includeContent: true,
            maxContentLength: 12000,
          });
          if (result?.success && result?.resource) {
            const r = result.resource;
            const content = getPreferredResourceContextContent(r);
            if (content?.trim()) {
              let block = `## Current Resource Content\nThe user is viewing "${r.title || currentResourceTitle}". Use this as the primary context for answering the user directly.\n\n${content.slice(0, 12000)}`;
              if (content.length > 12000) block += '\n\n[Content truncated for length]';
              volatileParts.push(block);
            }
          }
        } catch (e) {
          console.warn('[Many] Could not fetch resource content:', e);
        }
      }

      // User-configured skills: one-shot or sticky session skill, else all enabled (legacy)
      const manySnap = useManyStore.getState();
      const sessionIdForSkill = manySnap.currentSessionId;
      const oneShotSkillId = manySnap.pendingOneShotSkillId;
      const stickySkillId = sessionIdForSkill ? manySnap.activeSkillIdBySession[sessionIdForSkill] ?? null : null;
      const primarySkillId = oneShotSkillId || stickySkillId;
      manySnap.setPendingOneShotSkill(null);

      let skillsCatalogMarkdown: string | null = null;
      const activeSkillRecords: Array<{ allowed_tools: string[] }> = [];
      try {
        const listRes = await listSkills({ includeBody: true });
        if (listRes.success && Array.isArray(listRes.data) && listRes.data.length > 0) {
          const all = listRes.data;
          const ctxPath = `${pathname || '/'}#${effectiveResourceId || ''}`;
          if (primarySkillId) {
            const s = all.find((x) => x.id === primarySkillId);
            const body = s?.body?.trim() || '';
            if (s && body) {
              const name = s.name || 'unnamed';
              const desc = s.description || '';
              const skillsBlock = `## Active Skill\n### ${name}\n${desc ? `${desc}\n\n` : ''}${body}\n`;
              volatileParts.push(skillsBlock);
              activeSkillRecords.push({ allowed_tools: s.allowed_tools || [] });
            }
          } else {
            const pathBlocks: string[] = [];
            for (const s of all) {
              if (s.disable_model_invocation) continue;
              if (!s.paths?.length) continue;
              const match = skillPathPatternsMatch(s.paths, ctxPath, pathname || '/');
              if (match) {
                const b = s.body?.trim() || '';
                if (b) {
                  pathBlocks.push(`### ${s.name || s.id}\n${b}\n`);
                  activeSkillRecords.push({ allowed_tools: s.allowed_tools || [] });
                }
              }
            }
            if (pathBlocks.length > 0) {
              volatileParts.push(`## Context skills (path match)\n${pathBlocks.join('\n')}\n`);
            }
            const CATALOG = 1536;
            const lines: string[] = [];
            for (const s of all) {
              if (s.disable_model_invocation) continue;
              if (!s.body?.trim()) continue;
              const slug = String(s.slug || s.id || '').trim();
              const desc = String(s.description || s.name || '').trim();
              if (!desc || desc === slug || desc === s.id) {
                console.warn('[Many] Skipping skill catalog entry (orphan metadata):', s.id);
                continue;
              }
              const w = s.when_to_use ? ` — ${s.when_to_use}` : '';
              const line = `- /${slug}: ${desc.slice(0, 400)}${w}`.trim();
              if (line.length > CATALOG) {
                lines.push(`${line.slice(0, CATALOG - 1)}…`);
              } else {
                lines.push(line);
              }
            }
            if (lines.length > 0) {
              skillsCatalogMarkdown = `## Available Skills (use load_skill tool with field **name** = slash name, e.g. \`research-assistant\`)\n${lines.join(
                '\n',
              )}\n`;
            }
          }
        }
      } catch (e) {
        console.warn('[Many] Could not load skills:', e);
      }

      const volatileContext = volatileParts.join('\n\n');

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
      const toolDefinitions = filterToolsBySkill(activeSkillRecords, rawToolDefinitions);
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

      const unifiedSystemPrompt = buildDomeSystemPrompt({
        staticPersona,
        volatileContext,
        skillsCatalogMarkdown,
        extraSections: [toolHint],
        voiceLanguage: sendOptions?.autoSpeak ? voiceLanguage : null,
      });

      const runMessages = [
        { role: 'system', content: unifiedSystemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
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

  // TTS → store sync lives in ManyVoiceBridge (AppShell) so status updates work when
  // this panel is hidden or replaced by ChatHistoryPanel.

  // Handle UI action events dispatched from main process (LangGraph ui_* tools)
  useEffect(() => {
    if (!window.electron?.on) return;
    const TAB_ACTIONS: Record<string, () => void> = {
      home: () => useTabStore.getState().activateTab(HOME_TAB_ID),
      settings: () => useTabStore.getState().openSettingsTab(),
      calendar: () => useTabStore.getState().openCalendarTab(),
      agents: () => useTabStore.getState().openAgentsTab(),
      learn: () => useTabStore.getState().openLearnTab(),
      flashcards: () => useTabStore.getState().openFlashcardsTab(),
      marketplace: () => useTabStore.getState().openMarketplaceTab(),
      tags: () => useTabStore.getState().openTagsTab(),
      workflows: () => useTabStore.getState().openWorkflowsTab(),
      automations: () => useTabStore.getState().openAutomationsTab(),
      runs: () => useTabStore.getState().openRunsTab(),
    };

    const remove = window.electron.on('dome:ui-action', (payload: { type: string; args: Record<string, unknown> }) => {
      const { type, args } = payload;
      const cursor = useUICursorStore.getState();

      switch (type) {
        case 'point_to': {
          const target = String(args.target ?? '');
          const tooltip = args.tooltip ? String(args.tooltip) : undefined;
          const now = Date.now();
          const prevPt = lastUiPointRef.current;
          if (prevPt?.target === target && now - prevPt.at < 260) {
            break;
          }

          const applyPoint = () => {
            const sel = resolveSelector(target);
            const btn = document.querySelector(sel) as HTMLElement | null;
            btn?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
            lastUiPointRef.current = { target, at: Date.now() };
            cursor.show(target, tooltip);
          };

          const shellMatch = /^tab-([a-z0-9-]+)$/i.exec(target.trim());
          if (shellMatch) {
            const st = shellMatch[1].toLowerCase();
            const sel = resolveSelector(target);
            const opener = SHELL_TAB_POINT_OPENERS[st];
            if (opener && !document.querySelector(sel)) {
              opener();
              requestAnimationFrame(() => {
                window.setTimeout(applyPoint, 140);
              });
              break;
            }
          }

          applyPoint();
          break;
        }
        case 'hide_cursor':
          cursor.hide();
          break;
        case 'navigate': {
          const dest = String(args.destination ?? '').toLowerCase();
          const action = TAB_ACTIONS[dest];
          if (action) {
            action();
            setTimeout(() => {
              cursor.show(`tab-${dest}`, `→ ${dest}`);
              setTimeout(() => cursor.hide(), 1200);
            }, 200);
          }
          break;
        }
        case 'click': {
          const target = String(args.target ?? '');
          const selector = resolveSelector(target);

          /** Same singleton-tab rule as point_to: tab button missing until opener runs → show+click must wait. */
          const runClickSequence = () => {
            cursor.show(target, 'Clicking...');
            window.setTimeout(() => {
              const el = document.querySelector(selector) as HTMLElement | null;
              el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
              el?.click();
              window.setTimeout(() => cursor.hide(), 200);
            }, 400);
          };

          const shellMatch = /^tab-([a-z0-9-]+)$/i.exec(target.trim());
          if (shellMatch) {
            const st = shellMatch[1].toLowerCase();
            const opener = SHELL_TAB_POINT_OPENERS[st];
            if (opener && !document.querySelector(selector)) {
              opener();
              requestAnimationFrame(() => {
                window.setTimeout(runClickSequence, 140);
              });
              break;
            }
          }

          runClickSequence();
          break;
        }
        case 'type': {
          const target = String(args.target ?? '');
          const text = String(args.text ?? '');
          const selector = resolveSelector(target);
          cursor.show(target, 'Typing...');
          setTimeout(() => {
            const el = document.querySelector(selector) as HTMLInputElement | null;
            if (el) {
              el.focus();
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (setter) {
                setter.call(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            cursor.hide();
          }, 300);
          break;
        }
        case 'scroll': {
          const dir = String(args.direction ?? 'down');
          const amount = Number(args.amount ?? 300);
          const dx = dir === 'right' ? amount : dir === 'left' ? -amount : 0;
          const dy = dir === 'down' ? amount : dir === 'up' ? -amount : 0;
          window.scrollBy({ top: dy, left: dx, behavior: 'smooth' });
          break;
        }
        default:
          break;
      }
    });
    return remove;
  }, []);

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

  const context = getUiLocationDescription(pathname || '/', homeSidebarSection, activeShellTabType);

  const loadingHint = useMemo(() => {
    if (pendingApproval) return t('chat.waiting_approval_hint');
    const calls = coalesceDuplicateToolCalls(streamingMessage?.toolCalls ?? []);
    const running = calls.find((tc) => tc.status === 'running');
    if (running?.name) {
      return streamingLabelForToolName(running.name, t);
    }
    if (isLoading && toolsEnabled && status === 'thinking') {
      return t('chat.executing_tools');
    }
    return undefined;
  }, [pendingApproval, streamingMessage?.toolCalls, isLoading, toolsEnabled, status, t]);

  if (isHeadless) {
    return null;
  }

  return (
    <>
    <UICursorOverlay />
    <div
      className="flex flex-col h-full overflow-hidden shrink-0 border-l"
      style={
        isFullscreen
          ? {
              width: '100%',
              minWidth: 0,
              maxWidth: 'none',
              background: 'var(--bg)',
              borderLeftWidth: 0,
              opacity: 1,
              pointerEvents: 'auto',
            }
          : {
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
        contextDescription={context.description}
        messagesCount={messages.length}
        loadingHint={loadingHint}
        onClear={handleClear}
        onStartNewChat={startNewChat}
        onClose={onClose}
      />

      {/* ── WELCOME SCREEN (fullscreen, no messages) ── */}
      {isFullscreen &&
      chatMessages.length === 0 &&
      !streamingMessage &&
      !pdfRegionStreamingMessage &&
      !pendingPdfRegion ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 px-6 py-12">
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
              mcpEnabled={mcpEnabled}
              setToolsEnabled={setToolsEnabled}
              setResourceToolsEnabled={setResourceToolsEnabled}
              setMcpEnabled={setMcpEnabled}
              supportsTools={supportsTools}
              hasMcp={hasLangGraph}
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
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
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
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
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
          className="many-panel-messages py-6"
          style={{ paddingLeft: isFullscreen ? '10%' : '16px', paddingRight: isFullscreen ? '10%' : '16px' }}
        >
          {chatMessages.length === 0 && !streamingMessage && !pdfRegionStreamingMessage ? (
            <div className="py-10 text-center">
              <div className="mb-3 flex justify-center">
                <ManyAvatar size="lg" />
              </div>
              <p className="text-[15px] font-medium text-[var(--primary-text)]">{t('chat.many_welcome_title')}</p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-[var(--tertiary-text)]">
                {t('chat.many_welcome_subtitle')}
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
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--secondary-text)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messageGroups.map((group, index) => (
                <ChatMessageGroup
                  key={`group-${index}-${group[0]?.id || index}`}
                  className="many-message-group"
                  messages={group}
                  onRegenerate={handleRegenerate}
                />
              ))}
              {isLoading && !streamingMessage ? (
                <div className="flex gap-3 mt-5">
                  <ManyAvatar size="sm" />
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-[var(--bg-secondary)] px-4 py-3">
                    <ReadingIndicator className="opacity-60 text-[var(--secondary-text)]" />
                    <span className="text-[13px] text-[var(--secondary-text)]">{t('chat.analyzing')}</span>
                  </div>
                </div>
              ) : null}
              {error ? (
                <div
                  className="mx-auto flex max-w-md gap-3 rounded-xl p-4 mt-5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--error) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
                  }}
                >
                  <p className="flex-1 text-sm text-[var(--error)]">{error}</p>
                </div>
              ) : null}
            </>
          )}
          <div ref={messagesEndRef} />
        </UnifiedChatMessageArea>
      )}

      {isVisible && !isHeadless && pendingPdfRegion ? (
        <PdfRegionBanner
          pending={pendingPdfRegion}
          onDismiss={() => clearPendingPdfRegion()}
        />
      ) : null}

      {pendingApproval ? (
        <div
          ref={pendingApprovalRef}
          className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--secondary-text)]">
              {t(
                pendingApproval.actionRequests.length === 1
                  ? 'chat.pending_action_one'
                  : 'chat.pending_action_other',
                { count: pendingApproval.actionRequests.length },
              )}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  pendingApproval.submitResume(pendingApproval.actionRequests.map(() => ({ type: 'approve' as const })));
                  setPendingApproval(null);
                }}
                className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)]"
              >
                {t('chat.approve_all')}
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingApproval.submitResume(
                    pendingApproval.actionRequests.map(() => ({
                      type: 'reject' as const,
                      message: t('chat.rejected_by_user'),
                    })),
                  );
                  setPendingApproval(null);
                }}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--secondary-text)] hover:bg-[var(--bg-hover)]"
              >
                {t('chat.reject')}
              </button>
            </div>
          </div>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-[var(--secondary-text)] hover:text-[var(--primary-text)]">
              {t('chat.view_details')}
            </summary>
            <div className="mt-1 space-y-1 rounded border border-[var(--border)] bg-[var(--bg)] p-2">
              {pendingApproval.actionRequests.map((req, i) => (
                <div key={i} className="text-[11px]">
                  <span className="font-medium text-[var(--primary-text)]">{req.name}</span>
                  {req.args?.query != null && req.args?.query !== '' ? (
                    <p className="mt-0.5 line-clamp-2 text-[var(--secondary-text)]">{String(req.args.query)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
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
          <div className="px-[10%] pb-4">
            <UnifiedChatInput
              mode="many"
              input={input}
              setInput={setInput}
              inputRef={inputRef}
              isLoading={isLoading || !!pdfRegionStreamingMessage?.isStreaming}
              toolsEnabled={toolsEnabled}
              resourceToolsEnabled={resourceToolsEnabled}
              mcpEnabled={mcpEnabled}
              setToolsEnabled={setToolsEnabled}
              setResourceToolsEnabled={setResourceToolsEnabled}
              setMcpEnabled={setMcpEnabled}
              supportsTools={supportsTools}
              hasMcp={hasLangGraph}
              onSend={() => handleSend()}
              onAbort={handleAbort}
              inputPlaceholderOverride={
                pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null
              }
              attachments={chatAttachments}
              onAttachmentsChange={setChatAttachments}
            />
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
            mcpEnabled={mcpEnabled}
            setToolsEnabled={setToolsEnabled}
            setResourceToolsEnabled={setResourceToolsEnabled}
            setMcpEnabled={setMcpEnabled}
            supportsTools={supportsTools}
            hasMcp={hasLangGraph}
            onSend={() => handleSend()}
            onAbort={handleAbort}
            inputPlaceholderOverride={
              pendingPdfRegion ? t('many.input_placeholder_pdf_region') : null
            }
            attachments={chatAttachments}
            onAttachmentsChange={setChatAttachments}
          />
        )
      )}
    </div>
    </>
  );
}
