'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { ManyAgent } from '@/types';
import { getManyAgentById } from '@/lib/agents/api';
import { useAgentChatStore } from '@/lib/store/useAgentChatStore';
import {
  getAIConfig,
  createToolsForAgent,
  toOpenAIToolDefinitions,
  providerSupportsTools,
  type AIProviderType,
} from '@/lib/ai';
import { showToast } from '@/lib/store/useToastStore';
import { db } from '@/lib/db/client';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import ReadingIndicator from '@/components/chat/ReadingIndicator';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildCitationMap } from '@/lib/utils/citations';
import AgentChatInput from './AgentChatInput';
import { ChevronLeft } from 'lucide-react';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { useTranslation } from 'react-i18next';
import {
  abortRun,
  getActiveRunBySession,
  onRunChunk,
  onRunUpdated,
  startLangGraphRun,
  type PersistentRun,
} from '@/lib/automations/api';

const RESOURCE_LINK_INSTRUCTION = `
When mentioning a resource (document, note, PDF, video, etc.) that the user can open, ALWAYS use this format: [Ver: Title](dome://resource/RESOURCE_ID/TYPE). Use the exact resource ID and type from your tool results. Types: note, pdf, url, youtube, notebook, docx, document, excel, ppt, video, audio, image, folder.

NEVER use resource:// - it does not work. ONLY dome://resource/ID/TYPE works. NEVER use [[Title]] wikilinks or file:// or raw URLs for internal resources—they open in the browser instead of in Dome. CRITICAL: For url-type resources (websites), NEVER use the actual web URL (https://...)—always use dome://resource/ID/url. Using https:// opens in the browser instead of Dome. NEVER use /resource/ID as the link URL—always use dome://resource/ID/TYPE. If the user asks for "enlace", "link", or "abrir", use: [Abrir](dome://resource/RESOURCE_ID/TYPE).

When listing resources, show ONLY the title (e.g. "CE_Python.pdf"), never "Root/..." or folder paths. Format: [Title](dome://resource/ID/TYPE).

When listing folders or subfolders (e.g. from get_library_overview), use: [Abrir carpeta: Title](dome://folder/FOLDER_ID).
Example: [Abrir carpeta: POO](dome://folder/res_xxx).

For PDFs, when a specific page is relevant (e.g. after pdf_annotation_create, or when referencing a page), use: [Ver: Title p. N](dome://resource/RESOURCE_ID/pdf?page=N).

When mentioning a Studio output (mindmap, quiz, guide, FAQ, timeline, table, flashcards, audio, video, research), format it as: [Ver: Title](dome://studio/OUTPUT_ID/TYPE).

ALWAYS include a dome:// link in your response when you create any element via tools (resource_create, flashcard_create, pdf_annotation_create, etc.) so the user can open it. Exception: elements from Studio tile buttons are shown automatically, so no link needed in that context.

When you use evidence from resource_semantic_search or resource_get, cite the supporting source inline as [1], [2], etc. Reuse the numbering order from the latest tool results in the same answer.`;

interface AgentChatViewProps {
  agentId: string;
  onBack?: () => void;
}

const THINKING_LABELS = [
  'Analyzing request...',
  'Searching for information...',
  'Consulting sources...',
  'Processing data...',
  'Preparing response...',
  'Working on it...',
];

const TOOL_LABELS: Record<string, string> = {
  ppt_create: 'Creating presentation...',
  ppt_get_slides: 'Reading slides...',
  ppt_export: 'Exporting presentation...',
  resource_get: 'Reading document...',
  resource_list: 'Listing resources...',
  resource_search: 'Searching resources...',
  resource_semantic_search: 'Semantic search...',
  resource_create: 'Creating resource...',
  resource_update: 'Updating resource...',
  get_library_overview: 'Exploring library...',
  web_search: 'Searching the web...',
  web_fetch: 'Reading web page...',
  deep_research: 'Investigating deeply...',
  excel_get: 'Reading spreadsheet...',
  excel_create: 'Creating spreadsheet...',
  notebook_get: 'Reading notebook...',
  notebook_add_cell: 'Adding cell...',
  call_data_agent: 'Data agent working...',
  call_writer_agent: 'Writer agent working...',
  call_research_agent: 'Research agent working...',
  call_library_agent: 'Library agent working...',
  pdf_annotation_create: 'Creating PDF annotation...',
};

export default function AgentChatView({ agentId, onBack }: AgentChatViewProps) {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<ManyAgent | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [providerInfo, setProviderInfo] = useState('');
  const [supportsTools, setSupportsTools] = useState(false);
  const [disabledMcpIds, setDisabledMcpIds] = useState<Set<string>>(new Set());
  const [disabledToolIds, setDisabledToolIds] = useState<Set<string>>(new Set());
  const thinkingLabelIdxRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const {
    setAgent: setStoreAgent,
    status,
    setStatus,
    messages,
    addMessage,
    clearMessages,
    startNewChat,
    switchSession,
    deleteSession,
    sessions,
    currentSessionId,
    hydrateSession,
  } = useAgentChatStore();

  useEffect(() => {
    setStoreAgent(agentId);
  }, [agentId, setStoreAgent]);

  useEffect(() => {
    getManyAgentById(agentId).then(setAgent);
  }, [agentId]);

  useEffect(() => {
    const load = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        setProviderInfo(
          `${config.provider} / ${config.provider === 'ollama' ? config.ollamaModel || 'default' : config.model || 'default'}`
        );
        setSupportsTools(providerSupportsTools(config.provider as AIProviderType));
      } else {
        setProviderInfo('Not configured');
        setSupportsTools(false);
      }
    };
    load();
  }, []);

  const refreshSessionFromDb = useCallback(async () => {
    if (!currentSessionId || !db.isAvailable()) {
      return;
    }
    const result = await db.getChatSession(currentSessionId);
    if (!result.success || !result.data) {
      return;
    }
    hydrateSession({
      id: currentSessionId,
      title: result.data.title || agent?.name || 'New chat',
      messages: result.data.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.created_at,
        toolCalls: message.tool_calls ?? undefined,
        thinking: message.thinking ?? undefined,
      })),
      createdAt: result.data.messages[0]?.created_at ?? Date.now(),
    });
  }, [agent?.name, currentSessionId, hydrateSession]);

  const applyRunSnapshot = useCallback((run: PersistentRun | null) => {
    if (!run) {
      setActiveRunId(null);
      return;
    }
    setActiveRunId(run.id);
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
        streamingLabel: prev?.streamingLabel || t('chat.running_background'),
      }));
      return;
    }
    setIsLoading(false);
    setStatus('idle');
    setStreamingMessage(null);
  }, [setStatus]);

  useEffect(() => {
    if (!currentSessionId) {
      setActiveRunId(null);
      return;
    }
    let cancelled = false;
    void getActiveRunBySession(currentSessionId).then((run) => {
      if (!cancelled) {
        applyRunSnapshot(run);
      }
    }).catch((error) => {
      console.warn('[AgentChat] Could not load active run:', error);
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
      applyRunSnapshot(run);
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        setActiveRunId(null);
        void refreshSessionFromDb();
        if (run.status === 'completed') {
          window.dispatchEvent(new Event('dome:resources-changed'));
        }
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
                content: payload.text,
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: [],
                streamingLabel: t('chat.running_background'),
              },
        );
      } else if (payload.type === 'thinking' && payload.text) {
        setStreamingMessage((prev) => (prev ? { ...prev, thinking: `${prev.thinking || ''}${payload.text}` } : prev));
      } else if (payload.type === 'tool_call' && payload.toolCall) {
        const args = (() => {
          try {
            return typeof payload.toolCall.arguments === 'string'
              ? JSON.parse(payload.toolCall.arguments)
              : {};
          } catch {
            return {};
          }
        })();
        setStreamingMessage((prev) => {
          const nextToolCalls = [
            ...(prev?.toolCalls || []),
            {
              id: payload.toolCall.id,
              name: payload.toolCall.name,
              arguments: args,
              status: 'running',
            },
          ];
          return prev
            ? {
                ...prev,
                toolCalls: nextToolCalls,
                streamingLabel: `${TOOL_LABELS[payload.toolCall.name || ''] || payload.toolCall.name || 'Herramienta'}...`,
              }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: nextToolCalls,
                streamingLabel: `${payload.toolCall.name}...`,
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
      }
    });
    return () => {
      unsubUpdated();
      unsubChunk();
    };
  }, [activeRunId, applyRunSnapshot, refreshSessionFromDb]);

  const scrollToBottom = useCallback(
    (force = false) => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (force || isNearBottom) {
        messagesEndRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }
    },
    [prefersReducedMotion]
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  const buildSystemPrompt = useCallback(async () => {
    if (!agent) return '';
    let prompt = agent.systemInstructions?.trim() || agent.description || `You are ${agent.name}.`;
    prompt += '\n\n' + RESOURCE_LINK_INSTRUCTION;

    const now = new Date();
    prompt += `\n\nCurrent date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

    if (agent.skillIds?.length && db.isAvailable()) {
      try {
        const skillsResult = await db.getSetting('ai_skills');
        if (skillsResult.success && skillsResult.data) {
          const parsed = JSON.parse(skillsResult.data || '[]');
          const skills = Array.isArray(parsed)
            ? parsed.filter(
              (s: { id?: string; enabled?: boolean }) =>
                typeof s.id === 'string' &&
                agent.skillIds!.includes(s.id) &&
                s.enabled !== false
            )
            : [];
          if (skills.length > 0) {
            prompt += '\n\n## Skills\n';
            for (const s of skills) {
              if (s.prompt?.trim()) {
                prompt += `\n### ${s.name || 'Skill'}\n${s.prompt}\n`;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return prompt;
  }, [agent]);

  // Rotate the streaming label every 3s while waiting (before any tools appear)
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setStreamingMessage((prev) => {
        if (!prev || !prev.isStreaming || (prev.toolCalls && prev.toolCalls.length > 0)) return prev;
        thinkingLabelIdxRef.current = (thinkingLabelIdxRef.current + 1) % THINKING_LABELS.length;
        return { ...prev, streamingLabel: THINKING_LABELS[thinkingLabelIdxRef.current] };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const hasLangGraph =
    typeof window !== 'undefined' && !!window.electron?.ai?.streamLangGraph;
  const hasMcpForAgent =
    Array.isArray(agent?.mcpServerIds) && agent.mcpServerIds.length > 0;
  const enabledMcpIds = useMemo(
    () => (agent?.mcpServerIds ?? []).filter((id) => !disabledMcpIds.has(id)),
    [agent?.mcpServerIds, disabledMcpIds]
  );
  const enabledToolIds = useMemo(
    () => (agent?.toolIds ?? []).filter((id) => !disabledToolIds.has(id)),
    [agent?.toolIds, disabledToolIds]
  );
  const activeTools = useMemo(() => {
    if (!enabledToolIds.length) return [];
    return createToolsForAgent(enabledToolIds);
  }, [enabledToolIds]);
  const toolDefs = useMemo(
    () => (activeTools.length > 0 ? toOpenAIToolDefinitions(activeTools) : []),
    [activeTools]
  );
  const hasAgentTools = (agent?.toolIds?.length ?? 0) > 0 || hasMcpForAgent;
  const useToolsStream =
    supportsTools &&
    hasLangGraph &&
    (enabledMcpIds.length > 0 || toolDefs.length > 0);

  const handleSend = useCallback(async () => {
    const userMessage = input.trim();
    if (!userMessage || isLoading || isSubmittingRef.current || !agent) return;

    isSubmittingRef.current = true;
    thinkingLabelIdxRef.current = 0;
    setInput('');
    setIsLoading(true);
    setStatus('thinking');
    setError(null);
    setStreamingMessage(null);

    const controller = new AbortController();
    setAbortController(controller);

    addMessage({ role: 'user', content: userMessage });
    scrollToBottom(true);

    let fullResponse = '';
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

      const systemPrompt = await buildSystemPrompt();
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      if (useToolsStream) {
        if (enabledMcpIds.length > 0) {
          await loadMcpServersSetting();
        }
        setStreamingMessage({
          id: `streaming-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          toolCalls: [],
          streamingLabel: t('ui.loading'),
        });

        const threadId = `agent_${agentId}_${Date.now()}`;

        let dbSessionId: string | null = null;
        if (db.isAvailable() && currentSessionId) {
          try {
            const sessionResult = await db.createChatSession({
              id: currentSessionId,
              agentId,
              resourceId: null,
              mode: 'agent',
              contextId: agentId,
              threadId,
              title: agent?.name ?? null,
              toolIds: agent?.toolIds ?? [],
              mcpServerIds: enabledMcpIds,
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
            console.warn('[AgentChat] Could not persist chat to DB:', e);
          }
        }

        const run = await startLangGraphRun({
          ownerType: 'agent',
          ownerId: agentId,
          title: `${agent.name}: ${userMessage.slice(0, 60)}`,
          sessionId: dbSessionId,
          contextId: agentId,
          sessionTitle: agent.name,
          messages: apiMessages,
          toolDefinitions: toolDefs,
          toolIds: agent.toolIds ?? [],
          mcpServerIds: enabledMcpIds,
          threadId,
          skipHitl: true,
        });
        delegatedToRunEngine = true;
        setAbortController(null);
        setActiveRunId(run.id);
        applyRunSnapshot(run);
      } else {
        const { chatStream } = await import('@/lib/ai');
        setStreamingMessage({
          id: `streaming-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        });
        for await (const chunk of chatStream(
          apiMessages,
          toolDefs.length > 0 ? toolDefs : undefined,
          controller.signal
        )) {
          if (chunk.type === 'text' && chunk.text) {
            fullResponse += chunk.text;
            setStreamingMessage((prev) =>
              prev ? { ...prev, content: fullResponse } : null
            );
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }
        setStreamingMessage((prev) =>
          prev ? { ...prev, isStreaming: false } : null
        );
        if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
      } else {
        console.error('[AgentChat] Error:', err);
        const msg = err instanceof Error ? err.message : t('common.unknown_error');
        addMessage({ role: 'assistant', content: t('chat.error_prefix', { msg }) });
        showToast('error', msg);
      }
    } finally {
      isSubmittingRef.current = false;
      if (!delegatedToRunEngine) {
        setIsLoading(false);
        setStatus('idle');
        setStreamingMessage(null);
        setAbortController(null);
      }
      inputRef.current?.focus();
    }
  }, [
    input,
    isLoading,
    messages,
    agent,
    agentId,
    addMessage,
    setStatus,
    buildSystemPrompt,
    useToolsStream,
    activeTools,
    toolDefs,
    enabledMcpIds,
    scrollToBottom,
    currentSessionId,
  ]);

  const handleAbort = useCallback(() => {
    if (activeRunId) {
      void abortRun(activeRunId);
      return;
    }
    if (abortController) abortController.abort();
  }, [abortController, activeRunId]);

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
          citationMap: buildCitationMap(toolCalls),
          thinking: m.thinking,
        };
      }),
    [messages]
  );

  const messageGroups = useMemo(() => {
    const liveStreamingMessage = streamingMessage
      ? { ...streamingMessage, citationMap: buildCitationMap(streamingMessage.toolCalls) }
      : null;
    const all = liveStreamingMessage ? [...chatMessages, liveStreamingMessage] : chatMessages;
    return groupMessagesByRole(all);
  }, [chatMessages, streamingMessage]);

  const handleClear = useCallback(() => {
    if (window.confirm(t('chat.clear_confirm'))) {
      clearMessages();
      showToast('info', t('agent.chat_cleared'));
    }
  }, [clearMessages, t]);

  if (!agent) {
    return (
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--secondary-text)' }}>
        {t('ui.loading')}
      </div>
    );
  }

  const agentAvatarSrc = agent ? `/agents/sprite_${agent.iconIndex}.png` : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      {/* Fixed Header */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-surface)' }}
      >
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[var(--dome-surface)] transition-colors shrink-0"
              title={t('agent.back')}
            >
              <ChevronLeft className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
          )}
          <div
            className="w-8 h-8 rounded-xl overflow-hidden shrink-0"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <img
              src={`/agents/sprite_${agent.iconIndex}.png`}
              alt={agent.name}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
              {agent.name}
            </div>
            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {providerInfo}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            style={{ color: 'var(--dome-text-muted)', background: 'var(--dome-bg)' }}
            title={t('agent.clear_chat')}
          >
            {t('agent.clear_chat')}
          </button>
        </div>
      </header>

      {/* Scrollable messages area - fixed in middle */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5 flex flex-col gap-5"
      >
        {chatMessages.length === 0 && !streamingMessage ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div
              className="w-14 h-14 rounded-2xl overflow-hidden"
              style={{ background: 'var(--dome-accent-bg)' }}
            >
              <img
                src={`/agents/sprite_${agent.iconIndex}.png`}
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
                {agent.name}
              </h2>
              <p className="text-sm mt-1 max-w-md" style={{ color: 'var(--dome-text-muted)' }}>
                {agent.description || t('agent.empty_chat')}
              </p>
            </div>
          </div>
        ) : (
          <>
            {messageGroups.map((group, index) => (
              <ChatMessageGroup
                key={`group-${index}-${group[0]?.id || index}`}
                messages={group}
                showAvatar={false}
                assistantAvatarSrc={agentAvatarSrc}
              />
            ))}
            {isLoading && !streamingMessage ? (
              <div className="flex gap-3">
                <img
                  src={`/agents/sprite_${agent.iconIndex}.png`}
                  alt=""
                  className="w-6 h-6 object-contain rounded"
                />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-[var(--bg-secondary)] px-4 py-3">
                  <ReadingIndicator className="opacity-60" style={{ color: 'var(--secondary-text)' }} />
                  <span className="text-[13px]" style={{ color: 'var(--secondary-text)' }}>
                    {t('chat.thinking')}
                  </span>
                </div>
              </div>
            ) : null}
            {error ? (
              <p className="text-sm" style={{ color: 'var(--error)' }}>
                {error}
              </p>
            ) : null}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed Input */}
      <AgentChatInput
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        isLoading={isLoading}
        onSend={handleSend}
        onAbort={handleAbort}
        placeholder={`Pregunta a ${agent.name}...`}
        mcpServerIds={agent.mcpServerIds ?? []}
        toolIds={agent.toolIds ?? []}
        disabledMcpIds={disabledMcpIds}
        disabledToolIds={disabledToolIds}
        onToggleMcp={(id) =>
          setDisabledMcpIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onToggleTool={(id) =>
          setDisabledToolIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        hasAgentFunctions={hasAgentTools}
      />
    </div>
  );
}
