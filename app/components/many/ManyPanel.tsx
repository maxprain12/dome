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
  createWebSearchTool,
  createWebFetchTool,
  createManyToolsForContext,
  providerSupportsTools,
  toOpenAIToolDefinitions,
  type AIProviderType,
} from '@/lib/ai';
import { buildManyFloatingPrompt, prompts } from '@/lib/prompts/loader';
import { showToast } from '@/lib/store/useToastStore';
import ManyAvatar from './ManyAvatar';
import ChatMessageGroup, { groupMessagesByRole } from '@/components/chat/ChatMessageGroup';
import ReadingIndicator from '@/components/chat/ReadingIndicator';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { db } from '@/lib/db/client';

const WEB_TOOLS = [createWebSearchTool(), createWebFetchTool()];

const QUICK_PROMPTS_BASE = [
  'Summarize my current resource',
  'What should I focus on?',
  'Help me organize my notes',
];

const QUICK_PROMPTS_WITH_TOOLS = [
  'Search my resources',
  'Query my database',
];

function getContextFromPath(pathname: string): { location: string; description: string } {
  if (pathname === '/' || pathname === '/home') {
    return { location: 'Home', description: 'in the main library' };
  }
  if (pathname.startsWith('/workspace/note/')) {
    return { location: 'Note Editor', description: 'editing a note' };
  }
  if (pathname.startsWith('/workspace/url')) {
    return { location: 'URL Viewer', description: 'viewing a web resource' };
  }
  if (pathname.startsWith('/workspace/youtube')) {
    return { location: 'YouTube Player', description: 'watching a YouTube video' };
  }
  if (pathname.startsWith('/workspace/')) {
    return { location: 'Workspace', description: 'working on a resource' };
  }
  return { location: 'Dome', description: 'in the application' };
}

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

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true);
  const [supportsTools, setSupportsTools] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [providerInfo, setProviderInfo] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const activeTools = useMemo(() => {
    const tools = [];
    if (toolsEnabled) {
      tools.push(...WEB_TOOLS);
    }
    if (resourceToolsEnabled) {
      tools.push(...createManyToolsForContext(pathname || '/'));
    }
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
    if (inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  const buildSystemPrompt = useCallback(() => {
    if (petPromptOverride) {
      return petPromptOverride;
    }
    const context = getContextFromPath(pathname || '/');
    const now = new Date();
    return buildManyFloatingPrompt({
      location: context.location,
      description: context.description,
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      resourceTitle: currentResourceTitle || undefined,
      whatsappConnected,
    });
  }, [pathname, currentResourceTitle, petPromptOverride, whatsappConnected]);

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
      let fullResponse = '';
      let toolCallsData: ToolCallData[] = [];

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

      const useToolsForThisRequest = useToolsStream && (isSummarizeRequest(userMessage) ? !contentInjected : true);
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      let fullThinking = '';

      if (useToolsForThisRequest) {
        const toolsPrompt = systemPrompt + '\n\n' + prompts.many.tools + '\n\n' + prompts.many.noteFormat;
        const toolHint = effectiveResourceId && isSummarizeRequest(userMessage)
          ? `\n\nThe user is viewing resource ID: ${effectiveResourceId}. Use resource_get to retrieve its content.`
          : '';
        const folderHint = (pathname === '/' || pathname === '/home') && currentFolderId
          ? `\n\nThe user is currently viewing folder ID: ${currentFolderId}. When they ask to create something from "these documents", "this folder", "estos documentos", or similar, use resource_list with folder_id: "${currentFolderId}" to list only resources in that folder, and use resource_create with folder_id: "${currentFolderId}" to place the new resource in the same folder.`
          : '';
        const tools = createManyToolsForContext(pathname || '/');
        const toolsMessages = [
          { role: 'system', content: toolsPrompt + toolHint + folderHint },
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
        });

        let mutatingToolsUsed = false;
        for await (const chunk of chatWithToolsStream(toolsMessages, tools, {
          signal: controller.signal,
          threadId: `many_${effectiveResourceId || 'global'}`,
        })) {
          if (chunk.type === 'thinking' && chunk.text) {
            fullThinking += chunk.text;
            setStreamingMessage((prev) => (prev ? { ...prev, thinking: fullThinking } : null));
          } else if (chunk.type === 'text' && chunk.text) {
            fullResponse += chunk.text;
            setStreamingMessage((prev) => (prev ? { ...prev, content: fullResponse, toolCalls: toolCallsData } : null));
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
            if (['resource_create', 'resource_update', 'resource_delete', 'resource_move_to_folder'].includes(chunk.toolCall.name?.toLowerCase?.())) {
              mutatingToolsUsed = true;
            }
            setStreamingMessage((prev) => (prev ? { ...prev, toolCalls: [...toolCallsData] } : null));
          } else if (chunk.type === 'tool_result' && chunk.toolCallId != null) {
            const entry = toolCallsData.find((t) => t.id === chunk.toolCallId);
            if (entry) {
              entry.status = 'success';
              entry.result = chunk.result;
            }
            setStreamingMessage((prev) => (prev ? { ...prev, toolCalls: [...toolCallsData] } : null));
          } else if (chunk.type === 'done') {
            setStreamingMessage((prev) => (prev ? { ...prev, isStreaming: false } : null));
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }
        if (mutatingToolsUsed) {
          window.dispatchEvent(new Event('dome:resources-changed'));
        }
        addMessage({ role: 'assistant', content: fullResponse });
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
        addMessage({ role: 'assistant', content: fullResponse });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (fullResponse) addMessage({ role: 'assistant', content: fullResponse });
      } else {
        console.error('[Many] Error:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        addMessage({ role: 'assistant', content: `Sorry, I had a problem: ${msg}` });
        showToast('error', `Many: ${msg}`);
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
    addMessage,
    setStatus,
    buildSystemPrompt,
    effectiveResourceId,
    pathname,
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

  const context = getContextFromPath(pathname || '/');

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
                <div className="rounded-2xl rounded-tl-md bg-[var(--bg-secondary)] px-4 py-3">
                  <ReadingIndicator className="opacity-60" />
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

      <ManyChatInput
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        isLoading={isLoading}
        toolsEnabled={toolsEnabled}
        resourceToolsEnabled={resourceToolsEnabled}
        setToolsEnabled={setToolsEnabled}
        setResourceToolsEnabled={setResourceToolsEnabled}
        supportsTools={supportsTools}
        onSend={() => handleSend()}
        onAbort={handleAbort}
      />
    </div>
  );
}
