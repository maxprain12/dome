'use client';

import { useState, useMemo } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import ChatToolCard, { type ToolCallData } from './ChatToolCard';
import ReadingIndicator from './ReadingIndicator';
import MarkdownRenderer from './MarkdownRenderer';
import SourceReference from './SourceReference';
import MessageActions from './MessageActions';
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
  const [isHovered, setIsHovered] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

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
    <div
      className={`group relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Message content */}
        <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
          <div
            className={`inline-block px-4 py-2.5 max-w-[85%] ${
              isUser
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
              <div className="text-sm break-words">
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
              <ReadingIndicator className="opacity-60" />
            ) : null}

            {/* Streaming cursor */}
            {message.isStreaming && message.content && (
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse" />
            )}

            {/* Source references footer (only for assistant messages with citations) */}
            {isAssistant && !message.isStreaming && sourceReferences.length > 0 && (
              <SourceReference
                sources={sourceReferences}
                onClickSource={(sourceId) => {
                  // Find the citation number for this source
                  const citation = sourceReferences.find((s) => s.id === sourceId);
                  if (citation && onClickCitation) {
                    onClickCitation(citation.number);
                  }
                }}
              />
            )}
          </div>

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-2 space-y-2 max-w-[85%]">
              {message.toolCalls.map((toolCall) => (
                <ChatToolCard key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions (shown on hover for assistant messages) */}
      {isAssistant && isLastInGroup && isHovered && !message.isStreaming && (
        <div
          className="absolute -bottom-6 left-0 flex items-center gap-1 animate-in fade-in duration-150"
        >
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Copiar mensaje"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--secondary-text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="Regenerar respuesta"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] opacity-40 ml-1" style={{ color: 'var(--tertiary-text)' }}>
            {formattedTime}
          </span>
        </div>
      )}
    </div>
  );
}
