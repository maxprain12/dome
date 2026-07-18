import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { MessageFooter } from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import ChatToolCard, { ChatToolCardGroup, SubagentToolSection } from '@/components/chat/ChatToolCard';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import SourceReference from '@/components/chat/SourceReference';
import ManyActionSuggestion from '@/components/many/conversation/ManyActionSuggestion';
import { PinnedResourceChipList } from '@/components/many/PinnedResourceChipList';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { stripArtifactBlocks } from '@/lib/chat/artifactSchemas';
import { parseUserMessageVisualSegments } from '@/lib/chat/userMessageVisual';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { buildToolDisplayBlocks, type ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import { stripPinnedMentionTokens } from '@/lib/chat/pinLabels';
import { extractActionSuggestions } from '@/lib/many/actionSuggestions';
import { extractCitationNumbers } from '@/lib/utils/citations';
import { stableStringHash } from '@/lib/utils/stableStringHash';
import { buildPdfRegionHandoff } from '@/lib/pdf/pdf-region-handoff';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { showToast } from '@/lib/store/useToastStore';
import type { ManyMessageData } from '@/lib/many/types';
import { cn } from '@/lib/utils';

export interface ManyMessageViewProps {
  message: ManyMessageData;
  isLastInGroup?: boolean;
  onRegenerate?: () => void;
  onClickCitation?: (citationNumber: number) => void;
  className?: string;
}

function toolBlockKey(block: ToolDisplayBlock, idx: number): string {
  if (block.type === 'tool') return block.call.id;
  if (block.type === 'tool-group') return `group:${block.name}:${idx}`;
  return `subagent:${block.agentKey}:${idx}`;
}

function ToolBlock({ block }: { block: ToolDisplayBlock }) {
  if (block.type === 'tool') {
    return <ChatToolCard toolCall={block.call} surfaceVariant="many" />;
  }
  if (block.type === 'tool-group') {
    return <ChatToolCardGroup name={block.name} calls={block.calls} surfaceVariant="many" />;
  }
  return (
    <SubagentToolSection agentKey={block.agentKey} agentLabel={block.agentLabel} surfaceVariant="many">
      {block.blocks.map((inner, innerIdx) =>
        inner.type === 'tool' ? (
          <ChatToolCard key={inner.call.id} toolCall={inner.call} surfaceVariant="many" />
        ) : (
          <ChatToolCardGroup
            key={`${inner.name}:${innerIdx}`}
            name={inner.name}
            calls={inner.calls}
            surfaceVariant="many"
          />
        ),
      )}
    </SubagentToolSection>
  );
}

/**
 * One Many message. Asymmetric by design: the user speaks in a tinted bubble
 * on the right; Many answers as open prose on the panel surface, with tools,
 * reasoning and sources framed around it. Actions reveal on hover.
 */
export default function ManyMessageView({
  message,
  isLastInGroup = true,
  onRegenerate,
  onClickCitation,
  className,
}: ManyMessageViewProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const openCitation = useCallback(
    (citationNumber: number) => {
      if (onClickCitation) {
        onClickCitation(citationNumber);
        return;
      }
      const citation = message.citationMap?.get(citationNumber);
      if (!citation?.sourceId) return;
      useTabStore
        .getState()
        .openResourceTab(citation.sourceId, citation.resourceType || 'url', 'Recurso');
    },
    [message.citationMap, onClickCitation],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [message.content]);

  const pdfHandoffText = useCallback(() => {
    const meta = message.pdfRegionMeta;
    if (!meta || !message.content) return null;
    return buildPdfRegionHandoff({
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
  }, [message.content, message.pdfRegionMeta, t]);

  const handlePdfRegionContinue = useCallback(() => {
    const text = pdfHandoffText();
    if (!text) return;
    useManyStore.getState().setPendingManyHandoff(text);
    useManyStore.getState().setOpen(true);
  }, [pdfHandoffText]);

  const handlePdfRegionCopy = useCallback(async () => {
    const text = pdfHandoffText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', t('common.copied'));
    } catch {
      showToast('error', t('toast.clipboard_copy_error'));
    }
  }, [pdfHandoffText, t]);

  const formattedTime = useMemo(
    () =>
      new Date(message.timestamp).toLocaleTimeString(getDateTimeLocaleTag(), {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [message.timestamp],
  );

  const userVisualSegments = useMemo(() => {
    if (!isUser || !message.content) return null;
    const displayContent = stripPinnedMentionTokens(
      message.content,
      message.pinnedResources ?? [],
    );
    if (!displayContent.trim() && (message.pinnedResources?.length ?? 0) > 0) {
      // Pins are rendered as chips; nothing left to show in the bubble.
      return [];
    }
    const parsed = parseUserMessageVisualSegments(displayContent, message.attachments?.images);
    const counts = new Map<string, number>();
    return parsed.map((seg) => {
      const payload = seg.type === 'text' ? `text:${seg.value}` : `img:${seg.src}:${seg.alt ?? ''}`;
      const h = stableStringHash(payload);
      const ord = (counts.get(h) ?? 0) + 1;
      counts.set(h, ord);
      return { ...seg, reactKey: `${message.id}:uv:${h}:${ord}` };
    });
  }, [isUser, message.content, message.attachments?.images, message.pinnedResources, message.id]);

  const assistantMarkdown = useMemo(() => {
    if (!message.content || isUser) return '';
    return stripArtifactBlocks(message.content);
  }, [message.content, isUser]);

  const toolBlocks = useMemo(
    () => buildToolDisplayBlocks(coalesceDuplicateToolCalls(message.toolCalls ?? []), t),
    [message.toolCalls, t],
  );

  const actionSuggestions = useMemo(
    () => extractActionSuggestions(message.toolCalls),
    [message.toolCalls],
  );

  const sourceReferences = useMemo(() => {
    if (!message.citationMap || message.citationMap.size === 0 || !message.content) return [];
    return extractCitationNumbers(message.content)
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

  const userImageSegments =
    isUser && userVisualSegments ? userVisualSegments.filter((seg) => seg.type === 'image') : [];

  // ── User turn ──────────────────────────────────────────────────────────────
  if (isUser) {
    const pinned = message.pinnedResources ?? [];
    const userText =
      userVisualSegments && userVisualSegments.length > 0
        ? userVisualSegments
            .filter((seg) => seg.type === 'text')
            .map((seg) => (seg.type === 'text' ? seg.value : ''))
            .join('')
        : message.content
          ? stripPinnedMentionTokens(stripArtifactBlocks(message.content), pinned)
          : '';
    const hasBody = Boolean(userText.trim());
    return (
      <div className={cn('group/turn flex min-w-0 flex-col items-end gap-1.5', className)}>
        {pinned.length > 0 ? (
          <PinnedResourceChipList resources={pinned} align="end" className="max-w-[88%]" />
        ) : null}

        {userImageSegments.length > 0 ? (
          <AttachmentGroup className="justify-end">
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

        {hasBody ? (
          <Bubble variant="secondary" align="end" className="max-w-[88%]">
            <BubbleContent>
              <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {userText}
              </span>
            </BubbleContent>
          </Bubble>
        ) : null}

        {hasBody || pinned.length > 0 || userImageSegments.length > 0 ? (
          <MessageFooter className="gap-1 opacity-0 transition-opacity group-hover/turn:opacity-100 motion-reduce:transition-none">
            {hasBody ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => void handleCopy()}
                title={t('chat.copy_message')}
              >
                <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
              </Button>
            ) : null}
            <span className="text-xs tabular-nums text-muted-foreground">{formattedTime}</span>
          </MessageFooter>
        ) : null}
      </div>
    );
  }

  // ── Assistant / system turn ─────────────────────────────────────────────────
  return (
    <div className={cn('group/turn flex min-w-0 w-full flex-col gap-2', className)}>
      {isAssistant && message.thinking ? (
        <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen} className="w-full min-w-0">
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted motion-reduce:transition-none">
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className={cn('transition-transform motion-reduce:transition-none', thinkingOpen && 'rotate-90')}
            />
            {t('chat.reasoning')}
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-1.5 border-l py-1 pl-3.5">
            <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {message.thinking}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {toolBlocks.length > 0 ? (
        <div className="flex w-full min-w-0 flex-col gap-1.5">
          {toolBlocks.map((block, idx) => (
            <ToolBlock key={toolBlockKey(block, idx)} block={block} />
          ))}
        </div>
      ) : null}

      {actionSuggestions.length > 0 ? (
        <div className="flex w-full min-w-0 flex-col gap-2">
          {actionSuggestions.map((suggestion) => (
            <ManyActionSuggestion key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      ) : null}

      {message.agentLabel ? (
        <span className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {message.agentLabel}
        </span>
      ) : null}

      {message.isStreaming && !message.content ? (
        <Marker role="status">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent className="shimmer">
            {message.streamingLabel || t('chat.processing')}
          </MarkerContent>
        </Marker>
      ) : null}

      {message.content ? (
        <div className="min-w-0 w-full break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
          {assistantMarkdown ? (
            <MarkdownRenderer
              content={assistantMarkdown}
              citationMap={message.citationMap}
              onClickCitation={openCitation}
            />
          ) : null}
          {message.isStreaming ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current motion-reduce:animate-none"
            />
          ) : null}
        </div>
      ) : null}

      {isAssistant && !message.isStreaming && message.pdfRegionMeta ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="xs" onClick={handlePdfRegionContinue}>
            {t('viewer.pdf_region_qa_continue_many')}
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => void handlePdfRegionCopy()}>
            {t('viewer.pdf_region_qa_copy_handoff')}
          </Button>
        </div>
      ) : null}

      {isAssistant && !message.isStreaming && sourceReferences.length > 0 ? (
        <div className="border-t pt-2">
          <SourceReference
            sources={sourceReferences}
            onClickSource={(source) => openCitation(source.number)}
          />
        </div>
      ) : null}

      {isAssistant && !message.isStreaming && isLastInGroup ? (
        <MessageFooter className="gap-0.5 opacity-0 transition-opacity group-hover/turn:opacity-100 motion-reduce:transition-none">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => void handleCopy()}
            title={t('chat.copy_message')}
          >
            <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
          </Button>
          {onRegenerate ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onRegenerate}
              title={t('chat.regenerate')}
            >
              <HugeiconsIcon icon={RefreshIcon} />
            </Button>
          ) : null}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formattedTime}</span>
        </MessageFooter>
      ) : null}
    </div>
  );
}
