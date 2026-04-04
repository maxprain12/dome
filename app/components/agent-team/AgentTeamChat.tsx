'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Send, Square, PlusCircle, Plug2, Cpu } from 'lucide-react';
import type { AgentTeam, ManyAgent } from '@/types';
import { getAgentTeamById } from '@/lib/agent-team/api';
import { getManyAgentById } from '@/lib/agents/api';
import { useAgentTeamStore } from '@/lib/store/useAgentTeamStore';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { db } from '@/lib/db/client';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';
import { buildCitationMap } from '@/lib/utils/citations';
import { collectTeamMcpServerIds } from '@/lib/ai/shared-capabilities';
import { inferMcpServerForTool, loadMcpServersSetting } from '@/lib/mcp/settings';
import type { MCPServerConfig } from '@/types';
import { useTranslation } from 'react-i18next';

interface AgentTeamChatProps {
  teamId: string;
}

export default function AgentTeamChat({ teamId }: AgentTeamChatProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [team, setTeam] = useState<AgentTeam | null>(null);
  const [memberAgents, setMemberAgents] = useState<ManyAgent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const dbSessionIdRef = useRef<string | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const capabilitiesButtonRef = useRef<HTMLButtonElement>(null);
  const capabilitiesDropdownRef = useRef<HTMLDivElement>(null);
  const [capabilitiesDropdownRect, setCapabilitiesDropdownRect] = useState<{ top: number; left: number; above?: boolean } | null>(null);
  const currentAgentLabelRef = useRef<string | null>(null);

  const { setTeam: setStoreTeam, messages, addMessage, status, setStatus, setActiveAgentLabel, startNewChat, currentSessionId } =
    useAgentTeamStore();
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const currentResource = useAppStore((s) => s.currentResource);
  const teamProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const effectiveResourceId =
    currentResource?.id ||
    (pathname?.startsWith('/workspace') ? searchParams.get('id') : null);
  const teamMcpServerIds = useMemo(
    () => collectTeamMcpServerIds(team, memberAgents),
    [team, memberAgents]
  );

  useEffect(() => {
    setStoreTeam(teamId);
    getAgentTeamById(teamId).then((t) => {
      setTeam(t);
      if (t) {
        Promise.all(t.memberAgentIds.map(getManyAgentById)).then((agents) =>
          setMemberAgents(agents.filter((a): a is ManyAgent => a !== null))
        );
      }
    });
  }, [teamId, setStoreTeam]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  useEffect(() => {
    if (!showCapabilities) {
      setCapabilitiesDropdownRect(null);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        capabilitiesDropdownRef.current &&
        !capabilitiesDropdownRef.current.contains(target) &&
        capabilitiesButtonRef.current &&
        !capabilitiesButtonRef.current.contains(target)
      ) {
        setShowCapabilities(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCapabilities]);

  useEffect(() => {
    if (!showCapabilities || !capabilitiesButtonRef.current || typeof window === 'undefined') {
      return;
    }
    const rect = capabilitiesButtonRef.current.getBoundingClientRect();
    const estimatedHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setCapabilitiesDropdownRect({
      top: showAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      above: showAbove,
    });
  }, [showCapabilities]);

  const handleSend = useCallback(async () => {
    const userMessage = input.trim();
    if (!userMessage || isLoading || isSubmittingRef.current || !team) return;

    isSubmittingRef.current = true;
    setInput('');
    setIsLoading(true);
    setStatus('thinking');
    setStreamingMessage(null);
    currentAgentLabelRef.current = null;

    const controller = new AbortController();
    setAbortController(controller);

    addMessage({ role: 'user', content: userMessage });
    scrollToBottom();

      const streamId = `team-${Date.now()}`;
      streamIdRef.current = streamId;

    try {
      if (!window.electron?.ai) {
        throw new Error('AI no disponible');
      }

      const historyMessages = messages.slice(-20).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));
      historyMessages.push({ role: 'user', content: userMessage });

      if (db.isAvailable()) {
        const sessionResult = await db.createChatSession({
          id: currentSessionId || `${team.id}:${Date.now()}`,
          agentId: null,
          resourceId: effectiveResourceId ?? null,
          mode: 'team',
          contextId: team.id,
          title: team.name,
          threadId: streamId,
          toolIds: memberAgents.flatMap((agent) => agent.toolIds ?? []),
          mcpServerIds: memberAgents.flatMap((agent) => agent.mcpServerIds ?? []),
          projectId: teamProjectId,
        });
        if (sessionResult.success && sessionResult.data) {
          dbSessionIdRef.current = sessionResult.data.id;
          await db.addChatMessage({
            sessionId: sessionResult.data.id,
            role: 'user',
            content: userMessage,
            metadata: {
              teamId: team.id,
              mode: 'team',
              pathname,
              homeSidebarSection,
              currentFolderId,
              currentResourceId: effectiveResourceId,
              currentResourceTitle: currentResource?.title ?? null,
            },
          });
        }
      }

      let accumulated = '';
      let streamingToolCalls: ToolCallData[] = [];
      const pendingTraceEntries: Array<{
        type: 'tool_call' | 'tool_result';
        toolName?: string | null;
        toolArgs?: Record<string, unknown>;
        result?: unknown;
        mcpServerId?: string | null;
        decision?: string | null;
      }> = [];
      const configuredMcpServers: MCPServerConfig[] = teamMcpServerIds.length > 0
        ? await loadMcpServersSetting()
        : [];

      const unsubChunk = window.electron.ai.onStreamChunk((data) => {
        if (data.streamId !== streamId) return;
        if (data.done) return;
        if (data.agentName !== undefined) {
          if (data.agentName) {
            setStatus('delegating');
            setActiveAgentLabel(data.agentName);
            currentAgentLabelRef.current = data.agentName;
          } else {
            setStatus('synthesizing');
            setActiveAgentLabel(null);
            currentAgentLabelRef.current = 'Síntesis';
          }
        }
        if (data.type === 'tool_call' && data.toolCall && dbSessionIdRef.current) {
          const args = (() => {
            try {
              return typeof data.toolCall?.arguments === 'string'
                ? JSON.parse(data.toolCall.arguments)
                : {};
            } catch {
              return {};
            }
          })();
          const toolCallEntry: ToolCallData = {
            id: data.toolCall.id,
            name: data.toolCall.name,
            arguments: args,
            status: 'running',
          };
          streamingToolCalls = [...streamingToolCalls, toolCallEntry];
          const mcpServer = inferMcpServerForTool(configuredMcpServers, data.toolCall.name);
          pendingTraceEntries.push({
            type: 'tool_call',
            toolName: data.toolCall.name,
            toolArgs: args,
            mcpServerId: mcpServer?.name ?? null,
            decision: data.agentName ?? undefined,
          });
          setStreamingMessage((prev) => ({
            id: prev?.id || `team-stream-${Date.now()}`,
            role: 'assistant',
            content: accumulated,
            timestamp: prev?.timestamp || Date.now(),
            isStreaming: true,
            toolCalls: streamingToolCalls,
            agentLabel: currentAgentLabelRef.current ?? undefined,
            streamingLabel: data.agentName ? `${data.agentName} ejecutando tools...` : 'Ejecutando tools...',
          }));
        }
        if (data.type === 'tool_result' && dbSessionIdRef.current) {
          if (data.toolCallId) {
            streamingToolCalls = streamingToolCalls.map((toolCall) =>
              toolCall.id === data.toolCallId
                ? { ...toolCall, status: 'success', result: data.result ?? '' }
                : toolCall
            );
          }
          const matchingTool = streamingToolCalls.find((toolCall) => toolCall.id === data.toolCallId);
          const mcpServer = matchingTool
            ? inferMcpServerForTool(configuredMcpServers, matchingTool.name)
            : undefined;
          pendingTraceEntries.push({
            type: 'tool_result',
            toolName: matchingTool?.name ?? data.agentName ?? null,
            result: data.result ?? '',
            mcpServerId: mcpServer?.name ?? null,
          });
          setStreamingMessage((prev) =>
            prev
              ? {
                  ...prev,
                  toolCalls: streamingToolCalls,
                }
              : null
          );
        }
        if (data.chunk) {
          accumulated += data.chunk;
          setStreamingMessage((prev) => ({
            id: prev?.id || `team-stream-${Date.now()}`,
            role: 'assistant',
            content: accumulated,
            timestamp: prev?.timestamp || Date.now(),
            isStreaming: true,
            toolCalls: streamingToolCalls,
            agentLabel: currentAgentLabelRef.current ?? 'Síntesis',
          }));
        }
      });

      await window.electron.invoke('ai:team:stream', {
        streamId,
        teamId: team.id,
        messages: historyMessages,
        memberAgentIds: team.memberAgentIds,
        supervisorInstructions: team.supervisorInstructions,
        currentResourceId: effectiveResourceId,
        currentResourceTitle: currentResource?.title ?? null,
        currentFolderId,
        pathname,
        homeSidebarSection,
        teamToolIds: team.toolIds ?? [],
        teamMcpServerIds: team.mcpServerIds ?? [],
        projectId: teamProjectId,
      });

      unsubChunk();
      setStreamingMessage(null);
      if (accumulated) {
        addMessage({
          role: 'assistant',
          content: accumulated,
          toolCalls: streamingToolCalls,
          agentName: currentAgentLabelRef.current ?? undefined,
          phase: currentAgentLabelRef.current ? 'synthesis' : undefined,
        });
      }
      if (dbSessionIdRef.current && accumulated) {
        const messageResult = await db.addChatMessage({
          sessionId: dbSessionIdRef.current,
          role: 'assistant',
          content: accumulated,
          toolCalls: streamingToolCalls,
          metadata: {
            mode: 'team',
            teamId: team.id,
          },
        });
        const messageId = messageResult.success && messageResult.data ? messageResult.data.id : null;
        for (const trace of pendingTraceEntries) {
          await db.appendChatTrace({
            sessionId: dbSessionIdRef.current,
            messageId,
            type: trace.type,
            toolName: trace.toolName,
            toolArgs: trace.toolArgs,
            result: trace.result,
            mcpServerId: trace.mcpServerId,
            decision: trace.decision,
          });
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errMsg = err instanceof Error ? err.message : 'Error desconocido';
        showToast('error', errMsg);
        addMessage({ role: 'assistant', content: `Error: ${errMsg}`, agentName: 'Sistema' });
      }
    } finally {
      setIsLoading(false);
      setStatus('idle');
      setActiveAgentLabel(null);
      setAbortController(null);
      setStreamingMessage(null);
      dbSessionIdRef.current = null;
      streamIdRef.current = null;
      currentAgentLabelRef.current = null;
      isSubmittingRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [
    input,
    isLoading,
    team,
    messages,
    addMessage,
    setStatus,
    setActiveAgentLabel,
    scrollToBottom,
    effectiveResourceId,
    currentResource,
    currentFolderId,
    pathname,
    homeSidebarSection,
    memberAgents,
    currentSessionId,
    teamMcpServerIds,
    teamProjectId,
  ]);

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      if (streamIdRef.current) {
        window.electron?.invoke('ai:team:abort', streamIdRef.current).catch(() => {});
      }
    }
  }, [abortController]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const chatMessages = useMemo<ChatMessageData[]>(
    () =>
      messages.map((message) => {
        const toolCalls = message.toolCalls as ToolCallData[] | undefined;
        return {
          id: message.id,
          role: message.role === 'system' ? 'assistant' : message.role,
          content: message.content,
          timestamp: message.timestamp,
          toolCalls,
          citationMap: buildCitationMap(toolCalls),
          agentLabel:
            message.agentName ||
            (message.phase === 'planning'
              ? 'Planificación'
              : message.phase === 'delegation'
                ? 'Delegación'
                : message.phase === 'synthesis'
                  ? 'Síntesis'
                  : undefined),
        };
      }),
    [messages]
  );

  const messageGroups = useMemo(() => {
    const liveStreamingMessage = streamingMessage
      ? { ...streamingMessage, citationMap: buildCitationMap(streamingMessage.toolCalls) }
      : null;
    const allMessages = liveStreamingMessage ? [...chatMessages, liveStreamingMessage] : chatMessages;
    return groupMessagesByRole(allMessages);
  }, [chatMessages, streamingMessage]);

  if (!team) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-surface)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl overflow-hidden shrink-0"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <img
              src={`/agents/sprite_${team.iconIndex}.png`}
              alt={team.name}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
              {team.name}
            </div>
            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {memberAgents.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1"
                >
                  <img src={`/agents/sprite_${a.iconIndex}.png`} alt="" className="w-3 h-3 object-contain" />
                  {a.name}
                </span>
              )).reduce<React.ReactNode[]>((acc, el, i) => {
                if (i > 0) acc.push(<span key={`sep-${i}`}>·</span>);
                acc.push(el);
                return acc;
              }, [])}
            </div>
          </div>
        </div>
        <button
          onClick={startNewChat}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
          style={{ color: 'var(--dome-text-muted)', background: 'var(--dome-bg)' }}
          title="Nueva conversación"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Nueva
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5 flex flex-col gap-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div
              className="w-14 h-14 rounded-2xl overflow-hidden"
              style={{ background: 'var(--dome-accent-bg)' }}
            >
              <img
                src={`/agents/sprite_${team.iconIndex}.png`}
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
                {team.name}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                {team.description || 'Equipo de agentes especializados'}
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--dome-text-muted)' }}>
                {memberAgents.length} agentes listos para colaborar
              </p>
            </div>
          </div>
        ) : (
          messageGroups.map((group, index) => (
            <ChatMessageGroup
              key={`team-group-${index}-${group[0]?.id || index}`}
              messages={group}
              showAvatar={false}
            />
          ))
        )}

        {/* Status indicator */}
        {isLoading && (
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(99,102,241,0.12)' }}
            >
              <Cpu className="w-3.5 h-3.5" style={{ color: 'var(--dome-accent, #6366f1)' }} />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--dome-accent, #6366f1)', animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--dome-accent, #6366f1)', animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--dome-accent, #6366f1)', animationDelay: '300ms' }}
                />
              </div>
              <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {status === 'thinking'
                  ? t('agentTeam.status_thinking')
                  : status === 'delegating'
                    ? t('agentTeam.status_delegating')
                    : status === 'synthesizing'
                      ? t('agentTeam.status_synthesizing')
                      : t('chat.processing')}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderTop: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <div
          className="flex flex-col rounded-lg px-3 py-2 transition-colors focus-within:border-[var(--dome-text-muted)]"
          style={{
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Chatear con ${team.name}...`}
            rows={1}
            className="flex-1 resize-none outline-none bg-transparent text-[14px] leading-relaxed py-1"
            style={{
              color: 'var(--dome-text)',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="flex items-center gap-2">
              {teamMcpServerIds.length > 0 ? (
                <div className="relative">
                  <button
                    ref={capabilitiesButtonRef}
                    type="button"
                    onClick={() => setShowCapabilities(!showCapabilities)}
                    className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-all"
                    style={{
                      background: showCapabilities ? 'var(--dome-accent-bg)' : 'transparent',
                      color: showCapabilities ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                    }}
                  >
                    <Plug2 className="w-3.5 h-3.5" />
                    MCP
                  </button>
                  {showCapabilities && capabilitiesDropdownRect && typeof document !== 'undefined' && createPortal(
                    <div
                      ref={capabilitiesDropdownRef}
                      className="fixed min-w-[300px] max-h-[min(360px,60vh)] rounded-lg border shadow-lg py-2 overflow-y-auto"
                      style={{
                        top: capabilitiesDropdownRect.above ? undefined : capabilitiesDropdownRect.top,
                        bottom: capabilitiesDropdownRect.above ? window.innerHeight - capabilitiesDropdownRect.top : undefined,
                        left: capabilitiesDropdownRect.left,
                        backgroundColor: 'var(--dome-surface)',
                        borderColor: 'var(--dome-border)',
                        zIndex: 600,
                      }}
                    >
                      <div className="px-3 py-1">
                        <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                          MCP y tools globales
                        </div>
                        <McpCapabilitiesSection serverIds={teamMcpServerIds} />
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              ) : null}
            </div>
            <button
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && !input.trim()}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded transition-all"
              style={{
                background: isLoading
                  ? 'transparent'
                  : input.trim()
                    ? 'var(--dome-text)'
                    : 'transparent',
                color: isLoading ? '#ef4444' : input.trim() ? 'var(--dome-bg)' : 'var(--dome-text-muted)',
                border: isLoading ? '1px solid #ef4444' : 'none',
              }}
            >
              {isLoading ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center mt-2 px-1 text-[10px] opacity-50" style={{ color: 'var(--dome-text-muted)' }}>
          <span>Agent Team Chat</span>
          <span>Enter para enviar · Shift+Enter para nueva línea</span>
        </div>
      </div>
    </div>
  );
}
