import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import ManyChatInput from './ManyChatInput';
import { useManyStore, type ManyChatSession, type ManyMessage } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';
import {
  getAIConfig,
  chatStream,
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
  resolveManyCapabilityRuntime,
} from '@/lib/ai/shared-capabilities';
import { createRememberFactTool } from '@/lib/ai/tools/memory';
import { buildManyFloatingPrompt, buildMartinSupervisorPrompt, prompts } from '@/lib/prompts/loader';
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

const CHAT_CITATION_INSTRUCTION = `## Citation Guidance
- When you use evidence from resource_semantic_search or resource_get, cite the supporting source inline as [1], [2], etc.
- Reuse the numbering order from the most recent tool results in this answer.
- Prefer one citation per concrete factual claim or paragraph grounded in the library.`;

const APP_SECTION_GUIDE = `## Dome App Sections
- Home > Library: browse folders and resources, open folders, and organize the main library.
- Home > Studio: open generated outputs such as mindmaps, guides, quizzes, timelines, tables, flashcards, audio, and video.
- Home > Flashcards: review and manage flashcard decks.
- Home > Tags: browse resources grouped by tags.
- Home > Agents: manage specialized agents.
- Home > Workflows: run agent teams and workflow automations.
- Home > Marketplace: explore installable assets, workflows, and agents.
- Calendar: view and manage events.
- Workspace: open and edit a specific resource such as a note, notebook, PDF, DOCX, PPT, URL, video, or audio.

## Navigation Guidance
- If the user asks how to do something in Dome, explain the path step by step using the real section names above.
- If another area of the app is better for the task, say it explicitly: for example "ve a Studio", "abre Workflows", or "entra en Library".
- Prefer actionable guidance plus clickable internal links when available.
- If a workflow or specialized agent is the best route, mention it clearly and explain why.

## Deep Link Rules
- Resource links must use \`dome://resource/RESOURCE_ID/TYPE\`.
- Folder links must use \`dome://folder/FOLDER_ID\` and open the folder inside Home > Library in the current app window.
- Studio links must use \`dome://studio/OUTPUT_ID/TYPE\`.
- Never invent resource IDs, folder IDs, output IDs, or types. Use exact values from tool results only.`;

const ENTITY_CREATION_RULES = `## Entity Creation (agent_create, workflow_create, automation_create)
- **agent_create**: Always pass \`tool_ids\` — an agent without tools cannot work. Example: Noticiero needs ["web_fetch", "resource_create"]. After calling, your response MUST include the artifact block: \`\`\`artifact:created_entity (newline) {JSON from tool, strip ENTITY_CREATED: prefix} (newline) \`\`\`. This block renders the visual card. Without it, the user only sees plain text.
- **workflow_create**: When workflow nodes reference custom agents, create those agents first with agent_create (including tool_ids!), then reference their ID in nodes.
- **automation_create**: Dome has native automations. After creating an agent that could run recurrently (e.g. Noticiero), offer to create an automation. Never mention n8n or Make.`;

interface ManyPanelProps {
  width: number;
  onClose: () => void;
  isVisible: boolean;
  isFullscreen?: boolean;
}

export default function ManyPanel({ width, onClose, isVisible, isFullscreen = false }: ManyPanelProps) {
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
        const res = await db.getSetting('mcp_enabled');
        setMcpEnabledState(res.data !== 'false');
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

      const shouldHydrate =
        !currentSession ||
        persistedMessages.length > currentSession.messages.length ||
        (persistedMessages.length === currentSession.messages.length &&
          persistedMessages[persistedMessages.length - 1]?.id !== currentSession.messages[currentSession.messages.length - 1]?.id);

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
      title: result.data.title || currentSession?.title || 'New chat',
      messages: result.data.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.created_at,
        toolCalls: message.tool_calls ?? undefined,
        thinking: message.thinking ?? undefined,
      })),
      createdAt: currentSession?.createdAt ?? result.data.messages[0]?.created_at ?? Date.now(),
    } satisfies ManyChatSession);
  }, [currentSession, currentSessionId, hydrateSession]);

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
                streamingLabel: 'Ejecutando en background...',
              },
        );
      } else if (payload.type === 'thinking' && payload.text) {
        setStreamingMessage((prev) => (prev ? { ...prev, thinking: `${prev.thinking || ''}${payload.text}` } : prev));
      } else if (payload.type === 'tool_call' && payload.toolCall) {
        const args = (() => {
          try {
            return typeof payload.toolCall?.arguments === 'string'
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
                streamingLabel: `${STREAMING_LABELS[payload.toolCall.name || ''] || payload.toolCall.name || 'Herramienta'}...`,
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
  }, [activeRunId, applyRunSnapshot, refreshSessionFromDb]);

  const setMcpEnabled = useCallback(async (value: boolean) => {
    setMcpEnabledState(value);
    if (db.isAvailable()) {
      await db.setSetting('mcp_enabled', value ? 'true' : 'false');
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
    if (inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

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
            const content = r.content || r.summary || r.transcription || r.metadata?.summary || '';
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
  const useToolsStream = supportsTools && activeTools.length > 0 && toolsEnabled && hasLangGraph;

  const handleSend = useCallback(async (messageOverride?: string) => {
    const userMessage = messageOverride || input.trim();
    if (!userMessage || isLoading || isSubmittingRef.current) return;

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

      let systemPrompt = await buildSystemPrompt();
      let contentInjected = false;

      if (effectiveResourceId && isSummarizeRequest(userMessage) && typeof window.electron?.ai?.tools?.resourceGet === 'function') {
        try {
          const result = await window.electron.ai.tools.resourceGet(effectiveResourceId, {
            includeContent: true,
            maxContentLength: 12000,
          });
          if (result?.success && result?.resource) {
            const r = result.resource;
            const content = r.content || r.summary || r.transcription || r.metadata?.summary || '';
            if (content?.trim()) {
              systemPrompt += `\n\n## Current Resource Content (for summarization)\nThe user is viewing "${r.title || currentResourceTitle}". Here is the content to summarize:\n\n${content.slice(0, 12000)}`;
              if (content.length > 12000) systemPrompt += '\n\n[Content truncated for length]';
              contentInjected = true;
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
          const skillsResult = await db.getSetting('ai_skills');
          if (skillsResult.success && skillsResult.data) {
            const parsed = JSON.parse(skillsResult.data || '[]');
            const skills = Array.isArray(parsed)
              ? parsed.filter((s: { enabled?: boolean }) => s.enabled !== false)
              : [];
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

      // Note: pinned resource content is already injected into systemPrompt via buildSystemPrompt().
      // Build a compact pinnedBlock for the tools path supervisor prompt too.
      let pinnedBlock = '';
      if (pinnedResources.length > 0) {
        const alreadyInjectedNote = pinnedResources.map((r) => `"${r.title}" (id: ${r.id})`).join(', ');
        pinnedBlock = `\n\n> Context resources already loaded by user — do NOT re-fetch: ${alreadyInjectedNote}`;
      }

      const useToolsForThisRequest = useToolsStream && (isSummarizeRequest(userMessage) ? !contentInjected : true);
      providerForAnalytics = config.provider;
      capturePostHog(ANALYTICS_EVENTS.AI_CHAT_STARTED, {
        provider: config.provider,
        has_tools: useToolsForThisRequest,
      });

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      if (useToolsForThisRequest) {
        if (mcpEnabled) {
          await loadMcpServersSetting();
        }
        const context = getUiLocationDescription(pathname || '/', homeSidebarSection);
        const now = new Date();
        const supervisorPrompt = buildMartinSupervisorPrompt({
          location: context.location,
          date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          resourceTitle: currentResourceTitle || undefined,
          includeDateTime: true,
        });
        const sharedContext = {
          pathname: pathname || '/',
          homeSidebarSection,
          currentFolderId,
          currentResourceId: effectiveResourceId,
          currentResourceTitle: currentResourceTitle || null,
        };
        const uiContextBlock = buildSharedUiContextBlock(sharedContext);
        const toolHint = buildSharedResourceHint(sharedContext);
        const capabilityRuntime = resolveManyCapabilityRuntime(
          {
            toolsEnabled,
            resourceToolsEnabled,
            mcpEnabled,
          },
          undefined
        );
        const memoryBlock = userMemory ? `\n\n## What I know about you\n${userMemory}` : '';
        const toolsMessages = [
          { role: 'system', content: supervisorPrompt + '\n\n' + APP_SECTION_GUIDE + '\n\n' + ENTITY_CREATION_RULES + '\n\n' + uiContextBlock + memoryBlock + (skillsBlock || '') + toolHint + pinnedBlock },
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
          streamingLabel: 'Ejecutando herramientas...',
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
              toolIds: capabilityRuntime.subagentIds.map((subagentId) => `call_${subagentId}_agent`),
              mcpServerIds: capabilityRuntime.mcpServerIds,
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
          messages: toolsMessages,
          toolDefinitions: [],
          toolIds: capabilityRuntime.subagentIds.map((subagentId) => `call_${subagentId}_agent`),
          mcpServerIds: capabilityRuntime.mcpServerIds,
          subagentIds: capabilityRuntime.subagentIds,
          threadId,
        });
        delegatedToRunEngine = true;
        setAbortController(null);
        setActiveRunId(run.id);
        applyRunSnapshot(run);
      } else {
        const toolDefs =
          toolsEnabled && activeTools.length > 0 && supportsTools
            ? toOpenAIToolDefinitions(activeTools)
            : undefined;
        setStreamingMessage({
          id: `streaming-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          streamingLabel: 'Procesando...',
        });
        for await (const chunk of chatStream(apiMessages, toolDefs, controller.signal)) {
          if (chunk.type === 'thinking' && chunk.text) {
            fullThinking += chunk.text;
            setStreamingMessage((prev) => (prev ? { ...prev, thinking: fullThinking } : null));
          } else if (chunk.type === 'text' && chunk.text) {
            fullResponse += chunk.text;
            setStreamingMessage((prev) => (prev ? { ...prev, content: fullResponse } : null));
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }
        setStreamingMessage((prev) => (prev ? { ...prev, isStreaming: false } : null));
        if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
      }
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
      inputRef.current?.focus();
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
    useToolsStream,
    toolsEnabled,
    activeTools,
    scrollToBottom,
    currentResourceTitle,
  ]);

  const handleAbort = useCallback(() => {
    if (activeRunId) {
      void abortRun(activeRunId);
      return;
    }
    if (abortController) abortController.abort();
  }, [abortController, activeRunId]);

  const handleSaveAsNote = useCallback(async (content: string) => {
    try {
      const firstLine = content.split('\n')[0]?.trim().slice(0, 80) || t('toast.chat_note_default_title');
      const title = firstLine.replace(/^#+\s*/, '');
      const result = await db.createResource({
        project_id: 'default',
        type: 'note',
        title: title || t('toast.chat_note_default_title'),
        content,
      });
      if (result.success && result.data) {
        window.dispatchEvent(new Event('dome:resources-changed'));
        window.electron?.workspace?.open?.(result.data.id, 'note');
        showToast('success', t('toast.saved_as_note'));
      }
    } catch (err) {
      console.error('Save as note error:', err);
      showToast('error', t('toast.save_note_error'));
    }
  }, []);

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
          citationMap: buildCitationMap(toolCalls),
          thinking: m.thinking,
        };
      }),
    [messages],
  );

  const messageGroups = useMemo(() => {
    const liveStreamingMessage = streamingMessage
      ? { ...streamingMessage, citationMap: buildCitationMap(streamingMessage.toolCalls) }
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
              isWelcomeScreen
            />
          </div>

          {/* Quick prompt pills */}
          <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: '🔍', label: 'Buscar en mi biblioteca' },
                { icon: '📁', label: 'Organizar recursos' },
                { icon: '📋', label: 'Preparar reunión' },
              ].map(({ icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setInput(label); inputRef.current?.focus(); }}
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: '🤖', label: 'Estrategia con IA' },
                { icon: '📊', label: 'Crear tabla' },
                { icon: '📅', label: 'Reporte semanal' },
                { icon: '✉️', label: 'Redactar email' },
              ].map(({ icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setInput(label); inputRef.current?.focus(); }}
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span>{icon}</span>
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
                  onSaveAsNote={handleSaveAsNote}
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
          />
        )
      )}
    </div>
  );
}
