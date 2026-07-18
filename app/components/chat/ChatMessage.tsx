import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  BookmarkPlusIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import ChatToolCard, { ChatToolCardGroup, SubagentToolSection, type ToolCallData } from './ChatToolCard';
import { ChatStateMarker } from './ChatStateMarker';
import MarkdownRenderer from './MarkdownRenderer';
import SourceReference from './SourceReference';
import AgentRunTimeline from './AgentRunTimeline';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { MessageFooter } from '@/components/ui/message';
import { cn } from '@/lib/utils';
import { extractCitationNumbers, type ParsedCitation } from '@/lib/utils/citations';
import { useTabStore } from '@/lib/store/useTabStore';
import { buildPdfRegionHandoff } from '@/lib/pdf/pdf-region-handoff';
import { useManyStore } from '@/lib/store/useManyStore';
import { showToast } from '@/lib/store/useToastStore';
import type { PdfRegionMeta } from '@/lib/store/useManyStore';
import { stripArtifactBlocks } from '@/lib/chat/artifactSchemas';
import type { StructuredMessageAttachments } from '@/lib/chat/attachmentTypes';
import { parseUserMessageVisualSegments } from '@/lib/chat/userMessageVisual';
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
  /** Structured image attachments for resolving dome-att:// placeholders */
  attachments?: StructuredMessageAttachments;
  /** Pins that rode with this user turn (Many transcript chips). */
  pinnedResources?: Array<{
    id: string;
    title: string;
    type: string;
    kind?: 'person' | 'resource' | 'issue' | 'email' | 'social_post';
  }>;
  /** Structured run steps streamed from the agent runtime / run engine. */
  runSteps?: PersistentRunStep[];
}

function toolBlockKey(block: ToolDisplayBlock, idx: number): string {
  if (block.type === 'tool') return block.call.id;
  if (block.type === 'tool-group') return `group:${block.name}:${idx}`;
  return `subagent:${block.agentKey}:${idx}`;
}

function ToolDisplayBlockView({ block, surfaceVariant }: { block: ToolDisplayBlock; surfaceVariant: ChatSurfaceVariant }) {
  if (block.type === 'tool') return <ChatToolCard toolCall={block.call} surfaceVariant={surfaceVariant} />;
  if (block.type === 'tool-group') return <ChatToolCardGroup name={block.name} calls={block.calls} surfaceVariant={surfaceVariant} />;
  return (
    <SubagentToolSection agentKey={block.agentKey} agentLabel={block.agentLabel} surfaceVariant={surfaceVariant}>
      {block.blocks.map((inner, innerIdx) => inner.type === 'tool' ? (
        <ChatToolCard key={inner.call.id} toolCall={inner.call} surfaceVariant={surfaceVariant} />
      ) : (
        <ChatToolCardGroup key={`${inner.name}:${innerIdx}`} name={inner.name} calls={inner.calls} surfaceVariant={surfaceVariant} />
      ))}
    </SubagentToolSection>
  );
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
  const { t } = useTranslation();
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
    const parsed = parseUserMessageVisualSegments(message.content, message.attachments?.images);
    const counts = new Map<string, number>();
    return parsed.map((seg) => {
      const payload =
        seg.type === 'text' ? `text:${seg.value}` : `img:${seg.src}:${seg.alt ?? ''}`;
      const h = stableStringHash(payload);
      const ord = (counts.get(h) ?? 0) + 1;
      counts.set(h, ord);
      return { ...seg, reactKey: `${message.id}:uv:${h}:${ord}` };
    });
  }, [isUser, message.content, message.attachments?.images, message.id]);

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
  const dateTimeLocaleTag = getDateTimeLocaleTag();
  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString(dateTimeLocaleTag, { hour: '2-digit', minute: '2-digit' });
  }, [message.timestamp, dateTimeLocaleTag]);

  // Build source references from citation map and message content
  const sourceReferences = useMemo(() => {
    if (!message.citationMap || message.citationMap.size === 0 || !message.content) {
      return [];
    }

    const citationNumbers = extractCitationNumbers(message.content);
    const refs: {
      number: number;
      id: string;
      title: string;
      type: string;
      pageLabel?: string;
      nodeTitle?: string;
    }[] = [];
    for (const num of citationNumbers) {
      if (!message.citationMap!.has(num)) continue;
      const citation = message.citationMap!.get(num)!;
      refs.push({
        number: num,
        id: citation.sourceId || '',
        title: citation.sourceTitle || `Source ${num}`,
        type: 'resource',
        pageLabel: citation.pageLabel,
        nodeTitle: citation.nodeTitle,
      });
    }
    return refs;
  }, [message.content, message.citationMap]);

  const assistantMarkdown = useMemo(() => {
    if (!message.content || isUser) return '';
    return stripArtifactBlocks(message.content);
  }, [message.content, isUser]);

  const displayToolCalls = useMemo(
    () => coalesceDuplicateToolCalls(message.toolCalls ?? []),
    [message.toolCalls],
  );

  const toolDisplayBlocks = useMemo(
    () => buildToolDisplayBlocks(displayToolCalls, t),
    [displayToolCalls, t],
  );

  const streamingLabel = message.streamingLabel || t('chat.processing');
  const streamingMarker =
    message.isStreaming && !message.content ? <ChatStateMarker label={streamingLabel} /> : null;

  const renderBubbleInner = () =>
    message.content ? (
      <>
        <div className="min-w-0 w-full break-words [overflow-wrap:anywhere]">
          {isUser && userVisualSegments && userVisualSegments.length > 0 ? (
            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {userVisualSegments
                .filter((seg) => seg.type === 'text')
                .map((seg) => (
                  <span key={seg.reactKey}>{seg.type === 'text' ? seg.value : null}</span>
                ))}
            </span>
          ) : !isUser ? (
            assistantMarkdown ? (
              <MarkdownRenderer
                content={assistantMarkdown}
                citationMap={message.citationMap}
                onClickCitation={onClickCitation || handleOpenCitation}
              />
            ) : null
          ) : (
            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {stripArtifactBlocks(message.content)}
            </span>
          )}
        </div>
        {message.isStreaming ? (
          <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse motion-reduce:animate-none" aria-hidden />
        ) : null}
      </>
    ) : null;


    const userImageSegments =
      isUser && userVisualSegments
        ? userVisualSegments.filter((seg) => seg.type === 'image')
        : [];

    return (
      <div className={cn('group flex min-w-0 w-full flex-col gap-2', className)}>
        {isAssistant && message.thinking ? (
          <Collapsible
            open={thinkingExpanded}
            onOpenChange={setThinkingExpanded}
            className="w-full min-w-0 max-w-full"
          >
            <CollapsibleTrigger className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted">
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className={cn('text-muted-foreground transition-transform', thinkingExpanded && 'rotate-90')}
              />
              <span className="text-sm font-medium text-muted-foreground">{t('chat.reasoning')}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-2 border-l border-border py-1 pl-4">
              <div className="text-xs whitespace-pre-wrap break-words text-muted-foreground opacity-90">
                {message.thinking}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {toolDisplayBlocks.length > 0 ? (
          <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5">
            {toolDisplayBlocks.map((block, idx) => (
              <ToolDisplayBlockView
                key={toolBlockKey(block, idx)}
                block={block}
                surfaceVariant={surfaceVariant}
              />
            ))}
          </div>
        ) : null}

        {isAssistant && message.runSteps && message.runSteps.length > 0 ? (
          <AgentRunTimeline steps={message.runSteps} className="max-w-full" surfaceVariant={surfaceVariant} />
        ) : null}

        {!isUser && message.agentLabel ? (
          <div className="w-full min-w-0 max-w-full px-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {message.agentLabel}
            </span>
          </div>
        ) : null}

        {userImageSegments.length > 0 ? (
          <AttachmentGroup>
            {userImageSegments.map((seg) =>
              seg.type === 'image' ? (
                <Attachment key={seg.reactKey} state="done" size="sm">
                  <AttachmentMedia variant="image">
                    <img src={seg.src} alt={seg.alt || t('chat.attachment_image_alt')} loading="lazy" />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{seg.alt || t('chat.attachment_image_alt')}</AttachmentTitle>
                  </AttachmentContent>
                </Attachment>
              ) : null,
            )}
          </AttachmentGroup>
        ) : null}

        {streamingMarker}

        {message.content ? (
          <Bubble variant={isUser ? 'default' : 'muted'} align={isUser ? 'end' : 'start'}>
            <BubbleContent>{renderBubbleInner()}</BubbleContent>
          </Bubble>
        ) : null}

        {isAssistant && !message.isStreaming && message.pdfRegionMeta ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" size="xs" onClick={handlePdfRegionCloudHandoff}>
              {t('viewer.pdf_region_qa_continue_many')}
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={() => void handlePdfRegionCopyHandoff()}>
              {t('viewer.pdf_region_qa_copy_handoff')}
            </Button>
          </div>
        ) : null}

        {isAssistant && !message.isStreaming && sourceReferences.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Separator />
            <SourceReference
              sources={sourceReferences}
              onClickSource={(source) => {
                if (onClickCitation) {
                  onClickCitation(source.number);
                  return;
                }
                handleOpenCitation(source.number);
              }}
            />
          </div>
        ) : null}

        {isUser && message.content ? (
          <MessageFooter className="gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => void handleCopy()} title={t('chat.copy_message')}>
              <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">{formattedTime}</span>
          </MessageFooter>
        ) : null}

        {isAssistant && !message.isStreaming ? (
          <MessageFooter className="gap-0.5">
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => void handleCopy()} title={t('chat.copy_message')}>
              <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
            </Button>
            {onSaveAsNote && message.content ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={handleSaveAsNote}
                title={savedAsNote ? t('chat.saved_as_note') : t('chat.save_as_note')}
              >
                <HugeiconsIcon icon={savedAsNote ? CheckmarkCircle02Icon : BookmarkPlusIcon} />
              </Button>
            ) : null}
            {onRegenerate ? (
              <Button type="button" size="icon-xs" variant="ghost" onClick={onRegenerate} title={t('chat.regenerate')}>
                <HugeiconsIcon icon={RefreshIcon} />
              </Button>
            ) : null}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formattedTime}</span>
          </MessageFooter>
        ) : null}
      </div>
    );
}
