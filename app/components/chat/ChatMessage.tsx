
import { useState, useMemo } from 'react';
import { Copy, Check, RefreshCw, ChevronDown, ChevronRight, BookmarkPlus } from 'lucide-react';
import ChatToolCard, { type ToolCallData } from './ChatToolCard';
import ReadingIndicator from './ReadingIndicator';
import MarkdownRenderer from './MarkdownRenderer';
import SourceReference from './SourceReference';
import { extractCitationNumbers, type ParsedCitation } from '@/lib/utils/citations';

/**
 * ChatMessage - Individual message with actions
 * Supports markdown rendering, copy, tool cards, and inline citations
 */

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: ToolCallData[];
  citationMap?: Map<number, ParsedCitation>;
  /** Reasoning/chain-of-thought from models (qwen3, etc.) */
  thinking?: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
  showAvatar?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onRegenerate?: () => void;
  onSaveAsNote?: (content: string) => void;
  onClickCitation?: (number: number) => void;
  className?: string;
}

export default function ChatMessage({
  message,
  showAvatar = true,
  isFirstInGroup = true,
  isLastInGroup = true,
  onRegenerate,
  onSaveAsNote,
  onClickCitation,
  className = '',
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [savedAsNote, setSavedAsNote] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleSaveAsNote = () => {
    if (onSaveAsNote && message.content) {
      onSaveAsNote(message.content);
      setSavedAsNote(true);
      setTimeout(() => setSavedAsNote(false), 3000);
    }
  };

  // Copy message content to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Format timestamp
  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }, [message.timestamp]);

  // Build source references from citation map and message content
  const sourceReferences = useMemo(() => {
    if (!message.citationMap || message.citationMap.size === 0 || !message.content) {
      return [];
    }

    const citationNumbers = extractCitationNumbers(message.content);
    return citationNumbers
      .filter((num) => message.citationMap!.has(num))
      .map((num) => {
        const citation = message.citationMap!.get(num)!;
        return {
          number: num,
          id: citation.sourceId || '',
          title: citation.sourceTitle || `Source ${num}`,
          type: 'resource',
        };
      });
  }, [message.content, message.citationMap]);

  return (
    <div className={`group relative ${className}`}>
      <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Thinking - styled as minimalist card (Assistant only) */}
        {isAssistant && message.thinking && (
          <div className="max-w-[85%]">
            <button
              type="button"
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="group flex items-center gap-2 py-1 px-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <div className="flex items-center justify-center h-5 w-5 rounded text-[var(--tertiary-text)] group-hover:text-[var(--secondary-text)]">
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${thinkingExpanded ? 'rotate-90' : ''}`} />
              </div>
              <span className="text-[13px] font-medium text-[var(--secondary-text)]">
                Razonamiento
              </span>
            </button>

            {thinkingExpanded && (
              <div className="mt-1 ml-2 pl-4 border-l border-[var(--border)] py-1 animate-in fade-in duration-200">
                <div className="text-xs whitespace-pre-wrap break-words text-[var(--secondary-text)] opacity-90">
                  {message.thinking}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tool calls (Assistant only) - displayed before message content */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1 max-w-[85%]">
            {message.toolCalls.map((toolCall) => (
              <ChatToolCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Message content bubble */}
        {(message.content || message.isStreaming) && (
          <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
            <div
              className={`relative inline-block px-4 py-2.5 max-w-[85%] ${isUser
                ? 'rounded-2xl rounded-tr-md'
                : 'rounded-2xl rounded-tl-md'
                }`}
              style={{
                backgroundColor: isUser ? 'var(--accent)' : 'var(--bg-secondary)',
                color: isUser ? 'white' : 'var(--primary-text)',
              }}
            >
              {/* Message text */}
              {message.content ? (
                <div className="text-sm break-words" style={{ overflowWrap: 'anywhere' }}>
                  {isUser ? (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  ) : (
                    <MarkdownRenderer
                      content={message.content}
                      citationMap={message.citationMap}
                      onClickCitation={onClickCitation}
                    />
                  )}
                </div>
              ) : message.isStreaming ? (
                <div className="flex items-center gap-2">
                  <ReadingIndicator className="opacity-60 text-[var(--secondary-text)]" />
                  <span className="text-[13px] text-[var(--secondary-text)]">Procesando...</span>
                </div>
              ) : null}

              {/* Streaming cursor */}
              {message.isStreaming && message.content && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse" aria-hidden />
              )}

              {/* Source references footer (only for assistant messages with citations) */}
              {isAssistant && !message.isStreaming && sourceReferences.length > 0 && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
                  <SourceReference
                    sources={sourceReferences}
                    onClickSource={(sourceId) => {
                      const citation = sourceReferences.find((s) => s.id === sourceId);
                      if (citation && onClickCitation) {
                        onClickCitation(citation.number);
                      }
                    }}
                  />
                </div>
              )}

              {/* Message actions (Copy, Save, Regenerate) - inside bubble, always visible */}
              {isAssistant && !message.isStreaming && (
                <div
                  className="mt-2 pt-2 flex items-center gap-0.5 border-t"
                  style={{ borderColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}
                >
                  <button
                    onClick={handleCopy}
                    className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--secondary-text)' }}
                    title="Copiar mensaje"
                    aria-label="Copiar mensaje"
                  >
                    {copied ? (
                      <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  {onSaveAsNote && message.content ? (
                    <button
                      onClick={handleSaveAsNote}
                      className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: savedAsNote ? 'var(--success)' : 'var(--secondary-text)' }}
                      title={savedAsNote ? 'Guardado' : 'Guardar como nota'}
                      aria-label={savedAsNote ? 'Guardado' : 'Guardar como nota'}
                    >
                      {savedAsNote ? <Check className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
                    </button>
                  ) : null}
                  {onRegenerate ? (
                    <button
                      onClick={onRegenerate}
                      className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--secondary-text)' }}
                      title="Regenerar respuesta"
                      aria-label="Regenerar respuesta"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
