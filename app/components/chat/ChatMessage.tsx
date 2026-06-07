import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { Copy, Check, RefreshCw, ChevronRight, BookmarkPlus } from 'lucide-react';
import ChatToolCard, { ChatToolCardGroup, SubagentToolSection, type ToolCallData } from './ChatToolCard';
import ReadingIndicator from './ReadingIndicator';
import MarkdownRenderer from './MarkdownRenderer';
import SourceReference from './SourceReference';
import ArtifactCard, { type AnyArtifact, type ArtifactType } from './ArtifactCard';
import AgentRunTimeline from './AgentRunTimeline';
import ManyMinimalStatusRow from '@/components/many/ManyMinimalStatusRow';
import { cn } from '@/lib/utils';
import { extractCitationNumbers, type ParsedCitation } from '@/lib/utils/citations';
import { useTabStore } from '@/lib/store/useTabStore';
import { buildPdfRegionHandoff } from '@/lib/pdf/pdf-region-handoff';
import { useManyStore } from '@/lib/store/useManyStore';
import { showToast } from '@/lib/store/useToastStore';
import type { PdfRegionMeta } from '@/lib/store/useManyStore';
import { parseArtifactBlocks, stripArtifactBlocks } from '@/lib/chat/artifactSchemas';
import { parseUserMessageVisualSegments } from '@/lib/chat/userMessageVisual';
import { calendarArtifactFromToolCalls } from '@/lib/chat/calendarToolArtifact';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { buildToolDisplayBlocks, type ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import type { PersistentRunStep } from '@/lib/automations/api';
import { stableStringHash } from '@/lib/utils/stableStringHash';

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
  /** PDF region (cloud vision) — show handoff actions */
  pdfRegionMeta?: PdfRegionMeta;
  /** Structured run steps streamed from the agent runtime / run engine. */
  runSteps?: PersistentRunStep[];
}

/** Shared with ChatMessageGroup; `many` enables Many panel minimal skin */
export type ChatSurfaceVariant = 'default' | 'many';

interface ChatMessageProps {
  message: ChatMessageData;
  showAvatar?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onRegenerate?: () => void;
  onSaveAsNote?: (content: string) => void;
  onClickCitation?: (number: number) => void;
  surfaceVariant?: ChatSurfaceVariant;
  className?: string;
}

export default function ChatMessage({
  message,
  showAvatar: _showAvatar = true,
  isFirstInGroup: _isFirstInGroup = true,
  isLastInGroup: _isLastInGroup = true,
  onRegenerate,
  onSaveAsNote,
  onClickCitation,
  surfaceVariant = 'default',
  className = '',
}: ChatMessageProps) {
  const { i18n, t } = useTranslation();
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
        citation.resourceType || 'url',
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
  const userVisualSegments = useMemo(() => {
    if (!isUser || !message.content) return null;
    const parsed = parseUserMessageVisualSegments(message.content);
    const counts = new Map<string, number>();
    return parsed.map((seg) => {
      const payload =
        seg.type === 'text' ? `text:${seg.value}` : `img:${seg.src}:${seg.alt ?? ''}`;
      const h = stableStringHash(payload);
      const ord = (counts.get(h) ?? 0) + 1;
      counts.set(h, ord);
      return { ...seg, reactKey: `${message.id}:uv:${h}:${ord}` };
    });
  }, [isUser, message.content, message.id]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handlePdfRegionCloudHandoff = useCallback(() => {
    const meta = message.pdfRegionMeta;
    if (!meta || !message.content) return;
    const text = buildPdfRegionHandoff({
      resourceId: meta.resourceId,
      resourceTitle: meta.resourceTitle,
      page: meta.page,
      question: meta.question,
      answer: message.content,
      labels: {
        contextIntro: t('viewer.pdf_region_handoff_context_intro'),
        questionLabel: t('viewer.pdf_region_handoff_question_label'),
        answerLabel: t('viewer.pdf_region_handoff_answer_label'),
        answerSourceNote: t('viewer.pdf_region_handoff_answer_note'),
        followUpPrompt: t('viewer.pdf_region_handoff_follow_up'),
      },
    });
    useManyStore.getState().setPendingManyHandoff(text);
    useManyStore.getState().setOpen(true);
  }, [message.content, message.pdfRegionMeta, t]);

  const handlePdfRegionCopyHandoff = useCallback(async () => {
    const meta = message.pdfRegionMeta;
    if (!meta || !message.content) return;
    const text = buildPdfRegionHandoff({
      resourceId: meta.resourceId,
      resourceTitle: meta.resourceTitle,
      page: meta.page,
      question: meta.question,
      answer: message.content,
      labels: {
        contextIntro: t('viewer.pdf_region_handoff_context_intro'),
        questionLabel: t('viewer.pdf_region_handoff_question_label'),
        answerLabel: t('viewer.pdf_region_handoff_answer_label'),
        answerSourceNote: t('viewer.pdf_region_handoff_answer_note'),
        followUpPrompt: t('viewer.pdf_region_handoff_follow_up'),
      },
    });
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', t('common.copied'));
    } catch {
      showToast('error', t('common.clipboard_copy_error'));
    }
  }, [message.content, message.pdfRegionMeta, t]);

  // Format timestamp
  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString(getDateTimeLocaleTag(), { hour: '2-digit', minute: '2-digit' });
  }, [message.timestamp, i18n.language]);

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

  const contentSegments = useMemo(() => {
    const counts = new Map<string, number>();
    const nextKey = (payload: string) => {
      const h = stableStringHash(payload);
      const ord = (counts.get(h) ?? 0) + 1;
      counts.set(h, ord);
      return `${message.id}:cs:${h}:${ord}`;
    };

    if (!message.content) return [{ type: 'text' as const, content: '', reactKey: nextKey('empty') }];

    const parsed = parseArtifactBlocks(message.content, { allowStreaming: !!message.isStreaming });
    return parsed.map((seg) => {
      if (seg.kind === 'text') {
        return {
          type: 'text' as const,
          content: seg.content,
          reactKey: nextKey(`text:${seg.content}`),
        };
      }
      if (seg.kind === 'artifact') {
        return {
          type: 'artifact' as const,
          artifact: { ...seg.value, type: seg.artifactType as ArtifactType } as AnyArtifact,
          reactKey: nextKey(`artifact:${seg.artifactType}:${JSON.stringify(seg.value)}`),
        };
      }
      if (seg.kind === 'invalid') {
        return {
          type: 'text' as const,
          content: `\`\`\`json\n${seg.raw}\n\`\`\`\n*${t('chat.artifact_invalid')}*`,
          reactKey: nextKey(`invalid:${seg.raw}`),
        };
      }
      return {
        type: 'text' as const,
        content: `*${t('chat.artifact_streaming', { type: seg.artifactType, defaultValue: `Generando artefacto (${seg.artifactType})…` })}*`,
        reactKey: nextKey(`stream:${seg.artifactType}`),
      };
    });
  }, [message.content, message.isStreaming, message.id, t]);

  const displayToolCalls = useMemo(
    () => coalesceDuplicateToolCalls(message.toolCalls ?? []),
    [message.toolCalls],
  );

  const toolDisplayBlocks = useMemo(
    () => buildToolDisplayBlocks(displayToolCalls, t),
    [displayToolCalls, t],
  );

  const derivedCalendarArtifact = useMemo((): AnyArtifact | null => {
    if (!isAssistant || !displayToolCalls.length) return null;
    const c = message.content || '';
    if (c.includes('artifact:calendar_event')) return null;
    return calendarArtifactFromToolCalls(displayToolCalls);
  }, [isAssistant, displayToolCalls, message.content]);

  return (
    <div className={`ai-message-item group relative ${className}`}>
      <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Thinking - styled as minimalist card (Assistant only) */}
        {isAssistant && message.thinking && (
          <div className="w-full min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="group flex items-center gap-2 py-1 px-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <div className="flex items-center justify-center size-5 rounded text-[var(--tertiary-text)] group-hover:text-[var(--secondary-text)]">
                <ChevronRight className={`size-3.5 transition-transform ${thinkingExpanded ? 'rotate-90' : ''}`} />
              </div>
              <span className="text-[13px] font-medium text-[var(--secondary-text)]">
                {t('chat.reasoning')}
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

        {/* Tool calls — supervisor tools + nested subagent sections */}
        {toolDisplayBlocks.length > 0 ? (
          <div className="w-full min-w-0 max-w-full space-y-1.5">
            {toolDisplayBlocks.map((block, idx) => (
              <ToolDisplayBlockView
                key={toolBlockKey(block, idx)}
                block={block}
                surfaceVariant={surfaceVariant}
              />
            ))}
          </div>
        ) : null}

        {derivedCalendarArtifact ? (
          <div className="w-full min-w-0 max-w-full my-2">
            <ArtifactCard artifact={derivedCalendarArtifact} />
          </div>
        ) : null}

        {isAssistant && message.runSteps && message.runSteps.length > 0 ? (
          <AgentRunTimeline
            steps={message.runSteps}
            className="max-w-full"
            surfaceVariant={surfaceVariant}
          />
        ) : null}

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
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex size-6 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--tertiary-text)' }}
                title={t('chat.copy_message')}
                aria-label={t('chat.copy_message')}
              >
                {copied
                  ? <Check className="size-3" style={{ color: 'var(--success)' }} />
                  : <Copy className="size-3" />}
              </button>
            )}

            <div
              className={cn(
                'relative min-w-0',
                surfaceVariant === 'many'
                  ? cn(
                      'many-bubble-clean',
                      isUser ? 'many-bubble-clean--user inline-block max-w-[88%]' : 'many-bubble-clean--assistant block w-full',
                    )
                  : cn(
                      'text-[14px] leading-relaxed',
                      isUser ? 'inline-block max-w-[88%]' : 'block w-full',
                    ),
              )}
              style={
                surfaceVariant === 'many'
                  ? undefined
                  : isUser
                    ? {
                        background: 'transparent',
                        borderRight: '2px solid var(--border)',
                        padding: '2px 14px 2px 0',
                        color: 'var(--primary-text)',
                      }
                    : {
                        background: 'transparent',
                        borderLeft: '2px solid var(--border)',
                        padding: '2px 0 2px 14px',
                        color: 'var(--primary-text)',
                      }
              }
            >
              {/* Message text — segments interleaved: text | artifact | text | ... */}
              {message.content ? (
                <div className="min-w-0 w-full break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {isUser && userVisualSegments && userVisualSegments.length > 0 ? (
                    <div className="flex flex-col gap-2 min-w-0 w-full">
                      {userVisualSegments.map((seg) =>
                        seg.type === 'text' ? (
                          <span
                            key={seg.reactKey}
                            className="whitespace-pre-wrap break-words"
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {seg.value}
                          </span>
                        ) : (
                          <div key={seg.reactKey} className="min-w-0 max-w-full rounded-md overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                            <img
                              src={seg.src}
                              alt={seg.alt || t('chat.attachment_image_alt')}
                              className="max-w-full max-h-64 w-auto object-contain block mx-auto"
                              loading="lazy"
                            />
                          </div>
                        ),
                      )}
                    </div>
                  ) : !isUser ? (
                    <>
                      {contentSegments.map((seg) =>
                        seg.type === 'text' ? (
                          seg.content ? (
                            <MarkdownRenderer
                              key={seg.reactKey}
                              content={seg.content}
                              citationMap={message.citationMap}
                              onClickCitation={onClickCitation || handleOpenCitation}
                            />
                          ) : null
                        ) : (
                          <div key={seg.reactKey} className="my-3">
                            <ArtifactCard artifact={seg.artifact} />
                          </div>
                        ),
                      )}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
                      {message.content ? stripArtifactBlocks(message.content) : ''}
                    </span>
                  )}
                </div>
              ) : message.isStreaming ? (
                surfaceVariant === 'many' ? (
                  <ManyMinimalStatusRow variant="dots" label={message.streamingLabel || t('chat.processing')} />
                ) : (
                  <div className="flex items-center gap-2">
                    <ReadingIndicator className="opacity-60 text-[var(--secondary-text)]" />
                    <span className="text-[13px] text-[var(--secondary-text)]">
                      {message.streamingLabel || t('chat.processing')}
                    </span>
                  </div>
                )
              ) : null}

              {/* Streaming cursor */}
              {message.isStreaming && message.content && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse" aria-hidden />
              )}

              {/* User: timestamp shown below bubble on hover */}
              {isUser && message.content && (
                <div
                  className="mt-1 text-right opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ fontSize: surfaceVariant === 'many' ? '11px' : '12px', color: 'var(--tertiary-text)' }}
                >
                  {formattedTime}
                </div>
              )}

              {isAssistant && !message.isStreaming && message.pdfRegionMeta && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--base-text, #fff)',
                    }}
                    onClick={handlePdfRegionCloudHandoff}
                  >
                    {t('viewer.pdf_region_qa_continue_many')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
                    onClick={() => void handlePdfRegionCopyHandoff()}
                  >
                    {t('viewer.pdf_region_qa_copy_handoff')}
                  </button>
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
                    className="flex size-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--tertiary-text)' }}
                    title={t('chat.copy_message')}
                    aria-label={t('chat.copy_message')}
                  >
                    {copied ? <Check className="size-3" style={{ color: 'var(--success)' }} /> : <Copy className="size-3" />}
                  </button>
                  {onSaveAsNote && message.content ? (
                    <button
                      onClick={handleSaveAsNote}
                      className="flex size-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: savedAsNote ? 'var(--success)' : 'var(--tertiary-text)' }}
                      title={savedAsNote ? t('chat.saved_as_note') : t('chat.save_as_note')}
                      aria-label={savedAsNote ? t('chat.saved_as_note') : t('chat.save_as_note')}
                    >
                      {savedAsNote ? <Check className="size-3" /> : <BookmarkPlus className="size-3" />}
                    </button>
                  ) : null}
                  {onRegenerate ? (
                    <button
                      onClick={onRegenerate}
                      className="flex size-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--tertiary-text)' }}
                      title={t('chat.regenerate')}
                      aria-label={t('chat.regenerate')}
                    >
                      <RefreshCw className="size-3" />
                    </button>
                  ) : null}
                  <span
                    className={`ml-auto ${surfaceVariant === 'many' ? 'text-[9px] opacity-70' : 'text-[10px]'}`}
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

function toolBlockKey(block: ToolDisplayBlock, idx: number): string {
  if (block.type === 'tool') return block.call.id;
  if (block.type === 'tool-group') return `group:${block.name}:${idx}`;
  return `subagent:${block.agentKey}:${idx}`;
}

function ToolDisplayBlockView({
  block,
  surfaceVariant,
}: {
  block: ToolDisplayBlock;
  surfaceVariant: 'default' | 'many';
}) {
  if (block.type === 'tool') {
    return <ChatToolCard toolCall={block.call} surfaceVariant={surfaceVariant} />;
  }
  if (block.type === 'tool-group') {
    return (
      <ChatToolCardGroup
        name={block.name}
        calls={block.calls}
        surfaceVariant={surfaceVariant}
      />
    );
  }
  return (
    <SubagentToolSection
      agentKey={block.agentKey}
      agentLabel={block.agentLabel}
      surfaceVariant={surfaceVariant}
    >
      {block.blocks.map((inner, innerIdx) =>
        inner.type === 'tool' ? (
          <ChatToolCard key={inner.call.id} toolCall={inner.call} surfaceVariant={surfaceVariant} />
        ) : (
          <ChatToolCardGroup
            key={`${inner.name}:${innerIdx}`}
            name={inner.name}
            calls={inner.calls}
            surfaceVariant={surfaceVariant}
          />
        ),
      )}
    </SubagentToolSection>
  );
}
