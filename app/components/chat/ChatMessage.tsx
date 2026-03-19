
import { useState, useMemo } from 'react';
import { Copy, Check, RefreshCw, ChevronDown, ChevronRight, BookmarkPlus } from 'lucide-react';
import ChatToolCard, { ChatToolCardGroup, type ToolCallData } from './ChatToolCard';
import ReadingIndicator from './ReadingIndicator';
import MarkdownRenderer from './MarkdownRenderer';
import SourceReference from './SourceReference';
import ArtifactCard, { type AnyArtifact, type ArtifactType } from './ArtifactCard';
import { extractCitationNumbers, type ParsedCitation } from '@/lib/utils/citations';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';
import {
  extractDoclingImagesFromToolCalls,
  buildDoclingArtifactFromListImages,
} from '@/lib/chat/docling-utils';

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
  /** Custom label for streaming placeholder (e.g. "Ejecutando herramientas...") */
  streamingLabel?: string;
  /** Optional label for multi-agent chats or system phases */
  agentLabel?: string;
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

  const handleOpenCitation = useMemo(() => {
    return (citationNumber: number) => {
      const citation = message.citationMap?.get(citationNumber);
      if (!citation?.sourceId) return;
      useTabStore.getState().openResourceTab(
        citation.sourceId,
        citation.resourceType || 'note',
        'Recurso'
      );
    };
  }, [message.citationMap]);

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
          pageLabel: citation.pageLabel,
          nodeTitle: citation.nodeTitle,
        };
      });
  }, [message.content, message.citationMap]);

  // Parse artifacts from message content and split into segments for inline rendering
  // Artifacts are embedded as JSON in ```artifact:TYPE ... ``` blocks — render at their position in text
  const contentSegments = useMemo(() => {
    if (!message.content) return [{ type: 'text' as const, content: '' }];

    const artifactRegex = /```artifact:(\w+)\n([\s\S]*?)```/g;
    const segments: Array<{ type: 'text'; content: string } | { type: 'artifact'; artifact: AnyArtifact }> = [];
    let lastIndex = 0;
    let match;

    while ((match = artifactRegex.exec(message.content)) !== null) {
      const textBefore = message.content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        segments.push({ type: 'text', content: textBefore });
      }
      try {
        const artifactType = match[1] as ArtifactType;
        const artifactData = JSON.parse(match[2]);
        segments.push({
          type: 'artifact',
          artifact: { type: artifactType, ...artifactData } as AnyArtifact,
        });
      } catch (error) {
        console.warn('[ChatMessage] Failed to parse artifact:', error);
      }
      lastIndex = match.index + match[0].length;
    }
    const textAfter = message.content.slice(lastIndex).trim();
    if (textAfter) {
      segments.push({ type: 'text', content: textAfter });
    }
    return segments.length > 0 ? segments : [{ type: 'text' as const, content: '' }];
  }, [message.content]);

  // Fallback: when AI failed to output artifact but called docling_list_images, build artifact from tool result
  const doclingFallbackArtifact = useMemo(
    () => buildDoclingArtifactFromListImages(message.toolCalls),
    [message.toolCalls],
  );

  // Fallback: base64 images from docling_show_page_images when artifact was not used
  const doclingImagesFromTools = useMemo(
    () => extractDoclingImagesFromToolCalls(message.toolCalls),
    [message.toolCalls],
  );

  const hasDoclingArtifact = contentSegments.some(
    (s) => s.type === 'artifact' && s.artifact.type === 'docling_images',
  );
  const hasDoclingFallback = !!doclingFallbackArtifact;

  // When AI called docling_list_images but didn't output artifact, append fallback at end
  const segmentsToRender = useMemo(() => {
    if (!hasDoclingFallback || hasDoclingArtifact) return contentSegments;
    return [...contentSegments, { type: 'artifact' as const, artifact: doclingFallbackArtifact as AnyArtifact }];
  }, [contentSegments, hasDoclingArtifact, hasDoclingFallback, doclingFallbackArtifact]);

  // Group tool calls by name for cleaner display
  const groupedToolCalls = useMemo(() => {
    if (!message.toolCalls || message.toolCalls.length === 0) return [];
    const grouped = new Map<string, ToolCallData[]>();
    for (const tc of message.toolCalls) {
      const arr = grouped.get(tc.name) ?? [];
      arr.push(tc);
      grouped.set(tc.name, arr);
    }
    return Array.from(grouped.entries()).map(([name, calls]) => ({ name, calls }));
  }, [message.toolCalls]);

  return (
    <div className={`group relative ${className}`}>
      <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Thinking - styled as minimalist card (Assistant only) */}
        {isAssistant && message.thinking && (
          <div className="w-full min-w-0 max-w-full">
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

        {/* Tool calls (Assistant only) - grouped by name for cleaner display */}
        {groupedToolCalls.length > 0 && (
          <div className="w-full min-w-0 max-w-full space-y-1">
            {groupedToolCalls.map(({ name, calls }) =>
              calls.length === 1 ? (
                <ChatToolCard key={calls[0].id} toolCall={calls[0]} />
              ) : (
                <ChatToolCardGroup key={name} name={name} calls={calls} />
              )
            )}
          </div>
        )}

        {!isUser && message.agentLabel ? (
          <div className="w-full min-w-0 max-w-full px-2">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--secondary-text)' }}>
              {message.agentLabel}
            </span>
          </div>
        ) : null}

        {/* Message content bubble */}
        {(message.content || message.isStreaming) && (
          <div className={`flex items-start gap-2 w-full min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>

            {/* User: copy button on hover (left of bubble) */}
            {isUser && (
              <button
                onClick={handleCopy}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--tertiary-text)' }}
                title="Copiar"
                aria-label="Copiar mensaje"
              >
                {copied
                  ? <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />
                  : <Copy className="w-3 h-3" />}
              </button>
            )}

            <div
              className={`relative min-w-0 text-[14px] leading-relaxed ${isUser ? 'inline-block max-w-[88%]' : 'block w-full'}`}
              style={isUser ? {
                background: 'transparent',
                borderRight: '2px solid var(--border)',
                padding: '2px 14px 2px 0',
                color: 'var(--primary-text)',
              } : {
                background: 'transparent',
                borderLeft: '2px solid var(--border)',
                padding: '2px 0 2px 14px',
                color: 'var(--primary-text)',
              }}
            >
              {/* Message text — segments interleaved: text | artifact | text | ... */}
              {message.content ? (
                <div className="min-w-0 w-full break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {isUser ? (
                    <span className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
                      {message.content.replace(/```artifact:\w+\n[\s\S]*?```/g, '').trim()}
                    </span>
                  ) : (
                    <>
                      {segmentsToRender.map((seg, idx) =>
                        seg.type === 'text' ? (
                          seg.content ? (
                            <MarkdownRenderer
                              key={`text-${idx}`}
                              content={seg.content}
                              citationMap={message.citationMap}
                              onClickCitation={onClickCitation || handleOpenCitation}
                            />
                          ) : null
                        ) : (
                          <div key={`artifact-${idx}`} className="my-3">
                            <ArtifactCard artifact={seg.artifact} />
                          </div>
                        ),
                      )}
                      {/* Fallback: base64 images from docling_show_page_images when no artifact */}
                      {!message.isStreaming && !hasDoclingArtifact && !hasDoclingFallback && doclingImagesFromTools.length > 0 && (
                        <div
                          className="mt-4 pt-4"
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <p
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--secondary-text)',
                              margin: '0 0 12px 0',
                            }}
                          >
                            Figuras del documento
                          </p>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12,
                            }}
                          >
                            {doclingImagesFromTools.map((item, i) => (
                              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {item.label && (
                                  <p
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--secondary-text)',
                                      margin: 0,
                                    }}
                                  >
                                    {item.label}
                                  </p>
                                )}
                                <img
                                  src={item.dataUrl}
                                  alt={item.label || `Figure ${i + 1}`}
                                  style={{
                                    maxWidth: 280,
                                    maxHeight: 200,
                                    objectFit: 'contain',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : message.isStreaming ? (
                <div className="flex items-center gap-2">
                  <ReadingIndicator className="opacity-60 text-[var(--secondary-text)]" />
                  <span className="text-[13px] text-[var(--secondary-text)]">{message.streamingLabel || 'Procesando...'}</span>
                </div>
              ) : null}

              {/* Streaming cursor */}
              {message.isStreaming && message.content && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse" aria-hidden />
              )}

              {/* User: timestamp shown below bubble on hover */}
              {isUser && message.content && (
                <div
                  className="mt-1 text-right opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ fontSize: '10px', color: 'var(--tertiary-text)' }}
                >
                  {formattedTime}
                </div>
              )}

              {/* Source references footer (assistant only) */}
              {isAssistant && !message.isStreaming && sourceReferences.length > 0 && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <SourceReference
                    sources={sourceReferences}
                    onClickSource={(source) => {
                      if (onClickCitation) { onClickCitation(source.number); return; }
                      void handleOpenCitation(source.number);
                    }}
                  />
                </div>
              )}

              {/* Assistant actions */}
              {isAssistant && !message.isStreaming && (
                <div
                  className="mt-2 pt-2 flex items-center gap-0.5 border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <button
                    onClick={handleCopy}
                    className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--tertiary-text)' }}
                    title="Copiar mensaje"
                    aria-label="Copiar mensaje"
                  >
                    {copied ? <Check className="w-3 h-3" style={{ color: 'var(--success)' }} /> : <Copy className="w-3 h-3" />}
                  </button>
                  {onSaveAsNote && message.content ? (
                    <button
                      onClick={handleSaveAsNote}
                      className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: savedAsNote ? 'var(--success)' : 'var(--tertiary-text)' }}
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
                      style={{ color: 'var(--tertiary-text)' }}
                      title="Regenerar respuesta"
                      aria-label="Regenerar respuesta"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  ) : null}
                  <span
                    className="ml-auto text-[10px]"
                    style={{ color: 'var(--tertiary-text)' }}
                  >
                    {formattedTime}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
