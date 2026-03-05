import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLocation, useSearchParams } from 'react-router-dom';
import ManyChatHeader from './ManyChatHeader';
import ManyChatInput from './ManyChatInput';
import { useManyStore } from '@/lib/store/useManyStore';
import { useAppStore } from '@/lib/store/useAppStore';
import {
  getAIConfig,
  chatStream,
  chatWithToolsStream,
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
import { db } from '@/lib/db/client';
import { capturePostHog } from '@/lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

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

interface ManyPanelProps {
  width: number;
  onClose: () => void;
}

export default function ManyPanel({ width, onClose }: ManyPanelProps) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const {
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
    currentResourceId,
    currentResourceTitle,
    petPromptOverride,
    whatsappConnected,
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
        setProviderInfo(`${config.provider} / ${model}`);
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

  const buildSystemPrompt = useCallback(() => {
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
    if (userMemory) {
      prompt += `\n\n## What I know about you\n${userMemory}`;
    }
    return prompt;
  }, [
    currentFolderId,
    currentResourceTitle,
    effectiveResourceId,
    homeSidebarSection,
    pathname,
    petPromptOverride,
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
    let toolCallsData: ToolCallData[] = [];
    let fullThinking = '';
    let chatSuccess = true;
    let providerForAnalytics: string | null = null;

    try {
      const config = await getAIConfig();
      if (!config) {
        addMessage({
          role: 'assistant',
          content: 'I don\'t have AI configuration. Go to **Settings > AI** to configure a provider.',
        });
        return;
      }

      const needsApiKey = ['openai', 'anthropic', 'google'].includes(config.provider);
      const hasApiKey = !!config.apiKey;
      if (needsApiKey && !hasApiKey && !['synthetic', 'venice'].includes(config.provider)) {
        setError('API key not configured. Go to Settings to configure it.');
        addMessage({
          role: 'assistant',
          content: 'API key not configured. Go to **Settings > AI** to configure your API key.',
        });
        return;
      }

      let systemPrompt = buildSystemPrompt();
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
        const tools: AnyAgentTool[] = []; // Subagents architecture: main agent uses subagent-invocation tools (built in main process)
        const memoryBlock = userMemory ? `\n\n## What I know about you\n${userMemory}` : '';
        const toolsMessages = [
          { role: 'system', content: supervisorPrompt + '\n\n' + APP_SECTION_GUIDE + '\n\n' + uiContextBlock + memoryBlock + (skillsBlock || '') + toolHint },
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

        let mutatingToolsUsed = false;
        const threadId = `many_${effectiveResourceId || 'global'}_${Date.now()}`;

        // Persist session and user message for traceability
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

        for await (const chunk of chatWithToolsStream(toolsMessages, tools, {
          signal: controller.signal,
          threadId,
          mcpServerIds: capabilityRuntime.mcpServerIds,
          subagentIds: capabilityRuntime.subagentIds,
        })) {
          if (chunk.type === 'thinking' && chunk.text) {
            fullThinking += chunk.text;
            setStreamingMessage((prev) => (prev ? { ...prev, thinking: fullThinking } : null));
          } else if (chunk.type === 'text' && chunk.text) {
            fullResponse += chunk.text;
            setStreamingMessage((prev) => (prev ? { ...prev, content: fullResponse, toolCalls: toolCallsData } : null));
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            const args = (() => {
              try {
                return typeof chunk.toolCall.arguments === 'string'
                  ? JSON.parse(chunk.toolCall.arguments)
                  : chunk.toolCall.arguments || {};
              } catch {
                return {};
              }
            })();
            const tc: ToolCallData = {
              id: chunk.toolCall.id,
              name: chunk.toolCall.name,
              arguments: args,
              status: 'running',
            };
            toolCallsData.push(tc);
            if (dbSessionId && db.isAvailable()) {
              db.appendChatTrace({
                sessionId: dbSessionId,
                type: 'tool_call',
                toolName: chunk.toolCall.name,
                toolArgs: args,
              }).catch(() => {});
            }
            if (['resource_create', 'resource_update', 'resource_delete', 'resource_move_to_folder', 'call_writer_agent', 'call_library_agent', 'notebook_add_cell', 'notebook_update_cell', 'notebook_delete_cell', 'ppt_create', 'excel_create'].includes(chunk.toolCall.name?.toLowerCase?.())) {
              mutatingToolsUsed = true;
            }
            const toolLabel = STREAMING_LABELS[chunk.toolCall.name || ''] || chunk.toolCall.name?.replace(/_/g, ' ') || 'Ejecutando...';
            setStreamingMessage((prev) => (prev ? { ...prev, toolCalls: [...toolCallsData], streamingLabel: `${toolLabel}...` } : null));
          } else if (chunk.type === 'tool_result' && chunk.toolCallId != null) {
            const entry = toolCallsData.find((t) => t.id === chunk.toolCallId);
            if (entry) {
              entry.status = 'success';
              entry.result = chunk.result;
            }
            if (dbSessionId && db.isAvailable() && entry) {
              db.appendChatTrace({
                sessionId: dbSessionId,
                type: 'tool_result',
                toolName: entry.name,
                result: chunk.result,
              }).catch(() => {});
            }
            setStreamingMessage((prev) => (prev ? { ...prev, toolCalls: [...toolCallsData] } : null));
          } else if (chunk.type === 'done') {
            setStreamingMessage((prev) => (prev ? { ...prev, isStreaming: false } : null));
            setPendingApproval(null);
            // Persist assistant message with toolCalls and thinking for traceability
            if (dbSessionId && db.isAvailable() && fullResponse) {
              try {
                const hitlDecisions = hitlDecisionsRef.current;
                if (hitlDecisions && hitlDecisions.length > 0) {
                  for (const d of hitlDecisions) {
                    await db.appendChatTrace({
                      sessionId: dbSessionId,
                      type: 'decision',
                      decision: d.type,
                      toolArgs: d.type === 'edit' ? d.editedAction : undefined,
                    });
                  }
                  hitlDecisionsRef.current = null;
                }
                await db.addChatMessage({
                  sessionId: dbSessionId,
                  role: 'assistant',
                  content: fullResponse,
                  toolCalls: toolCallsData.length > 0 ? toolCallsData : undefined,
                  thinking: fullThinking || undefined,
                  metadata: {
                    toolIds: [],
                    mcpServerIds: capabilityRuntime.mcpServerIds ?? [],
                    mode: 'many',
                    ...(hitlDecisions && hitlDecisions.length > 0 ? { hitlDecisions } : {}),
                  },
                });
              } catch (e) {
                console.warn('[Many] Could not persist assistant message to DB:', e);
              }
            }
          } else if (chunk.type === 'interrupt' && chunk.actionRequests && chunk.reviewConfigs) {
            setStreamingMessage((prev) => (prev ? { ...prev, isStreaming: false } : null));
            const origSubmitResume = chunk.submitResume ?? (() => {});
            setPendingApproval({
              actionRequests: chunk.actionRequests,
              reviewConfigs: chunk.reviewConfigs,
              submitResume: (decisions) => {
                hitlDecisionsRef.current = decisions;
                origSubmitResume(decisions);
              },
            });
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }
        if (mutatingToolsUsed) {
          window.dispatchEvent(new Event('dome:resources-changed'));
        }
        if (fullResponse) {
          addMessage({
            role: 'assistant',
            content: fullResponse,
            toolCalls: toolCallsData.length > 0 ? toolCallsData : undefined,
            thinking: fullThinking || undefined,
          });
        }
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
        addMessage({ role: 'assistant', content: `Sorry, I had a problem: ${msg}` });
        showToast('error', `Many: ${msg}`);
      }
    } finally {
      if (providerForAnalytics) {
        capturePostHog(ANALYTICS_EVENTS.AI_CHAT_COMPLETED, {
          success: chatSuccess,
          provider: providerForAnalytics,
          message_count: messages.length + (fullResponse ? 1 : 0),
        });
      }
      isSubmittingRef.current = false;
      setIsLoading(false);
      setStatus('idle');
      setStreamingMessage(null);
      setPendingApproval(null);
      setAbortController(null);
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
    if (abortController) abortController.abort();
  }, [abortController]);

  const handleSaveAsNote = useCallback(async (content: string) => {
    try {
      const firstLine = content.split('\n')[0]?.trim().slice(0, 80) || 'Nota del chat';
      const title = firstLine.replace(/^#+\s*/, '');
      const result = await db.createResource({
        project_id: 'default',
        type: 'note',
        title: title || 'Nota del chat',
        content,
      });
      if (result.success && result.data) {
        window.dispatchEvent(new Event('dome:resources-changed'));
        window.electron?.workspace?.open?.(result.data.id, 'note');
        showToast('success', 'Saved as note');
      }
    } catch (err) {
      console.error('Save as note error:', err);
      showToast('error', 'Failed to save as note');
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
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.toolCalls?.map((toolCall) => ({
          ...toolCall,
          status: toolCall.status ?? 'success',
        })) as ToolCallData[] | undefined,
        thinking: m.thinking,
      })),
    [messages],
  );

  const messageGroups = useMemo(() => {
    const all = streamingMessage ? [...chatMessages, streamingMessage] : chatMessages;
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
      style={{
        width: `${width}px`,
        minWidth: 320,
        maxWidth: 600,
        background: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
    >
      <ManyChatHeader
        status={status}
        providerInfo={providerInfo}
        contextDescription={context.description}
        messagesCount={messages.length}
        loadingHint={loadingHint}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onClear={handleClear}
        onStartNewChat={startNewChat}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
        onClose={onClose}
      />

      <div
        className="many-panel-messages flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-5 min-h-0"
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
                  onClick={() => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--secondary-text)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
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
              <div className="flex gap-3">
                <ManyAvatar size="sm" />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-[var(--bg-secondary)] px-4 py-3">
                  <ReadingIndicator className="opacity-60 text-[var(--secondary-text)]" />
                  <span className="text-[13px] text-[var(--secondary-text)]">Analizando tu consulta...</span>
                </div>
              </div>
            ) : null}
            {error ? (
              <div
                className="mx-auto flex max-w-md gap-3 rounded-xl p-4"
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
  );
}
