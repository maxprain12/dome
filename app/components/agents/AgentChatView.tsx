'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { ManyAgent } from '@/types';
import { getManyAgentById } from '@/lib/agents/api';
import { useAgentChatStore } from '@/lib/store/useAgentChatStore';
import type { PinnedResource } from '@/lib/store/useManyStore';
import {
  getAIConfig,
  createToolsForAgent,
  createLoadSkillTools,
  toOpenAIToolDefinitions,
  providerSupportsTools,
  type AIProviderType,
} from '@/lib/ai';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { db } from '@/lib/db/client';
import { appendSkillsMarkdown } from '@/lib/skills/append-markdown';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import ReadingIndicator from '@/components/chat/ReadingIndicator';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildCitationMap } from '@/lib/utils/citations';
import UnifiedChatInput from '@/components/chat/UnifiedChatInput';
import { UnifiedChatHeader } from '@/components/chat/UnifiedChatHeader';
import { UnifiedChatEmptyState } from '@/components/chat/UnifiedChatEmptyState';
import { UnifiedChatMessageArea } from '@/components/chat/UnifiedChatMessages';
import { ChevronLeft } from 'lucide-react';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { useTranslation } from 'react-i18next';
import {
  abortRun,
  getActiveRunBySession,
  startLangGraphRun,
  type PersistentRun,
} from '@/lib/automations/api';
import { CHAT_THINKING_ROTATION_KEYS } from '@/lib/chat/streamingLabels';
import { buildAttachmentPrefix } from '@/lib/chat/attachmentTypes';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { buildDomeSystemPrompt } from '@/lib/chat/buildDomeSystemPrompt';
import { useLangGraphRunStream } from '@/lib/chat/useLangGraphRunStream';

type AgentResourcePayload = {
  content?: string | null;
  summary?: string | null;
  transcription?: string | null;
  metadata?: Record<string, unknown> | null;
};

function getAgentResourceContext(resource: AgentResourcePayload): string {
  const scrapedContent =
    typeof resource.metadata?.scraped_content === 'string' ? resource.metadata.scraped_content : '';
  const metadataSummary = typeof resource.metadata?.summary === 'string' ? resource.metadata.summary : '';
  return (
    [resource.content, scrapedContent, resource.summary, resource.transcription, metadataSummary]
      .find((value) => typeof value === 'string' && value.trim().length > 0)
      ?.trim() || ''
  );
}

interface AgentChatViewProps {
  agentId: string;
  onBack?: () => void;
}

export default function AgentChatView({ agentId, onBack }: AgentChatViewProps) {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<ManyAgent | null>(null);
  const [input, setInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [providerInfo, setProviderInfo] = useState('');
  const [supportsTools, setSupportsTools] = useState(false);
  const [disabledMcpIds, setDisabledMcpIds] = useState<Set<string>>(new Set());
  const [disabledToolIds, setDisabledToolIds] = useState<Set<string>>(new Set());
  const [pinnedResources, setPinnedResources] = useState<PinnedResource[]>([]);
  const [pendingOneShotSkillId, setPendingOneShotSkillId] = useState<string | null>(null);
  const [activeStickySkillId, setActiveStickySkillId] = useState<string | null>(null);
  const thinkingLabelIdxRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const {
    setAgent: setStoreAgent,
    setStatus,
    messages,
    addMessage,
    clearMessages,
    currentSessionId,
    hydrateSession,
  } = useAgentChatStore();
  const chatProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');

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
    void load();
    window.addEventListener('dome:ai-config-changed', load);
    return () => window.removeEventListener('dome:ai-config-changed', load);
  }, []);

  const addPinnedResource = useCallback((r: PinnedResource) => {
    setPinnedResources((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
  }, []);
  const removePinnedResource = useCallback((id: string) => {
    setPinnedResources((prev) => prev.filter((x) => x.id !== id));
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
  }, [setStatus, t]);

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

  const handleRunStatus = useCallback(
    (run: PersistentRun) => {
      applyRunSnapshot(run);
    },
    [applyRunSnapshot],
  );

  const handleRunTerminal = useCallback(
    (run: PersistentRun) => {
      setActiveRunId(null);
      void refreshSessionFromDb();
      if (run.status === 'completed') {
        window.dispatchEvent(new Event('dome:resources-changed'));
      }
    },
    [refreshSessionFromDb],
  );

  useLangGraphRunStream({
    activeRunId,
    setStreamingMessage,
    onRunStatus: handleRunStatus,
    onRunTerminal: handleRunTerminal,
    t,
  });

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
    const baseInstructions =
      agent.systemInstructions?.trim() || agent.description || `You are ${agent.name}.`;

    let prompt = buildDomeSystemPrompt({ baseInstructions });

    if (agent.skillIds?.length && db.isAvailable()) {
      try {
        const skillsResult = await db.getAISkills();
        if (skillsResult.success && Array.isArray(skillsResult.data)) {
          prompt = appendSkillsMarkdown(prompt, agent.skillIds, skillsResult.data);
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
        thinkingLabelIdxRef.current = (thinkingLabelIdxRef.current + 1) % CHAT_THINKING_ROTATION_KEYS.length;
        const k = CHAT_THINKING_ROTATION_KEYS[thinkingLabelIdxRef.current] ?? 'chat.thinking_l1';
        return { ...prev, streamingLabel: t(k) };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isLoading, t]);

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
    const base = createToolsForAgent(enabledToolIds);
    base.push(...createLoadSkillTools());
    return base;
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
    const attPrefix = buildAttachmentPrefix(chatAttachments, t('chat.attachment_extraction_empty'));
    const textPart = input.trim();
    const userMessage = [attPrefix, textPart].filter((s) => s.length > 0).join('\n\n').trim();
    if (!userMessage || isLoading || isSubmittingRef.current || !agent) return;

    isSubmittingRef.current = true;
    thinkingLabelIdxRef.current = 0;
    setInput('');
    setChatAttachments([]);
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

      let systemPrompt = await buildSystemPrompt();

      const primarySkillId = pendingOneShotSkillId || activeStickySkillId;
      setPendingOneShotSkillId(null);

      if (pinnedResources.length > 0 && typeof window.electron?.ai?.tools?.resourceGet === 'function') {
        let pinnedBlock =
          '\n\n## Pinned Context Resources\nThe following resources have been pinned by the user. Use their content directly.\n';
        for (const resource of pinnedResources) {
          try {
            const result = await window.electron.ai.tools.resourceGet(resource.id, {
              includeContent: true,
              maxContentLength: 5000,
            });
            if (result?.success && result?.resource) {
              const r = result.resource;
              const content = getAgentResourceContext(r);
              pinnedBlock += `\n### [${resource.title}] (id: ${resource.id}, type: ${resource.type})\n`;
              if (content.trim()) {
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
        systemPrompt += pinnedBlock;
      }

      if (primarySkillId && db.isAvailable()) {
        try {
          const skillsResult = await db.getAISkills();
          if (skillsResult.success && Array.isArray(skillsResult.data)) {
            const s = skillsResult.data.find((x: { id?: string }) => x.id === primarySkillId) as
              | { name?: string; description?: string; prompt?: string }
              | undefined;
            if (s && String(s.prompt ?? '').trim()) {
              const name = s.name || 'unnamed';
              const desc = s.description || '';
              const prompt = s.prompt || '';
              systemPrompt += `\n\n## Active Skill\n### ${name}\n${desc ? `${desc}\n\n` : ''}${prompt}\n`;
            }
          }
        } catch {
          /* ignore */
        }
      }

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
          streamingLabel: t('chat.thinking_l1'),
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
          projectId: chatProjectId,
          skipHitl: true,
        });
        delegatedToRunEngine = true;
        setAbortController(null);
        setActiveRunId(run.id);
        applyRunSnapshot(run);
      } else {
        if (hasAgentTools && !hasLangGraph) {
          throw new Error(
            'Este agente usa herramientas y requiere LangGraph. Reinicia Dome o revisa la configuración.'
          );
        }
        const { chatStream } = await import('@/lib/ai');
        setStreamingMessage({
          id: `streaming-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        });
        for await (const chunk of chatStream(apiMessages, undefined, controller.signal)) {
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
    toolDefs,
    enabledMcpIds,
    scrollToBottom,
    currentSessionId,
    chatProjectId,
    applyRunSnapshot,
    t,
    chatAttachments,
    pinnedResources,
    pendingOneShotSkillId,
    activeStickySkillId,
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--bg)]">
      <UnifiedChatHeader
        startSlot={
          onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)]"
              title={t('agent.back')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : undefined
        }
        left={
          <img
            src={`/agents/sprite_${agent.iconIndex}.png`}
            alt={agent.name}
            className="h-full w-full object-contain p-0.5"
          />
        }
        title={agent.name}
        subtitle={providerInfo}
        actions={
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--secondary-text)] transition-colors hover:bg-[var(--bg-hover)]"
            title={t('agent.clear_chat')}
          >
            {t('agent.clear_chat')}
          </button>
        }
      />

      <UnifiedChatMessageArea
        ref={messagesContainerRef}
        className="px-4 py-4 flex flex-col gap-5"
      >
        {chatMessages.length === 0 && !streamingMessage ? (
          <UnifiedChatEmptyState
            avatar={
              <img
                src={`/agents/sprite_${agent.iconIndex}.png`}
                alt=""
                className="w-full h-full object-contain p-1"
              />
            }
            title={agent.name}
            description={agent.description || t('agent.empty_chat')}
          />
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
      </UnifiedChatMessageArea>

      {/* Fixed Input */}
      <UnifiedChatInput
        mode="agent"
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        isLoading={isLoading}
        onSend={handleSend}
        onAbort={handleAbort}
        placeholder={t('chat.ask_agent_placeholder', { name: agent.name })}
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
        attachments={chatAttachments}
        onAttachmentsChange={setChatAttachments}
        pinnedResources={pinnedResources}
        onAddPinnedResource={addPinnedResource}
        onRemovePinnedResource={removePinnedResource}
        pendingOneShotSkillId={pendingOneShotSkillId}
        onSetPendingOneShotSkill={setPendingOneShotSkillId}
        activeStickySkillId={activeStickySkillId}
        onSetActiveStickySkill={setActiveStickySkillId}
      />
    </div>
  );
}
