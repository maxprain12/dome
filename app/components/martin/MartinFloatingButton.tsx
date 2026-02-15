import { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Trash2, Copy, RefreshCw, X, Send, Loader2 } from 'lucide-react';
import MartinIcon from './MartinIcon';
import { useMartinStore } from '@/lib/store/useMartinStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { getAIConfig, chatStream, chatWithTools } from '@/lib/ai/client';
import { buildMartinFloatingPrompt, prompts } from '@/lib/prompts/loader';
import { createAllMartinTools } from '@/lib/ai/tools';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { showToast } from '@/lib/store/useToastStore';

// Routes where Many should NOT appear
const HIDDEN_ROUTES = ['/settings', '/onboarding'];

// Context by route
function getContextFromPath(pathname: string): { location: string; description: string } {
  if (pathname === '/' || pathname === '/home') {
    return { location: 'Home', description: 'in the main library' };
  }
  if (pathname.startsWith('/workspace/note/')) {
    return { location: 'Note Editor', description: 'editing a note' };
  }
  if (pathname.startsWith('/workspace/url/')) {
    return { location: 'URL Viewer', description: 'viewing a web resource' };
  }
  if (pathname.startsWith('/workspace/')) {
    return { location: 'Workspace', description: 'working on a resource' };
  }
  return { location: 'Dome', description: 'in the application' };
}

const QUICK_PROMPTS = [
  'Summarize my current resource',
  'What should I focus on?',
  'Help me organize my notes',
];

export default function MartinFloatingButton() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const {
    isOpen,
    toggleOpen,
    status,
    setStatus,
    messages,
    addMessage,
    clearMessages,
    unreadCount,
    whatsappConnected,
    whatsappPendingMessages,
    currentResourceId,
    currentResourceTitle,
    petPromptOverride,
  } = useMartinStore();
  const currentFolderId = useAppStore((s) => s.currentFolderId);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);

  // Fallback: get resourceId from URL when in workspace (store may not be synced yet)
  const effectiveResourceId =
    currentResourceId ||
    (pathname?.startsWith('/workspace') ? searchParams.get('id') : null);

  // Don't show on certain routes
  const shouldHide = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route));

  // Load provider info on mount
  useEffect(() => {
    const loadProviderInfo = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        const modelName = config.model || 'default';
        setProviderInfo(`${config.provider} / ${modelName}`);
      } else {
        setProviderInfo('Not configured');
      }
    };
    loadProviderInfo();

    // Re-check on config change
    const handleConfigChanged = () => loadProviderInfo();
    window.addEventListener('dome:ai-config-changed', handleConfigChanged);
    return () => window.removeEventListener('dome:ai-config-changed', handleConfigChanged);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [messages, prefersReducedMotion]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Build system prompt with context (from externalized prompts or pet override)
  const buildSystemPrompt = useCallback(() => {
    if (petPromptOverride) {
      return petPromptOverride;
    }
    const context = getContextFromPath(pathname || '/');
    const now = new Date();
    return buildMartinFloatingPrompt({
      location: context.location,
      description: context.description,
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      resourceTitle: currentResourceTitle || undefined,
      whatsappConnected,
    });
  }, [pathname, currentResourceTitle, whatsappConnected, petPromptOverride]);

  // Streaming message state
  const [streamingContent, setStreamingContent] = useState('');

  // Check if user is asking to summarize/analyze the current resource
  const isSummarizeRequest = (msg: string) => {
    const lower = msg.toLowerCase();
    return (
      lower.includes('summarize') ||
      lower.includes('summarise') ||
      lower.includes('resum') ||
      (lower.includes('resource') && (lower.includes('summar') || lower.includes('content') || lower.includes('about')))
    );
  };

  // Handle sending a message with streaming
  const handleSend = useCallback(async (messageOverride?: string) => {
    const userMessage = messageOverride || input.trim();
    if (!userMessage || isLoading || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setInput('');
    setIsLoading(true);
    setStatus('thinking');
    setStreamingContent('');

    // Add user message
    addMessage({ role: 'user', content: userMessage });

    try {
      const config = await getAIConfig();

      if (!config) {
        addMessage({
          role: 'assistant',
          content: 'I don\'t have AI configuration. Go to **Settings > AI** to configure a provider.',
        });
        isSubmittingRef.current = false;
        setIsLoading(false);
        setStatus('idle');
        return;
      }

      let resolvedUserMessage = userMessage;
      let systemPrompt = buildSystemPrompt();
      let contentInjected = false;

      // When user asks to summarize current resource and we have resourceId, fetch content
      if (effectiveResourceId && isSummarizeRequest(userMessage) && typeof window.electron?.ai?.tools?.resourceGet === 'function') {
        try {
          const result = await window.electron.ai.tools.resourceGet(effectiveResourceId, {
            includeContent: true,
            maxContentLength: 12000,
          });
          if (result?.success && result?.resource) {
            const r = result.resource;
            const content = r.content || r.summary || r.transcription || r.metadata?.summary || '';
            if (content && content.trim().length > 0) {
              systemPrompt += `\n\n## Current Resource Content (for summarization)\nThe user is viewing "${r.title || currentResourceTitle}". Here is the content to summarize:\n\n${content.slice(0, 12000)}`;
              if (content.length > 12000) {
                systemPrompt += '\n\n[Content truncated for length]';
              }
              contentInjected = true;
            }
          }
        } catch (e) {
          console.warn('[Many] Could not fetch resource content:', e);
        }
      }

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: resolvedUserMessage },
      ];

      let response = '';
      setStatus('speaking');

      // Use tools when in Electron: organize, summarize, search resources, create folders, move documents, etc.
      const hasElectronTools = typeof window !== 'undefined' && window.electron?.ai?.tools;
      const useTools =
        hasElectronTools &&
        (isSummarizeRequest(userMessage) ? !contentInjected : true);
      if (useTools) {
        const toolsPrompt = systemPrompt + '\n\n' + prompts.martin.tools;
        const toolHint = effectiveResourceId && isSummarizeRequest(userMessage)
          ? `\n\nThe user is viewing resource ID: ${effectiveResourceId}. Use resource_get to retrieve its content.`
          : '';
        const folderHint = (pathname === '/' || pathname === '/home') && currentFolderId
          ? `\n\nThe user is currently viewing folder ID: ${currentFolderId}. When they ask to create something from "these documents", "this folder", "estos documentos", or similar, use resource_list with folder_id: "${currentFolderId}" to list only resources in that folder, and use resource_create with folder_id: "${currentFolderId}" to place the new resource in the same folder.`
          : '';
        const tools = createAllMartinTools();
        const result = await chatWithTools(
          [
            { role: 'system', content: toolsPrompt + toolHint + folderHint },
            ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: resolvedUserMessage },
          ],
          tools,
          { maxIterations: 5 },
        );
        response = result.response;
      } else {
        for await (const chunk of chatStream(chatMessages)) {
          if (chunk.type === 'text' && chunk.text) {
            response += chunk.text;
            setStreamingContent(response);
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }
      }

      setStreamingContent('');
      addMessage({ role: 'assistant', content: response });
    } catch (error) {
      console.error('[Many] Error:', error);
      setStreamingContent('');
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addMessage({
        role: 'assistant',
        content: `Sorry, I had a problem: ${msg}`,
      });
      showToast('error', `Many: ${msg}`);
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
      setStatus('idle');
    }
  }, [input, isLoading, messages, addMessage, setStatus, buildSystemPrompt, effectiveResourceId, pathname, currentFolderId]);

  // Copy message content
  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    showToast('success', 'Copied to clipboard');
  }, []);

  // Regenerate last assistant response
  const handleRegenerate = useCallback(async (messageIndex: number) => {
    // Find the user message before this assistant message
    let userMsgIndex = messageIndex - 1;
    while (userMsgIndex >= 0 && messages[userMsgIndex]?.role !== 'user') {
      userMsgIndex--;
    }
    if (userMsgIndex < 0) return;
    const userMessage = messages[userMsgIndex]?.content;
    if (!userMessage) return;

    // Re-send
    setIsLoading(true);
    setStatus('thinking');
    setStreamingContent('');

    try {
      const config = await getAIConfig();
      if (!config) return;

      const systemPrompt = buildSystemPrompt();
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(0, userMsgIndex).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      let response = '';
      setStatus('speaking');

      for await (const chunk of chatStream(chatMessages)) {
        if (chunk.type === 'text' && chunk.text) {
          response += chunk.text;
          setStreamingContent(response);
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error);
        }
      }

      setStreamingContent('');
      addMessage({ role: 'assistant', content: response });
    } catch (error) {
      console.error('[Many] Regenerate error:', error);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
      setStatus('idle');
    }
  }, [messages, addMessage, setStatus, buildSystemPrompt]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (shouldHide) return null;

  const totalNotifications = unreadCount + whatsappPendingMessages;
  const context = getContextFromPath(pathname || '/');

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={toggleOpen}
        className="martin-floating-button"
        aria-label="Open chat with Many"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--bg-secondary)',
          border: '2px solid var(--border)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
        }}
      >
        <MartinIcon size={32} />

        {/* Notification Badge */}
        {totalNotifications > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              backgroundColor: 'var(--error, #ef4444)',
              color: 'white',
              borderRadius: '50%',
              width: 20,
              height: 20,
              fontSize: 11,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--bg)',
            }}
          >
            {totalNotifications > 9 ? '9+' : totalNotifications}
          </span>
        ) : null}

        {/* Status Indicator */}
        {status !== 'idle' && (
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: status === 'thinking' ? 'var(--warning, #f59e0b)' : 'var(--success, #22c55e)',
              border: '2px solid var(--bg)',
              animation: status === 'thinking' ? 'martinPulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
        )}

        {/* WhatsApp Indicator */}
        {whatsappConnected && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#25D366',
              border: '2px solid var(--bg)',
            }}
            title="WhatsApp connected"
          />
        )}
      </button>

      {/* Chat Popover */}
      {isOpen && (
        <div
          className="martin-chat-popover"
          style={{
            position: 'fixed',
            bottom: 96,
            right: 24,
            zIndex: 9998,
            width: 400,
            maxHeight: 560,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border)',
              }}
            >
              <MartinIcon size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--primary-text)', fontSize: 15 }}>Many</div>
              <div style={{ fontSize: 11, color: 'var(--tertiary-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {status === 'thinking'
                  ? 'Thinking...'
                  : status === 'speaking'
                    ? 'Responding...'
                    : providerInfo || context.description}
              </div>
            </div>

            {/* Clear chat button */}
            {messages.length > 0 && (
              <button
                onClick={() => {
                  clearMessages();
                  showToast('info', 'Chat cleared');
                }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border-none bg-transparent cursor-pointer transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{
                  color: 'var(--tertiary-text)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--secondary-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--tertiary-text)';
                }}
                title="Clear chat"
                aria-label="Clear chat"
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Close button */}
            <button
              onClick={toggleOpen}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border-none bg-transparent cursor-pointer transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                color: 'var(--tertiary-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--secondary-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--tertiary-text)';
              }}
              aria-label="Close chat"
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 220,
              maxHeight: 340,
            }}
          >
            {messages.length === 0 && !streamingContent ? (
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <div style={{ marginBottom: 14, opacity: 0.5 }}>
                  <MartinIcon size={52} />
                </div>
                <p style={{ marginBottom: 6, color: 'var(--primary-text)', fontWeight: 500, fontSize: 15 }}>
                  Hi, I'm Many
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--secondary-text)', marginBottom: 16 }}>
                  Your personal assistant in Dome. Ask me anything.
                </p>

                {/* Quick prompts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setInput(prompt);
                        inputRef.current?.focus();
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--secondary-text)',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                        e.currentTarget.style.color = 'var(--primary-text)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                        e.currentTarget.style.color = 'var(--secondary-text)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                    onMouseEnter={() => setHoveredMessageId(message.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div style={{ maxWidth: '85%', position: 'relative' }}>
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          backgroundColor: message.role === 'user'
                            ? 'var(--accent)'
                            : 'var(--bg-secondary)',
                          color: message.role === 'user' ? '#ffffff' : 'var(--primary-text)',
                          fontSize: 13,
                          lineHeight: '1.5',
                          wordBreak: 'break-word',
                        }}
                      >
                        {message.role === 'assistant' ? (
                          <MarkdownRenderer content={message.content} />
                        ) : (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
                        )}
                      </div>

                      {/* Action buttons for assistant messages */}
                      {message.role === 'assistant' && hoveredMessageId === message.id && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -6,
                            left: 8,
                            display: 'flex',
                            gap: 2,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: 2,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          }}
                        >
                          <button
                            onClick={() => handleCopy(message.content)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 4,
                              color: 'var(--tertiary-text)',
                              display: 'flex',
                              borderRadius: 4,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--primary-text)';
                              e.currentTarget.style.background = 'var(--bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--tertiary-text)';
                              e.currentTarget.style.background = 'none';
                            }}
                            title="Copy"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => handleRegenerate(index)}
                            disabled={isLoading}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              padding: 4,
                              color: 'var(--tertiary-text)',
                              display: 'flex',
                              borderRadius: 4,
                              opacity: isLoading ? 0.4 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading) {
                                e.currentTarget.style.color = 'var(--primary-text)';
                                e.currentTarget.style.background = 'var(--bg-hover)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--tertiary-text)';
                              e.currentTarget.style.background = 'none';
                            }}
                            title="Regenerate"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Streaming response */}
                {streamingContent && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: '16px 16px 16px 4px',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--primary-text)',
                        fontSize: 13,
                        lineHeight: '1.5',
                        wordBreak: 'break-word',
                      }}
                    >
                      <MarkdownRenderer content={streamingContent} />
                      <span
                        style={{
                          display: 'inline-block',
                          width: 2,
                          height: 14,
                          marginLeft: 2,
                          backgroundColor: 'var(--accent)',
                          animation: 'martinBlink 1s step-end infinite',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Thinking indicator */}
                {isLoading && !streamingContent && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '16px 16px 16px 4px',
                        backgroundColor: 'var(--bg-secondary)',
                        display: 'flex',
                        gap: 4,
                      }}
                    >
                      <span className="martin-dot" style={{ animationDelay: '0ms' }} />
                      <span className="martin-dot" style={{ animationDelay: '200ms' }} />
                      <span className="martin-dot" style={{ animationDelay: '400ms' }} />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                disabled={isLoading}
                rows={1}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--primary-text)',
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  minHeight: 42,
                  maxHeight: 100,
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 100) + 'px';
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
                title="Send message"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: input.trim() && !isLoading ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: input.trim() && !isLoading ? '#ffffff' : 'var(--tertiary-text)',
                  cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                {isLoading ? (
                  <Loader2 size={18} style={{ animation: 'martinSpin 1s linear infinite' }} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes martinPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
        @keyframes martinSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes martinBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes martinDot {
          0%, 20% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
          80%, 100% { opacity: 0.3; transform: scale(0.8); }
        }
        .martin-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--tertiary-text);
          animation: martinDot 1.4s infinite;
        }
        .martin-chat-popover::-webkit-scrollbar {
          width: 5px;
        }
        .martin-chat-popover::-webkit-scrollbar-track {
          background: transparent;
        }
        .martin-chat-popover::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 3px;
        }
        .martin-chat-popover::-webkit-scrollbar-thumb:hover {
          background: var(--border-hover);
        }
        @media (prefers-reduced-motion: reduce) {
          .martin-dot, [class*="martin"] {
            animation: none !important;
          }
        }
      `,
        }}
      />
    </>
  );
}
