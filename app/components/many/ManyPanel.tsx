import { useState, useEffect, useRef, useCallback, useMemo, type ElementType } from 'react';
import { Search, FolderOpen, ClipboardList, Bot, BarChart2, Calendar, Mail } from 'lucide-react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import ManyChatInput from './ManyChatInput';
import { useManyStore, type ManyChatSession, type ManyMessage } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';
import {
  getAIConfig,
  createManyToolsForContext,
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
import { buildManyFloatingPrompt, prompts } from '@/lib/prompts/loader';
import { showToast } from '@/lib/store/useToastStore';
import ManyAvatar from './ManyAvatar';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import ReadingIndicator from '@/components/chat/ReadingIndicator';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildCitationMap } from '@/lib/utils/citations';
import { db } from '@/lib/db/client';
import { capturePostHog } from '@/lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { useTranslation } from 'react-i18next';
import {
  abortRun,
  getActiveRunBySession,
  onRunChunk,
  onRunUpdated,
  resumeRun,
  startLangGraphRun,
  type PersistentRun,
} from '@/lib/automations/api';
import { registerManyMessageSender, sendManyUserMessage, type ManySendOptions } from '@/lib/many/manySendController';

/**
 * Module-level guard: only ONE ManyPanel instance registers the IPC relay listener at a time.
 * Multiple panels can be mounted simultaneously (sidebar + chat tab), so we must prevent
 * duplicate handleSend calls when voice relay arrives.
 */
let _relayListenerCleanup: (() => void) | null = null;

const QUICK_PROMPTS_BASE = [
  'Summarize my current resource',
  'What should I focus on?',
  'Help me organize my notes',
];

const QUICK_PROMPTS_WITH_TOOLS = [
  'Search my resources',
  'Query my database',
];

const STREAMING_LABELS: Record<string, string> = {
  call_data_agent: 'Procesando datos',
  call_writer_agent: 'Creando contenido',
  call_library_agent: 'Consultando biblioteca',
  call_research_agent: 'Investigando',
};

const VOICE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
};

function buildVoicePrompt(language: string): string {
  const langName = VOICE_LANGUAGE_NAMES[language] || 'Spanish';
  return `\n\n## Voice Response Mode\nYou are speaking aloud in a live voice conversation. Follow these rules:\n- Keep responses SHORT and conversational (2-4 sentences for simple questions).\n- Use natural spoken language — avoid markdown, bullet lists, headers, and code blocks.\n- Summarize instead of enumerating long lists.\n- Avoid saying "of course!", "certainly!", or other filler phrases.\n- Respond in ${langName}.`;
}

const CHAT_CITATION_INSTRUCTION = `## Citation Guidance
- When you use evidence from resource_semantic_search or resource_get, cite the supporting source inline as [1], [2], etc.
- Reuse the numbering order from the most recent tool results in this answer.
- Prefer one citation per concrete factual claim or paragraph grounded in the library.`;

const APP_SECTION_GUIDE = `## Dome App Sections
Dome is a single-window app with a browser-like tab bar. Each section opens as a tab.

- **Home**: the starting tab — shows recent resources, quick actions, and workspace overview.
- **Folder tab** (one per folder): clicking a folder in the sidebar or a dome://folder link opens it as its own tab. Each folder tab shows subfolders + files inside that folder.
- **Agents**: manage and chat with specialized agents; also shows Workflows and Automations.
- **Learn**: Studio outputs (mindmaps, guides, quizzes, timelines, tables, flashcards, audio, video), Flashcards review, and Tags browser — all accessible via top-tabs inside Learn.
- **Calendar**: view and manage events.
- **Marketplace**: explore and install agents, workflows, and assets.
- **Settings**: app configuration, AI providers, integrations.
- **Resource tab** (one per resource): opens a specific note, notebook, PDF, DOCX, PPT, URL, video, or audio file for editing or viewing.

## Sidebar (Unified Workspace)
The left sidebar shows the full folder tree of the workspace. Clicking any folder opens it as a Folder tab. Folders can be nested; each Folder tab shows its subfolders in a grid and its files in a list.

## Navigation Guidance
- If the user asks how to find something, describe it using the tab and sidebar names above (e.g. "en la barra lateral izquierda busca la carpeta X", "abre la pestaña Agents", "ve a Learn > Studio").
- Prefer actionable guidance plus clickable internal links when available.
- If a workflow or specialized agent is the best route, mention it clearly.

## Deep Link Rules
- Resource links must use \`dome://resource/RESOURCE_ID/TYPE\`.
- Folder links must use \`dome://folder/FOLDER_ID\` — opens that folder as a tab in the current window.
- Studio links must use \`dome://studio/OUTPUT_ID/TYPE\`.
- **CRITICAL — Never invent IDs**: Always use the exact \`id\` field returned by tools (resource_create, resource_search, resource_get_library_overview, etc.). Resource IDs look like \`res_1234567890_abc123\`. Folder IDs use the same format — folders are resources too. NEVER invent IDs like \`fol_...\`, \`folder-123\`, or anything not returned by a tool. If you do not have the ID, call \`resource_get_library_overview\` or \`resource_search\` first.

## Active browser tab (macOS)
- When the user asks to save the page they are viewing **in an external browser** (Safari, Chrome, etc.), call \`browser_get_active_tab\` to obtain the live URL and title, then \`resource_create\` with \`type: "url"\` and \`metadata.url\`, then offer to run indexing if appropriate. If the tool errors, ask the user to paste the URL or focus a supported browser.`;

const ENTITY_CREATION_RULES = `## Entity Creation (agent_create, workflow_create, automation_create)
- **agent_create**: Always pass \`tool_ids\` — an agent without tools cannot work. Example: Noticiero needs ["web_fetch", "resource_create"]. After calling, your response MUST include the artifact block: \`\`\`artifact:created_entity (newline) {JSON from tool, strip ENTITY_CREATED: prefix} (newline) \`\`\`. This block renders the visual card. Without it, the user only sees plain text.
- **workflow_create**: When workflow nodes reference custom agents, create those agents first with agent_create (including tool_ids!), then reference their ID in nodes.
- **automation_create**: Dome has native automations. After creating an agent that could run recurrently (e.g. Noticiero), offer to create an automation. Never mention n8n or Make.`;

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
    setFullscreen,
    setStatus,
    messages,
    addMessage,
    clearMessages,
    startNewChat,
    switchSession,
    deleteSession,
    hydrateSession,
    sessions,
    currentSessionId,
    currentResourceId,
    currentResourceTitle,
    petPromptOverride,
    whatsappConnected,
    pinnedResources,
  } = useManyStore();
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);

  const [input, setInput] = useState('');
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
        setProviderInfo('Not configured');
        setSupportsTools(false);
      }
    };
    loadProviderInfo();
    const handleConfigChanged = () => loadProviderInfo();
    window.addEventListener('dome:ai-config-changed', handleConfigChanged);
    return () => window.removeEventListener('dome:ai-config-changed', handleConfigChanged);
  }, []);

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
        title: result.data.title || currentSession?.title || 'New chat',
        messages: persistedMessages,
        createdAt: currentSession?.createdAt ?? result.data.messages[0]?.created_at ?? Date.now(),
      } satisfies ManyChatSession);
    }).catch((error) => {
      console.warn('[Many] Could not hydrate session from DB:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, currentSession, hydrateSession]);

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
            title: fullResult.data.title || dbSession.title || 'Chat',
            messages: msgs,
            createdAt: dbSession.created_at ?? Date.now(),
          } satisfies ManyChatSession);
        }
      } catch (err) {
        console.warn('[Many] DB session recovery failed:', err);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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
      title: result.data.title || currentSession?.title || 'New chat',
      messages: dbMessages,
      createdAt: currentSession?.createdAt ?? result.data.messages[0]?.created_at ?? Date.now(),
    } satisfies ManyChatSession);
    return true;
  }, [currentSession, currentSessionId, hydrateSession]);
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
        streamingLabel: run.status === 'waiting_approval' ? 'Esperando aprobación...' : (prev?.streamingLabel || 'Ejecutando en background...'),
      }));
      return;
    }
    setIsLoading(false);
    setStatus('idle');
    setStreamingMessage(null);
    setPendingApproval(null);
  }, [setStatus]);

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

  useEffect(() => {
    if (!activeRunId) {
      return;
    }
    const unsubUpdated = onRunUpdated(({ run }) => {
      if (run.id !== activeRunId) {
        return;
      }
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        if (voiceAutoSpeakForRunIdRef.current === run.id) {
          voiceAutoSpeakForRunIdRef.current = null;
        }
        // Clear non-message state immediately
        setActiveRunId(null);
        setIsLoading(false);
        setStatus('idle');
        setPendingApproval(null);
        // Keep the assistant response visible until DB messages are loaded.
        // If streamingMessage is null (e.g. cleared by a re-mount), reconstruct
        // it from the run data so the conversation never appears blank.
        setStreamingMessage((prev) => {
          if (prev) return { ...prev, isStreaming: false };
          const toolCalls = Array.isArray(run.metadata?.toolCalls)
            ? (run.metadata.toolCalls as ToolCallData[])
            : [];
          if (!run.outputText && toolCalls.length === 0) return null;
          return {
            id: `run-${run.id}`,
            role: 'assistant',
            content: run.outputText || '',
            timestamp: run.updatedAt || Date.now(),
            isStreaming: false,
            toolCalls,
          };
        });
        // Capture final content from run for localStorage fallback.
        const finalContent = run.outputText || '';
        const finalToolCalls: ToolCallData[] = Array.isArray(run.metadata?.toolCalls)
          ? (run.metadata.toolCalls as ToolCallData[])
          : [];

        // Use ref so this listener is not re-registered every time currentSession
        // changes (which would create a window where the event could be missed).
        const tryRefresh = (attemptsLeft: number) => {
          void refreshSessionFromDbRef.current().then((hydrated) => {
            if (hydrated) {
              setStreamingMessage(null);
            } else if (attemptsLeft > 0) {
              // DB message may not be written yet — retry once after a short delay.
              setTimeout(() => tryRefresh(attemptsLeft - 1), 600);
            } else {
              // DB hydration failed after all retries. Persist assistant message
              // directly to localStorage so it survives closing the panel.
              if (finalContent || finalToolCalls.length > 0) {
                addMessage({ role: 'assistant', content: finalContent, toolCalls: finalToolCalls });
              }
              setStreamingMessage(null);
            }
          }).catch((err) => {
            // Keep the streaming message visible as fallback so the chat is never blank.
            console.warn('[Many] refreshSessionFromDb failed, persisting to localStorage:', err);
            if (finalContent || finalToolCalls.length > 0) {
              addMessage({ role: 'assistant', content: finalContent, toolCalls: finalToolCalls });
            }
            setStreamingMessage(null);
          });
        };
        tryRefresh(2);
        // Note: TTS is now handled via streaming (run-engine feeds chunks to streaming-tts.cjs)
        // voiceAutoSpeakForRunIdRef is kept only to track state for HUD
        if (run.status === 'completed') {
          window.dispatchEvent(new Event('dome:resources-changed'));
        }
      } else {
        applyRunSnapshot(run);
      }
    });
    const unsubChunk = onRunChunk((payload) => {
      if (payload.runId !== activeRunId) {
        return;
      }
      if (payload.type === 'text' && payload.text) {
        setStreamingMessage((prev) =>
          prev
            ? { ...prev, content: `${prev.content || ''}${payload.text}` }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: payload.text ?? '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: [],
                streamingLabel: 'Ejecutando en background...',
              },
        );
      } else if (payload.type === 'thinking' && payload.text) {
        setStreamingMessage((prev) => (prev ? { ...prev, thinking: `${prev.thinking || ''}${payload.text}` } : prev));
      } else if (payload.type === 'tool_call' && payload.toolCall) {
        const tc = payload.toolCall;
        const args = (() => {
          try {
            return typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : {};
          } catch {
            return {};
          }
        })();
        setStreamingMessage((prev) => {
          const nextToolCalls: ToolCallData[] = [
            ...(prev?.toolCalls || []),
            {
              id: tc.id,
              name: tc.name,
              arguments: args,
              status: 'running' as const,
            },
          ];
          return prev
            ? {
                ...prev,
                toolCalls: nextToolCalls,
                streamingLabel: `${STREAMING_LABELS[tc.name || ''] || tc.name || 'Herramienta'}...`,
              }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: nextToolCalls,
                streamingLabel: `${tc.name}...`,
              };
        });
      } else if (payload.type === 'tool_result' && payload.toolCallId) {
        setStreamingMessage((prev) => {
          if (!prev?.toolCalls) {
            return prev;
          }
          return {
            ...prev,
            toolCalls: prev.toolCalls.map((call) =>
              call.id === payload.toolCallId ? { ...call, status: 'success', result: payload.result } : call,
            ),
          };
        });
      } else if (payload.type === 'interrupt' && payload.actionRequests && payload.reviewConfigs) {
        setPendingApproval({
          actionRequests: payload.actionRequests,
          reviewConfigs: payload.reviewConfigs,
          submitResume: (decisions) => {
            hitlDecisionsRef.current = decisions;
            void resumeRun(payload.runId, decisions as Array<unknown>);
          },
        });
      }
    });
    return () => {
      unsubUpdated();
      unsubChunk();
    };
  }, [activeRunId, applyRunSnapshot, addMessage]);

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
  }, [messages, streamingMessage, scrollToBottom]);

  useEffect(() => {
    if (pendingApproval && pendingApprovalRef.current) {
      pendingApprovalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [pendingApproval]);

  useEffect(() => {
    if (isHeadless) return;
    if (inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
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

  const buildSystemPrompt = useCallback(async () => {
    if (petPromptOverride) {
      return petPromptOverride;
    }
    const context = getUiLocationDescription(pathname || '/', homeSidebarSection);
    const now = new Date();
    let prompt = buildManyFloatingPrompt({
      location: context.location,
      description: context.description,
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      resourceTitle: currentResourceTitle || undefined,
      whatsappConnected,
    });
    prompt += `\n\n${APP_SECTION_GUIDE}\n\n${buildSharedUiContextBlock({
      pathname: pathname || '/',
      homeSidebarSection,
      currentFolderId,
      currentResourceId: effectiveResourceId,
      currentResourceTitle: currentResourceTitle || null,
    })}`;
    prompt += `\n\n${CHAT_CITATION_INSTRUCTION}`;
    if (userMemory) {
      prompt += `\n\n## What I know about you\n${userMemory}`;
    }

    // Inject pinned resource content
    if (pinnedResources.length > 0 && typeof window.electron?.ai?.tools?.resourceGet === 'function') {
      const pinnedIds = pinnedResources.map((r) => r.id);
      let pinnedBlock = '\n\n## Pinned Context Resources\nThe following resources have been added to context by the user. Use their content directly — do NOT call resource_get or resource_search for these IDs unless you need pages not shown here.\n';
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
      prompt += pinnedBlock;
      prompt += `\n\n> Already loaded resource IDs (skip fetching): ${pinnedIds.join(', ')}`;
    }

    return prompt;
  }, [
    currentFolderId,
    currentResourceTitle,
    effectiveResourceId,
    homeSidebarSection,
    pathname,
    petPromptOverride,
    pinnedResources,
    userMemory,
    whatsappConnected,
  ]);

  const isSummarizeRequest = (msg: string) => {
    const lower = msg.toLowerCase();
    return (
      lower.includes('summarize') ||
      lower.includes('summarise') ||
      lower.includes('resum') ||
      (lower.includes('resource') && (lower.includes('summar') || lower.includes('content') || lower.includes('about')))
    );
  };

  const hasLangGraph = typeof window !== 'undefined' && !!window.electron?.ai?.streamLangGraph;

  const handleSend = useCallback(async (messageOverride?: string, sendOptions?: ManySendOptions) => {
    const userMessage = messageOverride || input.trim();
    if (!userMessage || isLoading || isSubmittingRef.current) return;

    if (sendOptions?.openPanel) {
      useManyStore.getState().setOpen(true);
    }

    isSubmittingRef.current = true;
    setInput('');
    setIsLoading(true);
    setStatus('thinking');
    setError(null);
    setStreamingMessage(null);
    setAbortController(null);

    addMessage({ role: 'user', content: userMessage });
    scrollToBottom(true);

    let fullResponse = '';
    let fullThinking = '';
    let chatSuccess = true;
    let providerForAnalytics: string | null = null;
    let delegatedToRunEngine = false;

    try {
      const config = await getAIConfig();
      if (!config) {
        addMessage({
          role: 'assistant',
          content: 'No tengo configuración de IA. Ve a **Ajustes > AI** para configurar un proveedor.',
        });
        return;
      }

      const needsApiKey = ['openai', 'anthropic', 'google'].includes(config.provider);
      const hasApiKey = !!config.apiKey;
      if (needsApiKey && !hasApiKey && !['synthetic', 'venice'].includes(config.provider)) {
        setError('API key not configured. Go to Settings to configure it.');
        addMessage({
          role: 'assistant',
          content: 'La API key no está configurada. Ve a **Ajustes > AI** para añadir tu clave.',
        });
        return;
      }

      if (!hasLangGraph) {
        throw new Error('Many requiere el runtime LangGraph para funcionar.');
      }

      let systemPrompt = await buildSystemPrompt();

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
              systemPrompt += `\n\n## Current Resource Content\nThe user is viewing "${r.title || currentResourceTitle}". Use this as the primary context for answering the user directly.\n\n${content.slice(0, 12000)}`;
              if (content.length > 12000) systemPrompt += '\n\n[Content truncated for length]';
            }
          }
        } catch (e) {
          console.warn('[Many] Could not fetch resource content:', e);
        }
      }

      // Append user-configured skills (prompt-driven specializations)
      let skillsBlock = '';
      if (db.isAvailable()) {
        try {
          const skillsResult = await db.getAISkills();
          if (skillsResult.success && Array.isArray(skillsResult.data)) {
            const skills = skillsResult.data.filter((s: { enabled?: boolean }) => s.enabled !== false);
            if (skills.length > 0) {
              const MAX_SKILLS_CHARS = 8000;
              let block = '\n\n## Available Skills\n';
              for (const s of skills) {
                const name = s.name || 'unnamed';
                const desc = s.description || '';
                const prompt = s.prompt || '';
                if (!prompt.trim()) continue;
                const section = `### Skill: ${name}\n${desc ? `${desc}\n\n` : ''}${prompt}\n\n`;
                if (block.length + section.length > MAX_SKILLS_CHARS) {
                  block += '\n[Additional skills truncated for context length]';
                  break;
                }
                block += section;
              }
              if (block.trim().length > 20) {
                skillsBlock = block;
                systemPrompt += skillsBlock;
              }
            }
          }
        } catch (e) {
          console.warn('[Many] Could not load skills:', e);
        }
      }

      const sharedContext = {
        pathname: pathname || '/',
        homeSidebarSection,
        currentFolderId,
        currentResourceId: effectiveResourceId,
        currentResourceTitle: currentResourceTitle || null,
      };
      const toolHint = buildSharedResourceHint(sharedContext);
      const toolDefinitions =
        toolsEnabled && supportsTools && activeTools.length > 0
          ? toOpenAIToolDefinitions(activeTools)
          : [];
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
      const voicePromptSuffix = sendOptions?.autoSpeak ? buildVoicePrompt(voiceLanguage) : '';

      const unifiedSystemPrompt =
        systemPrompt +
        '\n\n' +
        prompts.martin.tools +
        '\n\n## Tool Usage Mode\n- You are running in a single direct-tools runtime.\n- Decide yourself whether to answer directly or call tools.\n- If the current context already contains enough information, answer directly without tools.\n- Use tools only when you need fresh workspace data, external information, or to perform an action.\n- Never delegate or hand off the response to subagents.\n\n' +
        ENTITY_CREATION_RULES +
        toolHint +
        voicePromptSuffix;

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
        streamingLabel: toolDefinitions.length > 0 || mcpServerIds.length > 0 ? 'Pensando y evaluando herramientas...' : 'Procesando...',
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
        title: userMessage.slice(0, 80) || 'Many run',
        sessionId: dbSessionId,
        contextId: effectiveResourceId ?? null,
        sessionTitle: currentSession?.title || null,
        messages: runMessages,
        toolDefinitions,
        toolIds,
        mcpServerIds,
        subagentIds: [],
        threadId,
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
        const msg = err instanceof Error ? err.message : 'Unknown error';
        addMessage({ role: 'assistant', content: `Lo siento, tuve un problema: ${msg}` });
        showToast('error', `Many: ${msg}`);
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
    buildSystemPrompt,
    effectiveResourceId,
    pathname,
    homeSidebarSection,
    currentFolderId,
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
  ]);

  useEffect(() => {
    registerManyMessageSender(async (text, opts) => {
      await handleSend(text, opts);
    });
    return () => registerManyMessageSender(null);
  }, [handleSend]);

  /**
   * Voz global: el HUD vive en `many-voice-overlay`; reenvío IPC → este panel.
   * Singleton: uses a module-level guard so multiple mounted ManyPanel instances
   * (sidebar + chat tab) don't each register their own listener and double-fire.
   * Delegates to sendManyUserMessage → registeredSender (whichever panel is active).
   */
  useEffect(() => {
    if (!window.electron?.manyVoice?.onRelayToMain) return undefined;
    // Already registered by another instance — skip
    if (_relayListenerCleanup) return undefined;
    _relayListenerCleanup = window.electron.manyVoice.onRelayToMain(
      (payload: { text: string; autoSpeak?: boolean; openPanel?: boolean; voiceLanguage?: string }) => {
        void sendManyUserMessage(payload.text, {
          autoSpeak: payload.autoSpeak,
          openPanel: payload.openPanel,
          voiceLanguage: payload.voiceLanguage,
        });
      },
    );
    return () => {
      _relayListenerCleanup?.();
      _relayListenerCleanup = null;
    };
  }, []);

  /** Sincroniza estado Many (thinking / TTS / currentSentence) hacia la ventana flotante de voz. */
  useEffect(() => {
    if (!window.electron?.manyVoice?.pushStateToOverlay) return undefined;
    const pushNow = () => {
      const { status, ttsError, currentSentence } = useManyStore.getState();
      void window.electron.manyVoice.pushStateToOverlay({ status, ttsError, currentSentence });
    };
    let last = {
      status: useManyStore.getState().status,
      ttsError: useManyStore.getState().ttsError,
      currentSentence: useManyStore.getState().currentSentence,
    };
    const unsub = useManyStore.subscribe((state) => {
      const next = { status: state.status, ttsError: state.ttsError, currentSentence: state.currentSentence };
      if (next.status === last.status && next.ttsError === last.ttsError && next.currentSentence === last.currentSentence) return;
      last = next;
      void window.electron.manyVoice.pushStateToOverlay(next);
    });
    pushNow();
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.electron?.manyVoice?.onRequestStatePush) return undefined;
    return window.electron.manyVoice.onRequestStatePush(() => {
      const { status, ttsError, currentSentence } = useManyStore.getState();
      void window.electron.manyVoice.pushStateToOverlay({ status, ttsError, currentSentence });
    });
  }, []);

  /** Listen for streaming TTS sentence events and update store + overlay */
  useEffect(() => {
    if (!window.electron?.audio?.onTtsSentencePlaying) return undefined;
    const unsub = window.electron.audio.onTtsSentencePlaying(
      (data: { runId: string; sentence: string }) => {
        const { setStatus, setCurrentSentence } = useManyStore.getState();
        setStatus('speaking');
        setCurrentSentence(data.sentence);
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.electron?.audio?.onTtsFinished) return undefined;
    const unsub = window.electron.audio.onTtsFinished(() => {
      const { setStatus, setCurrentSentence } = useManyStore.getState();
      setCurrentSentence(null);
      setStatus('idle');
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.electron?.audio?.onTtsError) return undefined;
    const unsub = window.electron.audio.onTtsError(
      (data: { runId: string; error: string }) => {
        useManyStore.getState().setTtsError(data.error || 'Error de voz al reproducir respuesta.');
        useManyStore.getState().setCurrentSentence(null);
        useManyStore.getState().setStatus('idle');
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.electron?.manyVoice?.onOpenPanelRequest) return undefined;
    return window.electron.manyVoice.onOpenPanelRequest(() => {
      useManyStore.getState().setOpen(true);
      window.dispatchEvent(new CustomEvent('dome:many-requires-panel', { detail: { reason: 'user' } }));
    });
  }, []);

  useEffect(() => {
    if (!window.electron?.manyVoice?.onDismissTtsError) return undefined;
    return window.electron.manyVoice.onDismissTtsError(() => {
      useManyStore.getState().setTtsError(null);
    });
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
          citationMap: buildCitationMap(toolCalls as Array<{ name: string; result: any }> | undefined),
          thinking: m.thinking,
        };
      }),
    [messages],
  );

  const messageGroups = useMemo(() => {
    const liveStreamingMessage = streamingMessage
      ? { ...streamingMessage, citationMap: buildCitationMap(streamingMessage.toolCalls as Array<{ name: string; result: any }> | undefined) }
      : null;
    const all = liveStreamingMessage ? [...chatMessages, liveStreamingMessage] : chatMessages;
    return groupMessagesByRole(all);
  }, [chatMessages, streamingMessage]);

  const handleClear = useCallback(() => {
    if (window.confirm('¿Borrar todo el historial del chat?')) {
      clearMessages();
      showToast('info', 'Chat cleared');
    }
  }, [clearMessages]);

  const context = getUiLocationDescription(pathname || '/', homeSidebarSection);

  const loadingHint = useMemo(() => {
    if (pendingApproval) return 'Esperando aprobación';
    const running = streamingMessage?.toolCalls?.find((t) => t.status === 'running');
    if (running) {
      const labels: Record<string, string> = {
        call_data_agent: 'Procesando datos',
        call_writer_agent: 'Creando contenido',
        call_library_agent: 'Consultando biblioteca',
        call_research_agent: 'Investigando',
      };
      return `${labels[running.name] || running.name.replace(/_/g, ' ')}...`;
    }
    // When thinking with tools but no toolCalls yet (LangGraph invoke buffers until end)
    if (isLoading && toolsEnabled && status === 'thinking') {
      return 'Ejecutando herramientas...';
    }
    return undefined;
  }, [pendingApproval, streamingMessage?.toolCalls, isLoading, toolsEnabled, status]);

  if (isHeadless) {
    return null;
  }

  return (
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
        sessions={sessions}
        currentSessionId={currentSessionId}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setFullscreen(!isFullscreen)}
        onClear={handleClear}
        onStartNewChat={startNewChat}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
        onClose={onClose}
      />

      {/* ── WELCOME SCREEN (fullscreen, no messages) ── */}
      {isFullscreen && chatMessages.length === 0 && !streamingMessage ? (
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
            ¿En qué puedo ayudarte?
          </h1>

          {/* Big centered input */}
          <div className="w-full max-w-2xl mb-6">
            <ManyChatInput
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
              onVoiceSend={(text) => void handleSend(text, { autoSpeak: true })}
              isWelcomeScreen
            />
          </div>

          {/* Quick prompt pills */}
          <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
            <div className="flex flex-wrap justify-center gap-2">
              {([
                { Icon: Search, label: 'Buscar en mi biblioteca' },
                { Icon: FolderOpen, label: 'Organizar recursos' },
                { Icon: ClipboardList, label: 'Preparar reunión' },
              ] as { Icon: ElementType; label: string }[]).map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setInput(label); inputRef.current?.focus(); }}
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {([
                { Icon: Bot, label: 'Estrategia con IA' },
                { Icon: BarChart2, label: 'Crear tabla' },
                { Icon: Calendar, label: 'Reporte semanal' },
                { Icon: Mail, label: 'Redactar email' },
              ] as { Icon: ElementType; label: string }[]).map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setInput(label); inputRef.current?.focus(); }}
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── MESSAGES AREA ── */
        <div
          className="many-panel-messages flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-6"
          style={{ paddingLeft: isFullscreen ? '10%' : '16px', paddingRight: isFullscreen ? '10%' : '16px' }}
        >
          {chatMessages.length === 0 && !streamingMessage ? (
            <div className="py-10 text-center">
              <div className="mb-3 flex justify-center">
                <ManyAvatar size="lg" />
              </div>
              <p className="text-[15px] font-medium text-[var(--primary-text)]">Hi, I&apos;m Many</p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-[var(--tertiary-text)]">
                Your personal assistant in Dome. Ask me anything.
              </p>
              <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2">
                {[...QUICK_PROMPTS_BASE, ...(supportsTools ? QUICK_PROMPTS_WITH_TOOLS : [])].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--secondary-text)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    {prompt}
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
                    <span className="text-[13px] text-[var(--secondary-text)]">Analizando tu consulta...</span>
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
        </div>
      )}

      {pendingApproval ? (
        <div
          ref={pendingApprovalRef}
          className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--secondary-text)]">
              {pendingApproval.actionRequests.length}{' '}
              {pendingApproval.actionRequests.length === 1 ? 'acción pendiente' : 'acciones pendientes'}
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
                Aprobar todo
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingApproval.submitResume(
                    pendingApproval.actionRequests.map(() => ({
                      type: 'reject' as const,
                      message: 'Rechazado por el usuario',
                    })),
                  );
                  setPendingApproval(null);
                }}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--secondary-text)] hover:bg-[var(--bg-hover)]"
              >
                Rechazar
              </button>
            </div>
          </div>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-[var(--secondary-text)] hover:text-[var(--primary-text)]">
              Ver detalles
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
      {!(isFullscreen && chatMessages.length === 0 && !streamingMessage) && (
        isFullscreen ? (
          <div className="px-[10%] pb-4">
            <ManyChatInput
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
              onVoiceSend={(text) => void handleSend(text, { autoSpeak: true })}
            />
          </div>
        ) : (
          <ManyChatInput
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
            onVoiceSend={(text) => void handleSend(text, { autoSpeak: true })}
          />
        )
      )}
    </div>
  );
}
