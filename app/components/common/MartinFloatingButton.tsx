'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import MartinIcon from './MartinIcon';
import { useMartinStore } from '@/lib/store/useMartinStore';
import { getAIConfig, chatStream } from '@/lib/ai/client';

// Rutas donde Martin NO debe aparecer
const HIDDEN_ROUTES = ['/settings', '/onboarding'];

// Contexto por ruta
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

export default function MartinFloatingButton() {
  const pathname = usePathname();
  const {
    isOpen,
    toggleOpen,
    status,
    setStatus,
    messages,
    addMessage,
    unreadCount,
    whatsappConnected,
    whatsappPendingMessages,
    currentResourceTitle,
  } = useMartinStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // No mostrar en ciertas rutas
  const shouldHide = HIDDEN_ROUTES.some((route) => pathname?.startsWith(route));

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Build system prompt with context
  const buildSystemPrompt = useCallback(() => {
    const context = getContextFromPath(pathname || '/');
    const now = new Date();

    let prompt = `You are Martin, Dome's AI assistant. You are friendly, conversational, and always try to help clearly. You speak in natural English.

## Your Personality
- Close and professional at the same time
- You use clear and direct language
- You explain complex concepts simply
- You always try to be useful and constructive
- You maintain a positive but not exaggerated tone

## Current Context
- Location: ${context.location}
- The user is ${context.description}
- Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
`;

    if (currentResourceTitle) {
      prompt += `- Active resource: "${currentResourceTitle}"\n`;
    }

    prompt += `
## Capabilities
You can help the user with:
- Answering questions about their resources and notes
- Suggesting ideas and connections between content
- Helping organize information
- Generating summaries and analyses
- Receiving content from WhatsApp${whatsappConnected ? ' (connected)' : ''}
- Any other productivity tasks

## Behavior
- If the user asks something outside your knowledge, be honest
- If you can suggest something useful based on context, do it
- Keep responses concise but complete
- Use emojis in moderation, only when they add value`;

    return prompt;
  }, [pathname, currentResourceTitle, whatsappConnected]);

  // Streaming message state
  const [streamingContent, setStreamingContent] = useState('');

  // Handle sending a message with streaming
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
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
          content: 'I don\'t have AI configuration. Go to Settings > AI to configure a provider.',
        });
        return;
      }

      const systemPrompt = buildSystemPrompt();
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      let response = '';
      setStatus('speaking');

      // Use unified streaming for all providers
      for await (const chunk of chatStream(chatMessages)) {
        if (chunk.type === 'text' && chunk.text) {
          response += chunk.text;
          setStreamingContent(response);
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error);
        }
      }

      // Add the complete response
      setStreamingContent('');
      addMessage({ role: 'assistant', content: response });
    } catch (error) {
      console.error('[Martin] Error:', error);
      setStreamingContent('');
      addMessage({
        role: 'assistant',
        content: `Sorry, I had a problem: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsLoading(false);
      setStatus('idle');
    }
  }, [input, isLoading, messages, addMessage, setStatus, buildSystemPrompt]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // No renderizar si está en una ruta oculta
  if (shouldHide) {
    return null;
  }

  // Total notifications
  const totalNotifications = unreadCount + whatsappPendingMessages;
  const context = getContextFromPath(pathname || '/');

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={toggleOpen}
        className="martin-floating-button"
        aria-label="Open chat with Martin"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)';
        }}
      >
        <MartinIcon size={32} />

        {/* Notification Badge */}
        {totalNotifications > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              fontSize: '11px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #1a1a2e',
            }}
          >
            {totalNotifications > 9 ? '9+' : totalNotifications}
          </span>
        )}

        {/* Status Indicator */}
        {status !== 'idle' && (
          <span
            style={{
              position: 'absolute',
              bottom: '0px',
              right: '0px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: status === 'thinking' ? '#f59e0b' : '#22c55e',
              border: '2px solid #1a1a2e',
              animation: status === 'thinking' ? 'martinPulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
        )}

        {/* WhatsApp Indicator */}
        {whatsappConnected && (
          <span
            style={{
              position: 'absolute',
              top: '0px',
              left: '0px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#25D366',
              border: '2px solid #1a1a2e',
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
            bottom: '96px',
            right: '24px',
            zIndex: 9998,
            width: '400px',
            maxHeight: '520px',
            background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2a2a4a 0%, #1a1a2e 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <MartinIcon size={26} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '15px' }}>Martin</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                {status === 'thinking'
                  ? 'Thinking...'
                  : status === 'speaking'
                    ? 'Responding...'
                    : context.description}
              </div>
            </div>
            <button
              onClick={toggleOpen}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.05)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minHeight: '220px',
              maxHeight: '320px',
            }}
          >
            {messages.length === 0 && !streamingContent ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.4)',
                  padding: '40px 20px',
                }}
              >
                <div style={{ marginBottom: '16px', opacity: 0.6 }}>
                  <MartinIcon size={56} />
                </div>
                <p style={{ marginBottom: '8px', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 500 }}>
                  Hi, I'm Martin
                </p>
                <p style={{ fontSize: '13px', lineHeight: 1.5 }}>
                  Your personal assistant in Dome. Ask me anything you need.
                </p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '12px 16px',
                        borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: message.role === 'user' 
                          ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                          : 'rgba(255, 255, 255, 0.08)',
                        color: message.role === 'user' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                
                {/* Streaming response */}
                {streamingContent && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '12px 16px',
                        borderRadius: '18px 18px 18px 4px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(255, 255, 255, 0.9)',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {streamingContent}
                      <span 
                        style={{ 
                          display: 'inline-block',
                          width: '2px',
                          height: '14px',
                          marginLeft: '2px',
                          backgroundColor: 'rgba(255, 255, 255, 0.6)',
                          animation: 'martinBlink 1s step-end infinite',
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Thinking indicator */}
                {isLoading && !streamingContent && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '18px 18px 18px 4px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        gap: '4px',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.5)', animation: 'martinDot 1.4s infinite', animationDelay: '0ms' }} />
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.5)', animation: 'martinDot 1.4s infinite', animationDelay: '200ms' }} />
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.5)', animation: 'martinDot 1.4s infinite', animationDelay: '400ms' }} />
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
              padding: '16px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-end',
              }}
            >
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
                  padding: '12px 16px',
                  borderRadius: '24px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  fontSize: '14px',
                  resize: 'none',
                  outline: 'none',
                  minHeight: '44px',
                  maxHeight: '100px',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 100) + 'px';
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: 'none',
                  background: input.trim() && !isLoading 
                    ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  color: input.trim() && !isLoading ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
                  cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                {isLoading ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: 'martinSpin 1s linear infinite' }}
                  >
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes martinPulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.6;
            transform: scale(0.95);
          }
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
          0%, 20% { 
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% { 
            opacity: 1;
            transform: scale(1);
          }
          80%, 100% { 
            opacity: 0.3;
            transform: scale(0.8);
          }
        }
        
        .martin-chat-popover::-webkit-scrollbar {
          width: 6px;
        }
        
        .martin-chat-popover::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .martin-chat-popover::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        
        .martin-chat-popover::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </>
  );
}
