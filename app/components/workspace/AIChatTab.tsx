'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Send, Loader2, AlertCircle, StopCircle, Globe, Search, Database } from 'lucide-react';
import { useInteractions } from '@/lib/hooks/useInteractions';
import { 
  getAIConfig, 
  getMartinSystemPrompt, 
  chatStream,
  chatWithTools,
  createWebSearchTool,
  createWebFetchTool,
  createAllMartinTools,
  toOpenAIToolDefinitions,
  providerSupportsTools,
  type AnyAgentTool,
  type AIProviderType,
} from '@/lib/ai';
import { type Resource } from '@/types';
import MartinAvatar from '@/components/martin/MartinAvatar';
import { 
  ChatMessageGroup,
  groupMessagesByRole,
  ReadingIndicator,
  MarkdownRenderer,
  type ChatMessageData,
  type ToolCallData,
} from '@/components/chat';

interface AIChatTabProps {
  resourceId: string;
  resource: Resource;
}

// Create tools once - includes web search, web fetch, resource tools, and context tools
const WEB_TOOLS: AnyAgentTool[] = [
  createWebSearchTool(),
  createWebFetchTool(),
];

// All Many tools including resource access
const ALL_MARTIN_TOOLS: AnyAgentTool[] = createAllMartinTools();

export default function AIChatTab({ resourceId, resource }: AIChatTabProps) {
  const {
    chatMessages,
    isLoading: isLoadingHistory,
    addInteraction,
  } = useInteractions(resourceId);

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [toolsEnabled, setToolsEnabled] = useState(true); // Enable tools by default
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true); // Resource tools enabled by default
  const [supportsTools, setSupportsTools] = useState(false);

  // Check if current provider supports tools (and re-check on config change)
  useEffect(() => {
    const checkToolSupport = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        const provider = config.provider as AIProviderType;
        setSupportsTools(providerSupportsTools(provider));
      }
    };
    checkToolSupport();

    // Listen for AI config changes from Settings
    const handleConfigChanged = () => {
      checkToolSupport();
    };
    window.addEventListener('dome:ai-config-changed', handleConfigChanged);
    return () => {
      window.removeEventListener('dome:ai-config-changed', handleConfigChanged);
    };
  }, []);

  // Get the active tools based on settings
  const activeTools = useMemo(() => {
    if (!toolsEnabled) return [];
    if (resourceToolsEnabled) {
      return ALL_MARTIN_TOOLS;
    }
    return WEB_TOOLS;
  }, [toolsEnabled, resourceToolsEnabled]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Convert interactions to ChatMessageData format
  const messages: ChatMessageData[] = useMemo(() => {
    return chatMessages
      .sort((a, b) => a.created_at - b.created_at)
      .map((msg) => ({
        id: msg.id,
        role: (msg.metadata?.role || 'user') as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.created_at,
      }));
  }, [chatMessages]);

  // Group messages by role for Slack-style display
  const messageGroups = useMemo(() => {
    const allMessages = streamingMessage 
      ? [...messages, streamingMessage]
      : messages;
    return groupMessagesByRole(allMessages);
  }, [messages, streamingMessage]);

  // Smart scroll - only scroll if user is near bottom
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (force || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  const buildSystemPrompt = useCallback(() => {
    return getMartinSystemPrompt({
      resourceContext: {
        title: resource.title,
        type: resource.type,
        content: resource.content,
        summary: resource.metadata?.summary,
        transcription: resource.metadata?.transcription,
      },
      toolsEnabled: toolsEnabled && supportsTools,
      location: 'workspace',
      includeDateTime: true,
    });
  }, [resource, toolsEnabled, supportsTools]);

  const handleStream = useCallback(
    async (userMessage: string) => {
      const config = await getAIConfig();

      if (!config) {
        setError('AI not configured. Configure your provider in Settings.');
        return null;
      }

      // Check if API key is needed
      const needsApiKey = config.provider === 'openai' || config.provider === 'anthropic' || config.provider === 'google';
      const hasApiKey = config.apiKey;
      
      if (needsApiKey && !hasApiKey && config.provider !== 'synthetic' && config.provider !== 'venice') {
        setError('API key not configured. Go to Settings to configure it.');
        return null;
      }

      // Build messages array with system prompt and history
      const apiMessages = [
        { role: 'system', content: buildSystemPrompt() },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      const controller = new AbortController();
      setAbortController(controller);

      let fullResponse = '';
      const toolCallsData: ToolCallData[] = [];

      try {
        // Create streaming message placeholder
        const streamingId = `streaming-${Date.now()}`;
        setStreamingMessage({
          id: streamingId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          toolCalls: [],
        });

        // If tools are enabled, use chatWithTools for automatic tool execution
        if (toolsEnabled && supportsTools && activeTools.length > 0) {
          const result = await chatWithTools(apiMessages, activeTools, {
            maxIterations: 5, // Allow more iterations for complex tool chains
            signal: controller.signal,
          });
          
          fullResponse = result.response;
          
          // Update streaming message with tool results
          result.toolResults.forEach((tr, i) => {
            toolCallsData.push({
              id: `tool-${i}`,
              name: tr.tool,
              arguments: {},
              status: 'success',
              result: tr.result,
            });
          });
          
          setStreamingMessage(prev => prev ? {
            ...prev,
            content: fullResponse,
            isStreaming: false,
            toolCalls: toolCallsData,
          } : null);
        } else {
          // Regular streaming without tools
          const toolDefinitions = toolsEnabled && activeTools.length > 0 
            ? toOpenAIToolDefinitions(activeTools) 
            : undefined;
          
          for await (const chunk of chatStream(apiMessages, toolDefinitions, controller.signal)) {
            if (chunk.type === 'text' && chunk.text) {
              fullResponse += chunk.text;
              setStreamingMessage(prev => prev ? {
                ...prev,
                content: fullResponse,
              } : null);
            } else if (chunk.type === 'tool_call' && chunk.toolCall) {
              const toolCall: ToolCallData = {
                id: chunk.toolCall.id,
                name: chunk.toolCall.name,
                arguments: typeof chunk.toolCall.arguments === 'string' 
                  ? JSON.parse(chunk.toolCall.arguments) 
                  : chunk.toolCall.arguments,
                status: 'pending',
              };
              toolCallsData.push(toolCall);
              setStreamingMessage(prev => prev ? {
                ...prev,
                toolCalls: [...(prev.toolCalls || []), toolCall],
              } : null);
            } else if (chunk.type === 'error') {
              throw new Error(chunk.error);
            }
          }
        }

        return fullResponse;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled - return partial response if any
          return fullResponse || null;
        }
        console.error('Streaming error:', err);
        throw err;
      } finally {
        setAbortController(null);
      }
    },
    [messages, buildSystemPrompt, toolsEnabled, supportsTools, activeTools]
  );

  const handleSend = useCallback(async () => {
    const message = inputValue.trim();
    if (!message || isStreaming) return;

    setInputValue('');
    setError(null);
    setIsStreaming(true);

    try {
      // Save user message
      await addInteraction('chat', message, undefined, { role: 'user' });

      // Scroll to show the new message
      scrollToBottom(true);

      // Stream AI response
      const response = await handleStream(message);

      if (response) {
        // Save AI response
        await addInteraction('chat', response, undefined, { role: 'assistant' });
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Error getting response');
    } finally {
      setIsStreaming(false);
      setStreamingMessage(null);
      inputRef.current?.focus();
    }
  }, [inputValue, isStreaming, addInteraction, handleStream, scrollToBottom]);

  const handleAbort = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, [abortController]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleRegenerate = useCallback(async (messageId: string) => {
    // Find the last user message before this assistant message
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex <= 0) return;

    // Find the corresponding user message
    let userMessageIndex = messageIndex - 1;
    while (userMessageIndex >= 0 && messages[userMessageIndex]?.role !== 'user') {
      userMessageIndex--;
    }

    if (userMessageIndex < 0) return;
    const userMessage = messages[userMessageIndex]?.content;
    if (!userMessage) return;

    // Re-send the user message
    setError(null);
    setIsStreaming(true);

    try {
      const response = await handleStream(userMessage);
      if (response) {
        await addInteraction('chat', response, undefined, { role: 'assistant' });
      }
    } catch (err) {
      console.error('Regenerate error:', err);
      setError(err instanceof Error ? err.message : 'Error regenerating');
    } finally {
      setIsStreaming(false);
      setStreamingMessage(null);
    }
  }, [messages, handleStream, addInteraction]);

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-6"
      >
        {/* Empty state */}
        {messages.length === 0 && !streamingMessage && (
          <div className="text-center py-12">
            <div className="flex justify-center mb-4">
              <MartinAvatar size="lg" />
            </div>
            <p className="text-base font-medium" style={{ color: 'var(--primary-text)' }}>
              Hi, I'm Many
            </p>
            <p className="text-sm mt-2 max-w-xs mx-auto" style={{ color: 'var(--secondary-text)' }}>
              You can ask me questions about this resource, ask for summaries, or explore ideas together.
            </p>
            
            {/* Quick prompts */}
            <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md mx-auto">
              {[
                'What are the key points?',
                'Give me a summary',
                'What questions should I ask myself?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInputValue(prompt);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 text-xs rounded-full border transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--secondary-text)',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message groups */}
        {messageGroups.map((group, index) => (
          <ChatMessageGroup
            key={`group-${index}-${group[0]?.id || index}`}
            messages={group}
            onRegenerate={handleRegenerate}
          />
        ))}

        {/* Reading indicator when starting */}
        {isStreaming && !streamingMessage?.content && (
          <div className="flex gap-3">
            <MartinAvatar size="sm" />
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-md"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <ReadingIndicator className="opacity-60" />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-3 p-4 rounded-xl mx-auto max-w-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--error) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
            }}
          >
            <AlertCircle size={18} className="flex-shrink-0" style={{ color: 'var(--error)' }} />
            <div className="flex-1">
              <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        {/* Tools toggle */}
        {supportsTools && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setResourceToolsEnabled(!resourceToolsEnabled)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                border: toolsEnabled && resourceToolsEnabled
                  ? '1px solid color-mix(in srgb, var(--success) 30%, transparent)'
                  : '1px solid var(--border)',
                backgroundColor: toolsEnabled && resourceToolsEnabled
                  ? 'color-mix(in srgb, var(--success) 10%, transparent)'
                  : 'transparent',
                color: toolsEnabled && resourceToolsEnabled ? 'var(--success)' : 'var(--secondary-text)',
              }}
              onMouseEnter={(e) => {
                if (!(toolsEnabled && resourceToolsEnabled)) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!(toolsEnabled && resourceToolsEnabled)) e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={resourceToolsEnabled ? 'Resource access enabled' : 'Enable resource access'}
            >
              <Database size={12} />
              My resources
            </button>
            <button
              onClick={() => setToolsEnabled(!toolsEnabled)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                border: toolsEnabled
                  ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
                  : '1px solid var(--border)',
                backgroundColor: toolsEnabled
                  ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                  : 'transparent',
                color: toolsEnabled ? 'var(--accent)' : 'var(--secondary-text)',
              }}
              onMouseEnter={(e) => {
                if (!toolsEnabled) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!toolsEnabled) e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={toolsEnabled ? 'Tools enabled' : 'Enable tools'}
            >
              <Search size={12} />
              Web search
            </button>
          </div>
        )}

        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={toolsEnabled && resourceToolsEnabled 
                ? "Type your question (I can search your resources and the web)..." 
                : toolsEnabled 
                  ? "Type your question (with web search)..." 
                  : "Type your question..."}
              disabled={isStreaming}
              className="w-full px-4 py-3 text-sm rounded-xl resize-none disabled:opacity-50 focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--primary-text)',
                minHeight: '48px',
                maxHeight: '160px',
              }}
              rows={1}
            />
          </div>
          
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="p-3 rounded-xl transition-all active:scale-95"
              style={{
                backgroundColor: 'var(--error)',
                color: 'white',
              }}
              title="Stop generation"
            >
              <StopCircle size={20} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-3 rounded-xl transition-all disabled:opacity-40 active:scale-95"
              style={{
                backgroundColor: inputValue.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
                color: inputValue.trim() ? 'white' : 'var(--secondary-text)',
              }}
              title="Send message"
            >
              <Send size={20} />
            </button>
          )}
        </div>
        
        <p className="text-[11px] mt-2 text-center opacity-50" style={{ color: 'var(--secondary-text)' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
