'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Send, Square, PlusCircle, ChevronDown, Cpu, User, Bot } from 'lucide-react';
import type { AgentTeam, ManyAgent } from '@/types';
import { getAgentTeamById } from '@/lib/agent-team/api';
import { getManyAgentById } from '@/lib/agents/api';
import { useAgentTeamStore } from '@/lib/store/useAgentTeamStore';
import type { TeamChatMessage } from '@/lib/store/useAgentTeamStore';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { db } from '@/lib/db/client';
import ReactMarkdown from 'react-markdown';

interface AgentTeamChatProps {
  teamId: string;
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'El supervisor está analizando la tarea...',
  delegating: 'Delegando a los agentes del equipo...',
  synthesizing: 'Sintetizando respuestas...',
};

function MessageBubble({ message, memberAgents }: { message: TeamChatMessage; memberAgents: ManyAgent[] }) {
  const isUser = message.role === 'user';
  const agent = message.agentId
    ? memberAgents.find((a) => a.id === message.agentId)
    : null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {/* Avatar */}
      <div className="shrink-0 mb-1">
        {isUser ? (
          <div
            className="w-6 h-6 rounded flex items-center justify-center opacity-80"
            style={{ background: 'var(--dome-surface)' }}
          >
            <User className="w-3.5 h-3.5" style={{ color: 'var(--dome-text)' }} />
          </div>
        ) : agent ? (
          <div
            className="w-6 h-6 rounded overflow-hidden opacity-90"
            style={{ background: 'transparent' }}
          >
            <img
              src={`/agents/sprite_${agent.iconIndex}.png`}
              alt={agent.name}
              className="w-full h-full object-contain grayscale"
            />
          </div>
        ) : (
          <div
            className="w-6 h-6 rounded flex items-center justify-center opacity-70"
            style={{ background: 'transparent' }}
          >
            <Cpu className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Label */}
        {!isUser && (
          <div className="flex items-center gap-1.5 ml-1 mb-0.5 opacity-80">
            {agent ? (
              <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--dome-text)' }}>
                {agent.name}
              </span>
            ) : message.phase === 'planning' ? (
              <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--dome-text-muted)' }}>
                Planning
              </span>
            ) : message.phase === 'synthesis' ? (
              <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--dome-text)' }}>
                Synthesis
              </span>
            ) : (
              <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--dome-text-muted)' }}>
                System
              </span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`px-4 py-2.5 text-[14px] leading-relaxed relative ${isUser ? 'bg-[var(--dome-surface)] text-[var(--dome-text)]' : 'bg-transparent text-[var(--dome-text)]'}`}
          style={{
            border: isUser ? '1px solid var(--dome-border)' : 'none',
            borderRadius: isUser ? '8px 8px 0px 8px' : '0px 8px 8px 8px',
            borderLeft: !isUser ? '2px solid var(--dome-border)' : 'none',
            paddingLeft: !isUser ? '1rem' : '1rem',
          }}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert" style={{ color: 'var(--dome-text)' }}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        <span className="text-[10px] mt-0.5 opacity-50" style={{ color: 'var(--dome-text-muted)' }}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default function AgentTeamChat({ teamId }: AgentTeamChatProps) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [team, setTeam] = useState<AgentTeam | null>(null);
  const [memberAgents, setMemberAgents] = useState<ManyAgent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const dbSessionIdRef = useRef<string | null>(null);
  const streamIdRef = useRef<string | null>(null);

  const { setTeam: setStoreTeam, messages, addMessage, updateLastAssistantMessage, status, setStatus, setActiveAgentLabel, startNewChat, currentSessionId } =
    useAgentTeamStore();
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const currentResource = useAppStore((s) => s.currentResource);

  const effectiveResourceId =
    currentResource?.id ||
    (pathname?.startsWith('/workspace') ? searchParams.get('id') : null);

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
  }, [messages, streamingContent, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const userMessage = input.trim();
    if (!userMessage || isLoading || isSubmittingRef.current || !team) return;

    isSubmittingRef.current = true;
    setInput('');
    setIsLoading(true);
    setStatus('thinking');
    setStreamingContent('');

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

      // Add placeholder assistant message for streaming
      addMessage({ role: 'assistant', content: '', phase: 'synthesis' });

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

      const unsubChunk = window.electron.ai.onStreamChunk((data) => {
        if (data.streamId !== streamId) return;
        if (data.done) return;
        if (data.agentName !== undefined) {
          if (data.agentName) {
            setStatus('delegating');
            setActiveAgentLabel(data.agentName);
          } else {
            setStatus('synthesizing');
            setActiveAgentLabel(null);
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
          db.appendChatTrace({
            sessionId: dbSessionIdRef.current,
            type: 'tool_call',
            toolName: data.toolCall.name,
            toolArgs: args,
            decision: data.agentName ?? undefined,
          }).catch(() => {});
        }
        if (data.type === 'tool_result' && dbSessionIdRef.current) {
          db.appendChatTrace({
            sessionId: dbSessionIdRef.current,
            type: 'tool_result',
            toolName: data.agentName ?? null,
            result: data.result ?? '',
          }).catch(() => {});
        }
        if (data.chunk) {
          accumulated += data.chunk;
          setStreamingContent(accumulated);
          updateLastAssistantMessage(accumulated);
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
      });

      unsubChunk();
      setStreamingContent('');
      if (dbSessionIdRef.current && accumulated) {
        await db.addChatMessage({
          sessionId: dbSessionIdRef.current,
          role: 'assistant',
          content: accumulated,
          metadata: {
            mode: 'team',
            teamId: team.id,
          },
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errMsg = err instanceof Error ? err.message : 'Error desconocido';
        showToast('error', errMsg);
        updateLastAssistantMessage(`Error: ${errMsg}`);
      }
    } finally {
      setIsLoading(false);
      setStatus('idle');
      setActiveAgentLabel(null);
      setAbortController(null);
      dbSessionIdRef.current = null;
      streamIdRef.current = null;
      isSubmittingRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [
    input,
    isLoading,
    team,
    messages,
    addMessage,
    updateLastAssistantMessage,
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
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 flex flex-col gap-5">
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
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} memberAgents={memberAgents} />
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
                {STATUS_LABELS[status] ?? 'Procesando...'}
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
          className="flex items-end gap-2 rounded-lg px-3 py-2 transition-colors focus-within:border-[var(--dome-text-muted)]"
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
          <button
            onClick={isLoading ? handleStop : handleSend}
            disabled={!isLoading && !input.trim()}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded transition-all mb-0.5"
            style={{
              background: isLoading
                ? 'transparent'
                : input.trim()
                  ? 'var(--dome-text)'
                  : 'transparent',
              color: isLoading ? '#ef4444' : input.trim() ? 'var(--dome-bg)' : 'var(--dome-text-muted)',
              border: isLoading ? '1px solid #ef4444' : 'none'
            }}
          >
            {isLoading ? (
              <Square className="w-3.5 h-3.5" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1 text-[10px] opacity-50" style={{ color: 'var(--dome-text-muted)' }}>
          <span>Agent Team Chat</span>
          <span>Enter para enviar · Shift+Enter para nueva línea</span>
        </div>
      </div>
    </div>
  );
}
