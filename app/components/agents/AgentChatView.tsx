'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { ManyAgent } from '@/types';
import { getManyAgentById } from '@/lib/agents/api';
import { useAgentChatStore } from '@/lib/store/useAgentChatStore';
import {
  getAIConfig,
  chatWithToolsStream,
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
import AgentChatInput from './AgentChatInput';

const RESOURCE_LINK_INSTRUCTION = `
When mentioning a resource (document, note, PDF, video, etc.) that the user can open, format it as: [Ver: Title](dome://resource/RESOURCE_ID/TYPE). Use the exact resource ID and type from your tool results. Types: note, pdf, url, youtube, notebook, docx, document, excel, video, audio, image.

When mentioning a Studio output (mindmap, quiz, guide, FAQ, timeline, table, flashcards, audio, video, research), format it as: [Ver: Title](dome://studio/OUTPUT_ID/TYPE).`;

interface AgentChatViewProps {
  agentId: string;
}

export default function AgentChatView({ agentId }: AgentChatViewProps) {
  const [agent, setAgent] = useState<ManyAgent | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [providerInfo, setProviderInfo] = useState('');
  const [supportsTools, setSupportsTools] = useState(false);
  const [disabledMcpIds, setDisabledMcpIds] = useState<Set<string>>(new Set());
  const [disabledToolIds, setDisabledToolIds] = useState<Set<string>>(new Set());
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
                  agent.skillIds!.includes(s.id) && s.enabled !== false
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
    let toolCallsData: ToolCallData[] = [];

    try {
      const config = await getAIConfig();
      if (!config) {
        addMessage({
          role: 'assistant',
          content: 'AI no está configurado. Ve a **Ajustes > AI** para configurar un proveedor.',
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
        setStreamingMessage({
          id: `streaming-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          toolCalls: [],
          streamingLabel: 'Procesando...',
        });

        const threadId = `agent_${agentId}_${Date.now()}`;
        for await (const chunk of chatWithToolsStream(apiMessages, activeTools, {
          signal: controller.signal,
          threadId,
          skipHitl: true,
          mcpServerIds: enabledMcpIds.length > 0 ? enabledMcpIds : undefined,
        })) {
          if (chunk.type === 'text' && chunk.text) {
            fullResponse += chunk.text;
            setStreamingMessage((prev) =>
              prev ? { ...prev, content: fullResponse, toolCalls: toolCallsData } : null
            );
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            const tc: ToolCallData = {
              id: chunk.toolCall.id,
              name: chunk.toolCall.name,
              arguments: (() => {
                try {
                  return typeof chunk.toolCall.arguments === 'string'
                    ? JSON.parse(chunk.toolCall.arguments)
                    : chunk.toolCall.arguments || {};
                } catch {
                  return {};
                }
              })(),
              status: 'running',
            };
            toolCallsData.push(tc);
            setStreamingMessage((prev) =>
              prev
                ? {
                    ...prev,
                    toolCalls: [...toolCallsData],
                    streamingLabel: `${chunk.toolCall.name?.replace(/_/g, ' ')}...`,
                  }
                : null
            );
          } else if (chunk.type === 'tool_result' && chunk.toolCallId != null) {
            const entry = toolCallsData.find((t) => t.id === chunk.toolCallId);
            if (entry) {
              entry.status = 'success';
              entry.result = chunk.result;
            }
            setStreamingMessage((prev) =>
              prev ? { ...prev, toolCalls: [...toolCallsData] } : null
            );
          } else if (chunk.type === 'done') {
            setStreamingMessage((prev) =>
              prev ? { ...prev, isStreaming: false } : null
            );
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }
        if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
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
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        addMessage({ role: 'assistant', content: `Lo siento, hubo un problema: ${msg}` });
        showToast('error', msg);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
      setStatus('idle');
      setStreamingMessage(null);
      setAbortController(null);
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
  ]);

  const handleAbort = useCallback(() => {
    if (abortController) abortController.abort();
  }, [abortController]);

  const chatMessages: ChatMessageData[] = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    [messages]
  );

  const messageGroups = useMemo(() => {
    const all = streamingMessage ? [...chatMessages, streamingMessage] : chatMessages;
    return groupMessagesByRole(all);
  }, [chatMessages, streamingMessage]);

  const handleClear = useCallback(() => {
    if (window.confirm('¿Borrar todo el historial del chat?')) {
      clearMessages();
      showToast('info', 'Chat vaciado');
    }
  }, [clearMessages]);

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--secondary-text)' }}>
        Cargando agente...
      </div>
    );
  }

  const agentAvatarSrc = agent ? `/agents/sprite_${agent.iconIndex}.png` : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Fixed Header */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
      >
        <div className="flex items-center gap-3">
          <img
            src={`/agents/sprite_${agent.iconIndex}.png`}
            alt=""
            className="w-8 h-8 object-contain rounded-lg"
          />
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--primary-text)' }}>
              {agent.name}
            </h1>
            <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
              {providerInfo}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs px-2 py-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--secondary-text)' }}
          >
            Vaciar chat
          </button>
        </div>
      </header>

      {/* Scrollable messages area - fixed in middle */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5"
      >
        {chatMessages.length === 0 && !streamingMessage ? (
          <div className="py-16 text-center">
            <img
              src={`/agents/sprite_${agent.iconIndex}.png`}
              alt=""
              className="w-16 h-16 mx-auto mb-4 object-contain opacity-80"
            />
            <p className="text-[15px] font-medium" style={{ color: 'var(--primary-text)' }}>
              {agent.name}
            </p>
            <p
              className="mx-auto mt-1 max-w-md text-[13px]"
              style={{ color: 'var(--tertiary-text)' }}
            >
              {agent.description || 'Chatea con tu agente especializado.'}
            </p>
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
                    Pensando...
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
