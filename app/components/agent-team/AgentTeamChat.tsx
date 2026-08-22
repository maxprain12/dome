'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { useLocation, useSearchParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { InformationCircleIcon, PlusSignCircleIcon } from '@hugeicons/core-free-icons';
import type { AgentTeam, ManyAgent } from '@/types';
import { getAgentTeamById } from '@/lib/agent-team/api';
import { getManyAgentById } from '@/lib/agents/api';
import { useAgentTeamStore } from '@/lib/store/useAgentTeamStore';
import type { TeamChatStatus } from '@/lib/store/useAgentTeamStore';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { db } from '@/lib/db/client';
import ChatMessageGroup from '@/components/chat/ChatMessageGroup';
import { UnifiedChatMessageArea } from '@/components/chat/UnifiedChatMessages';
import { UnifiedChatEmptyState } from '@/components/chat/UnifiedChatEmptyState';
import { groupMessagesByRole } from '@/lib/chat/groupMessagesByRole';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { buildCitationMap } from '@/lib/utils/citations';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';
import { collectTeamMcpServerIds } from '@/lib/ai/shared-capabilities';
import { inferMcpServerForTool, loadMcpServersSetting } from '@/lib/mcp/settings';
import type { MCPServerConfig } from '@/types';
import { useTranslation } from 'react-i18next';
import Toolbar from '@/components/shared/Toolbar';
import UnifiedChatInput from '@/components/chat/UnifiedChatInput';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';

interface AgentTeamChatProps {
  teamId: string;
}

const notNull = <T,>(value: T | null): value is T => value !== null;

type PendingTraceEntry = {
  type: 'tool_call' | 'tool_result';
  toolName?: string | null;
  toolArgs?: Record<string, unknown>;
  result?: unknown;
  mcpServerId?: string | null;
  decision?: string | null;
};

type TeamStreamChunkData = {
  streamId: string;
  type?: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'interrupt';
  toolCall?: { id: string; name: string; arguments: string };
  toolCallId?: string;
  result?: string;
  isError?: boolean;
  chunk?: string;
  done?: boolean;
  agentName?: string | null;
};

type TeamStreamMutableState = {
  accumulated: string;
  streamingToolCalls: ToolCallData[];
  pendingTraceEntries: PendingTraceEntry[];
};

type TeamChatHistoryItem = { role: string; content: string };

/** Map store messages + current user turn into the team stream history payload. */
function buildTeamHistoryMessages(
  messages: TeamChatHistoryItem[],
  userMessage: string,
): Array<{ role: string; content: string }> {
  const historyMessages = messages.slice(-20).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));
  historyMessages.push({ role: 'user', content: userMessage });
  return historyMessages;
}

/** Create/reuse the team DB session and persist the user message when DB is available. */
async function ensureTeamSessionAndUserMessage(opts: {
  team: AgentTeam;
  streamId: string;
  userMessage: string;
  currentSessionId: string | null;
  effectiveResourceId: string | null;
  teamProjectId: string;
  pathname: string;
  homeSidebarSection: string | null;
  currentFolderId: string | null;
  currentResourceTitle: string | null;
  dbSessionIdRef: { current: string | null };
}): Promise<void> {
  if (!db.isAvailable()) return;

  const sessionResult = await db.createChatSession({
    id: opts.currentSessionId || `${opts.team.id}:${Date.now()}`,
    agentId: null,
    resourceId: opts.effectiveResourceId ?? null,
    mode: 'team',
    contextId: opts.team.id,
    title: opts.team.name,
    threadId: opts.streamId,
    toolIds: [],
    mcpServerIds: opts.team.mcpServerIds ?? [],
    projectId: opts.teamProjectId,
  });
  if (!sessionResult.success || !sessionResult.data) return;

  opts.dbSessionIdRef.current = sessionResult.data.id;
  await db.addChatMessage({
    sessionId: sessionResult.data.id,
    role: 'user',
    content: opts.userMessage,
    metadata: {
      teamId: opts.team.id,
      mode: 'team',
      pathname: opts.pathname,
      homeSidebarSection: opts.homeSidebarSection,
      currentFolderId: opts.currentFolderId,
      currentResourceId: opts.effectiveResourceId,
      currentResourceTitle: opts.currentResourceTitle,
    },
  });
}

async function loadTeamConfiguredMcpServers(
  teamMcpServerIds: string[],
  disabledMcpIds: Set<string>,
): Promise<MCPServerConfig[]> {
  if (teamMcpServerIds.length === 0) return [];
  return (await loadMcpServersSetting()).filter((server) => !disabledMcpIds.has(server.name));
}

function parseStreamingToolArgs(raw: string | undefined): Record<string, unknown> {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function applyTeamAgentNameFromChunk(
  agentName: string | null | undefined,
  setStatus: (status: TeamChatStatus) => void,
  setActiveAgentLabel: (label: string | null) => void,
  currentAgentLabelRef: { current: string | null },
): void {
  if (agentName === undefined) return;
  if (agentName) {
    setStatus('delegating');
    setActiveAgentLabel(agentName);
    currentAgentLabelRef.current = agentName;
    return;
  }
  setStatus('synthesizing');
  setActiveAgentLabel(null);
  currentAgentLabelRef.current = 'Síntesis';
}

function handleTeamToolCallChunk(
  data: TeamStreamChunkData,
  state: TeamStreamMutableState,
  configuredMcpServers: MCPServerConfig[],
  currentAgentLabelRef: { current: string | null },
  setStreamingMessage: Dispatch<SetStateAction<ChatMessageData | null>>,
): void {
  if (data.type !== 'tool_call' || !data.toolCall) return;

  const args = parseStreamingToolArgs(data.toolCall.arguments);
  const toolCallEntry: ToolCallData = {
    id: data.toolCall.id,
    name: data.toolCall.name,
    arguments: args,
    status: 'running',
  };
  state.streamingToolCalls = [...state.streamingToolCalls, toolCallEntry];
  const mcpServer = inferMcpServerForTool(configuredMcpServers, data.toolCall.name);
  state.pendingTraceEntries.push({
    type: 'tool_call',
    toolName: data.toolCall.name,
    toolArgs: args,
    mcpServerId: mcpServer?.name ?? null,
    decision: data.agentName ?? undefined,
  });
  setStreamingMessage((prev) => ({
    id: prev?.id || `team-stream-${Date.now()}`,
    role: 'assistant',
    content: state.accumulated,
    timestamp: prev?.timestamp || Date.now(),
    isStreaming: true,
    toolCalls: state.streamingToolCalls,
    agentLabel: currentAgentLabelRef.current ?? undefined,
    streamingLabel: data.agentName ? `${data.agentName} ejecutando tools...` : 'Ejecutando tools...',
  }));
}

function updateToolCallFromResult(
  toolCalls: ToolCallData[],
  toolCallId: string | undefined,
  data: TeamStreamChunkData,
): ToolCallData[] {
  if (!toolCallId) return toolCalls;
  return toolCalls.map((toolCall) => {
    if (toolCall.id !== toolCallId) return toolCall;
    if (data.isError) {
      return { ...toolCall, status: 'error', result: data.result ?? '', error: data.result ?? '' };
    }
    return { ...toolCall, status: 'success', result: data.result ?? '' };
  });
}

function handleTeamToolResultChunk(
  data: TeamStreamChunkData,
  state: TeamStreamMutableState,
  configuredMcpServers: MCPServerConfig[],
  setStreamingMessage: Dispatch<SetStateAction<ChatMessageData | null>>,
): void {
  if (data.type !== 'tool_result') return;

  state.streamingToolCalls = updateToolCallFromResult(
    state.streamingToolCalls,
    data.toolCallId,
    data,
  );
  const matchingTool = state.streamingToolCalls.find((toolCall) => toolCall.id === data.toolCallId);
  const mcpServer = matchingTool
    ? inferMcpServerForTool(configuredMcpServers, matchingTool.name)
    : undefined;
  state.pendingTraceEntries.push({
    type: 'tool_result',
    toolName: matchingTool?.name ?? data.agentName ?? null,
    result: data.result ?? '',
    mcpServerId: mcpServer?.name ?? null,
  });
  setStreamingMessage((prev) =>
    prev
      ? {
          ...prev,
          toolCalls: state.streamingToolCalls,
        }
      : null
  );
}

function handleTeamTextChunk(
  data: TeamStreamChunkData,
  state: TeamStreamMutableState,
  currentAgentLabelRef: { current: string | null },
  setStreamingMessage: Dispatch<SetStateAction<ChatMessageData | null>>,
): void {
  if (!data.chunk) return;
  state.accumulated += data.chunk;
  setStreamingMessage((prev) => ({
    id: prev?.id || `team-stream-${Date.now()}`,
    role: 'assistant',
    content: state.accumulated,
    timestamp: prev?.timestamp || Date.now(),
    isStreaming: true,
    toolCalls: state.streamingToolCalls,
    agentLabel: currentAgentLabelRef.current ?? 'Síntesis',
  }));
}

/** Stream chunk listener for a single team send; complexity lives here, not in handleSend. */
function createTeamStreamChunkHandler(opts: {
  streamId: string;
  state: TeamStreamMutableState;
  configuredMcpServers: MCPServerConfig[];
  setStatus: (status: TeamChatStatus) => void;
  setActiveAgentLabel: (label: string | null) => void;
  currentAgentLabelRef: { current: string | null };
  setStreamingMessage: Dispatch<SetStateAction<ChatMessageData | null>>;
}): (data: TeamStreamChunkData) => void {
  return (data) => {
    if (data.streamId !== opts.streamId) return;
    if (data.done) return;
    applyTeamAgentNameFromChunk(
      data.agentName,
      opts.setStatus,
      opts.setActiveAgentLabel,
      opts.currentAgentLabelRef,
    );
    handleTeamToolCallChunk(
      data,
      opts.state,
      opts.configuredMcpServers,
      opts.currentAgentLabelRef,
      opts.setStreamingMessage,
    );
    handleTeamToolResultChunk(
      data,
      opts.state,
      opts.configuredMcpServers,
      opts.setStreamingMessage,
    );
    handleTeamTextChunk(
      data,
      opts.state,
      opts.currentAgentLabelRef,
      opts.setStreamingMessage,
    );
  };
}

async function persistTeamAssistantTurn(opts: {
  teamId: string;
  state: TeamStreamMutableState;
  currentAgentLabel: string | null;
  dbSessionId: string | null;
  addMessage: (message: {
    role: 'assistant';
    content: string;
    toolCalls: ToolCallData[];
    agentName?: string;
    phase?: 'synthesis';
  }) => void;
}): Promise<void> {
  if (!opts.state.accumulated) return;

  opts.addMessage({
    role: 'assistant',
    content: opts.state.accumulated,
    toolCalls: opts.state.streamingToolCalls,
    agentName: opts.currentAgentLabel ?? undefined,
    phase: opts.currentAgentLabel ? 'synthesis' : undefined,
  });

  if (!opts.dbSessionId) return;

  const messageResult = await db.addChatMessage({
    sessionId: opts.dbSessionId,
    role: 'assistant',
    content: opts.state.accumulated,
    toolCalls: opts.state.streamingToolCalls,
    metadata: {
      mode: 'team',
      teamId: opts.teamId,
    },
  });
  const messageId = messageResult.success && messageResult.data ? messageResult.data.id : null;
  for (const trace of opts.state.pendingTraceEntries) {
    await db.appendChatTrace({
      sessionId: opts.dbSessionId,
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

function reportTeamSendError(
  aborted: boolean,
  err: unknown,
  addMessage: (message: { role: 'assistant'; content: string; agentName: string }) => void,
): void {
  if (aborted) return;
  const errMsg = err instanceof Error ? err.message : 'Error desconocido';
  showToast('error', errMsg);
  addMessage({ role: 'assistant', content: `Error: ${errMsg}`, agentName: 'Sistema' });
}

function agentLabelForTeamMessage(message: {
  agentName?: string;
  phase?: string;
}): string | undefined {
  if (message.agentName) return message.agentName;
  if (message.phase === 'planning') return 'Planificación';
  if (message.phase === 'delegation') return 'Delegación';
  if (message.phase === 'synthesis') return 'Síntesis';
  return undefined;
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
  const [disabledMcpIds, setDisabledMcpIds] = useState<Set<string>>(new Set());
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
          setMemberAgents(agents.filter(notNull))
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

      const historyMessages = buildTeamHistoryMessages(messages, userMessage);

      await ensureTeamSessionAndUserMessage({
        team,
        streamId,
        userMessage,
        currentSessionId,
        effectiveResourceId: effectiveResourceId ?? null,
        teamProjectId,
        pathname,
        homeSidebarSection,
        currentFolderId,
        currentResourceTitle: currentResource?.title ?? null,
        dbSessionIdRef,
      });

      const state: TeamStreamMutableState = {
        accumulated: '',
        streamingToolCalls: [],
        pendingTraceEntries: [],
      };
      const configuredMcpServers = await loadTeamConfiguredMcpServers(
        teamMcpServerIds,
        disabledMcpIds,
      );

      const unsubChunk = window.electron.ai.onStreamChunk(
        createTeamStreamChunkHandler({
          streamId,
          state,
          configuredMcpServers,
          setStatus,
          setActiveAgentLabel,
          currentAgentLabelRef,
          setStreamingMessage,
        }),
      );

      try {
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
          teamMcpServerIds: teamMcpServerIds.filter((id) => !disabledMcpIds.has(id)),
          projectId: teamProjectId,
        });
      } catch (err) {
        console.error('[AgentTeam] Stream error:', err);
        setStreamingMessage(null);
        return;
      }

      unsubChunk();
      setStreamingMessage(null);
      await persistTeamAssistantTurn({
        teamId: team.id,
        state,
        currentAgentLabel: currentAgentLabelRef.current,
        dbSessionId: dbSessionIdRef.current,
        addMessage,
      });
    } catch (err) {
      reportTeamSendError(controller.signal.aborted, err, addMessage);
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
    setStreamingMessage,
    setIsLoading,
    setAbortController,
    setInput,
    scrollToBottom,
    effectiveResourceId,
    currentResource,
    currentFolderId,
    pathname,
    homeSidebarSection,
    currentSessionId,
    teamMcpServerIds,
    disabledMcpIds,
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
          agentLabel: agentLabelForTeamMessage(message),
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="size-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <Toolbar dense className="!px-5 !py-3 !bg-card !border-border">
        <Toolbar.Leading>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="size-8 rounded-xl overflow-hidden shrink-0 bg-primary/10"
            >
              <img
                src={`/agents/sprite_${team.iconIndex}.png`}
                alt={team.name}
                className="size-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate text-foreground">
                {team.name}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {memberAgents.flatMap((a, i) => {
                  const chip = (
                    <span key={a.id} className="flex items-center gap-1">
                      <img src={`/agents/sprite_${a.iconIndex}.png`} alt="" className="size-3 object-contain" />
                      {a.name}
                    </span>
                  );
                  if (i === 0) return [chip];
                  const prev = memberAgents[i - 1];
                  return [<span key={`sep-${prev.id}-${a.id}`}>·</span>, chip];
                })}
              </div>
            </div>
          </div>
        </Toolbar.Leading>
        <Toolbar.Trailing>
          <Button type="button"
  variant="ghost"
  onClick={startNewChat}
  className="h-auto min-h-0 gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground bg-background hover:bg-accent"
  title="Nueva conversación"
  size="sm">
            <HugeiconsIcon icon={PlusSignCircleIcon} />
            Nueva
          </Button>
        </Toolbar.Trailing>
      </Toolbar>

      {teamMcpServerIds.length > 0 ? (
        <div className="shrink-0 px-5 pt-2">
          <Alert className="!py-2 !px-3 text-xs" role="note"><HugeiconsIcon icon={InformationCircleIcon} /><AlertDescription className="text-xs">
            Este equipo tiene MCP configurado. Abre el menú <strong>MCP</strong> junto al mensaje para ver herramientas
            disponibles.
          </AlertDescription></Alert>
        </div>
      ) : null}

      {/* Messages */}
      <UnifiedChatMessageArea className="p-5 flex flex-col gap-5">
        {messages.length === 0 ? (
          <UnifiedChatEmptyState
            avatar={
              <img
                src={`/agents/sprite_${team.iconIndex}.png`}
                alt=""
                className="size-full object-contain"
              />
            }
            title={team.name}
            description={team.description || 'Equipo de agentes especializados'}
          >
            <p className="text-xs text-muted-foreground">
              {memberAgents.length} agentes listos para colaborar
            </p>
          </UnifiedChatEmptyState>
        ) : (
          messageGroups.map((group) => (
            <ChatMessageGroup
              key={stableMessageGroupKey(group)}
              messages={group}
              showAvatar={false}
            />
          ))
        )}

        {/* Status indicator */}
        {isLoading && (
          <Marker role="status">
            <MarkerIcon><Spinner /></MarkerIcon>
            <MarkerContent className="shimmer">
                {status === 'thinking'
                  ? t('agentTeam.status_thinking')
                  : status === 'delegating'
                    ? t('agentTeam.status_delegating')
                    : status === 'synthesizing'
                      ? t('agentTeam.status_synthesizing')
                      : t('chat.processing')}
            </MarkerContent>
          </Marker>
        )}
        <div ref={messagesEndRef} />
      </UnifiedChatMessageArea>

      {/* Input */}
      <div className="shrink-0 border-t bg-background px-4 py-3">
        <UnifiedChatInput
          mode="agent"
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          isLoading={isLoading}
          onSend={() => {
            handleSend().catch(() => {});
          }}
          onAbort={handleStop}
          placeholder={`Chatear con ${team.name}...`}
          mcpServerIds={teamMcpServerIds}
          disabledMcpIds={disabledMcpIds}
          onToggleMcp={(id) => setDisabledMcpIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          hasAgentFunctions={teamMcpServerIds.length > 0}
        />
      </div>
    </div>
  );
}
