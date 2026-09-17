import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { ChatToolResultBody, SubagentToolSection } from '@/components/chat/ChatToolCard';
import ChatTodoList from '@/components/chat/ChatTodoList';
import SourceReference from '@/components/chat/SourceReference';
import ManyActionSuggestion from '@/components/many/conversation/ManyActionSuggestion';
import ManyActivityTrace, { ManyActivityBlocks } from '@/components/many/conversation/ManyActivityTrace';
import {
  ManyAssistantVisualBody,
  ManyReferenceCardsFromBlocks,
} from '@/components/many/conversation/ManyVisualCards';
import { PinnedResourceChipList } from '@/components/many/PinnedResourceChipList';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
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
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { stripArtifactBlocks } from '@/lib/chat/artifactSchemas';
import {
  parseUserMessageVisualSegments,
  type UserMessageImageRef,
  type UserMessageVisualSegment,
} from '@/lib/chat/userMessageVisual';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import type { ToolDisplayBlock } from '@/lib/chat/groupToolCalls';
import { interleaveMessageParts, type MessagePart } from '@/lib/chat/interleaveMessageParts';
import { activityTraceCopyFromT } from '@/lib/chat/manyActivityTrace';
import { parseTodos } from '@/lib/chat/todos';
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

type KeyedUserVisualSegment = UserMessageVisualSegment & { reactKey: string };

type SourceRef = {
  number: number;
  id: string;
  title: string;
  type: string;
  pageLabel?: string;
  nodeTitle?: string;
};

function toolBlocksKey(blocks: ToolDisplayBlock[]): string {
  return blocks
    .map((block, idx) => {
      if (block.type === 'tool') return block.call.id;
      if (block.type === 'tool-group') return `group:${block.name}:${idx}`;
      return `subagent:${block.agentKey}:${idx}`;
    })
    .join('|');
}

/** Build keyed visual segments for a user message — extracted for S3776. */
function buildKeyedUserVisualSegments(
  messageId: string,
  content: string | undefined,
  pinnedResources: ManyMessageData['pinnedResources'],
  images: UserMessageImageRef[] | undefined,
): KeyedUserVisualSegment[] | null {
  if (!content) return null;
  const displayContent = stripPinnedMentionTokens(content, pinnedResources ?? []);
  if (!displayContent.trim() && (pinnedResources?.length ?? 0) > 0) {
    // Pins are rendered as chips; nothing left to show in the bubble.
    return [];
  }
  const parsed = parseUserMessageVisualSegments(displayContent, images);
  const counts = new Map<string, number>();
  return parsed.map((seg) => {
    const payload = seg.type === 'text' ? `text:${seg.value}` : `img:${seg.src}:${seg.alt ?? ''}`;
    const h = stableStringHash(payload);
    const ord = (counts.get(h) ?? 0) + 1;
    counts.set(h, ord);
    return { ...seg, reactKey: `${messageId}:uv:${h}:${ord}` };
  });
}

/** Resolve the plain-text body shown in the user bubble — extracted for S3776. */
function resolveUserBubbleText(
  userVisualSegments: KeyedUserVisualSegment[] | null,
  message: ManyMessageData,
): string {
  const pinned = message.pinnedResources ?? [];
  if (userVisualSegments && userVisualSegments.length > 0) {
    return userVisualSegments
      .filter((seg) => seg.type === 'text')
      .map((seg) => (seg.type === 'text' ? seg.value : ''))
      .join('');
  }
  if (!message.content) return '';
  return stripPinnedMentionTokens(stripArtifactBlocks(message.content), pinned);
}

/** Citation map → SourceReference rows — extracted for S3776. */
function buildSourceReferences(message: ManyMessageData): SourceRef[] {
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
}

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(getDateTimeLocaleTag(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Open a citation via prop or default resource tab — extracted for S3776. */
function openMessageCitation(
  citationNumber: number,
  message: ManyMessageData,
  onClickCitation?: (citationNumber: number) => void,
): void {
  if (onClickCitation) {
    onClickCitation(citationNumber);
    return;
  }
  const citation = message.citationMap?.get(citationNumber);
  if (!citation?.sourceId) return;
  useTabStore
    .getState()
    .openResourceTab(citation.sourceId, citation.resourceType || 'url', 'Recurso');
}

/** Build PDF region handoff text, or null when meta/content is missing. */
function buildMessagePdfHandoff(
  message: ManyMessageData,
  labels: {
    contextIntro: string;
    questionLabel: string;
    answerLabel: string;
    answerSourceNote: string;
    followUpPrompt: string;
  },
): string | null {
  const meta = message.pdfRegionMeta;
  if (!meta || !message.content) return null;
  return buildPdfRegionHandoff({
    resourceId: meta.resourceId,
    resourceTitle: meta.resourceTitle,
    page: meta.page,
    question: meta.question,
    answer: message.content,
    labels,
  });
}

/** Live reasoning is the only visible content while streaming — extracted for S3776. */
function isAssistantThinkingLive(message: ManyMessageData): boolean {
  if (!message.isStreaming) return false;
  if (!message.thinking) return false;
  return !message.content?.trim();
}

function UserImageAttachments({
  segments,
  imageAlt,
}: {
  segments: KeyedUserVisualSegment[];
  imageAlt: string;
}) {
  const images = segments.filter((seg) => seg.type === 'image');
  if (images.length === 0) return null;
  return (
    <AttachmentGroup className="justify-end">
      {images.map((seg) =>
        seg.type === 'image' ? (
          <Attachment key={seg.reactKey} state="done" size="sm">
            <AttachmentMedia variant="image">
              <img src={seg.src} alt={seg.alt || imageAlt} loading="lazy" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{seg.alt || imageAlt}</AttachmentTitle>
            </AttachmentContent>
          </Attachment>
        ) : null,
      )}
    </AttachmentGroup>
  );
}

function UserTurnFooter({
  hasBody,
  show,
  copied,
  formattedTime,
  onCopy,
  copyTitle,
}: {
  hasBody: boolean;
  show: boolean;
  copied: boolean;
  formattedTime: string;
  onCopy: () => void;
  copyTitle: string;
}) {
  if (!show) return null;
  return (
    <MessageFooter className="gap-1 opacity-0 transition-opacity group-hover/turn:opacity-100 motion-reduce:transition-none">
      {hasBody ? (
        <Button type="button" size="icon-xs" variant="ghost" onClick={onCopy} title={copyTitle}>
          <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
        </Button>
      ) : null}
      <span className="text-xs tabular-nums text-muted-foreground">{formattedTime}</span>
    </MessageFooter>
  );
}

/** User turn (bubble + pins + attachments) — extracted for S3776. */
function ManyUserMessageTurn({
  message,
  className,
}: {
  message: ManyMessageData;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [message.content]);

  const formattedTime = useMemo(() => formatMessageTime(message.timestamp), [message.timestamp]);

  const userVisualSegments = useMemo(
    () =>
      buildKeyedUserVisualSegments(
        message.id,
        message.content,
        message.pinnedResources,
        message.attachments?.images,
      ),
    [message.id, message.content, message.attachments?.images, message.pinnedResources],
  );

  const userText = resolveUserBubbleText(userVisualSegments, message);
  const hasBody = Boolean(userText.trim());
  const pinned = message.pinnedResources ?? [];
  const showFooter = hasBody || pinned.length > 0 || (userVisualSegments?.some((s) => s.type === 'image') ?? false);

  return (
    <div className={cn('group/turn flex min-w-0 flex-col items-end gap-1.5', className)}>
      {pinned.length > 0 ? (
        <PinnedResourceChipList resources={pinned} align="end" className="max-w-[88%]" />
      ) : null}

      {userVisualSegments ? (
        <UserImageAttachments
          segments={userVisualSegments}
          imageAlt={t('chat.attachment_image_alt')}
        />
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

      <UserTurnFooter
        hasBody={hasBody}
        show={showFooter}
        copied={copied}
        formattedTime={formattedTime}
        onCopy={() => {
          handleCopy().catch(() => {});
        }}
        copyTitle={t('chat.copy_message')}
      />
    </div>
  );
}

function AssistantMessageParts({
  parts,
  isStreaming,
  citationMap,
  onClickCitation,
  copy,
  toolLabelT,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
  citationMap: ManyMessageData['citationMap'];
  onClickCitation: (n: number) => void;
  copy: ReturnType<typeof activityTraceCopyFromT>;
  toolLabelT: (key: string, opts?: { defaultValue?: string }) => string;
}) {
  return (
    <>
      {parts.map((part, partIdx) =>
        part.type === 'tools' ? (
          <div key={`part:${partIdx}:tools:${toolBlocksKey(part.blocks)}`} className="flex w-full min-w-0 flex-col gap-2">
            <ManyActivityBlocks
              blocks={part.blocks}
              copy={copy}
              toolLabelT={toolLabelT}
              linkMode="ipc"
              renderToolDetail={(call) => <ChatToolResultBody toolCall={call} />}
              renderTodos={(call) => {
                const todos = parseTodos(call.arguments);
                return todos.length > 0 ? <ChatTodoList todos={todos} /> : null;
              }}
              renderSubagent={({ agentKey, agentLabel, children }) => (
                <SubagentToolSection agentKey={agentKey} agentLabel={agentLabel} surfaceVariant="many">
                  {children}
                </SubagentToolSection>
              )}
            />
            <ManyReferenceCardsFromBlocks blocks={part.blocks} />
          </div>
        ) : (
          <ManyAssistantVisualBody
            key={`part:${partIdx}:text`}
            content={part.text}
            allowStreaming={isStreaming && partIdx === parts.length - 1}
            citationMap={citationMap}
            onClickCitation={onClickCitation}
            showCaret={isStreaming && partIdx === parts.length - 1}
          />
        ),
      )}
    </>
  );
}

function AssistantStreamingStatus({ label }: { label: string }) {
  return (
    <Marker role="status">
      <MarkerIcon>
        <Spinner />
      </MarkerIcon>
      <MarkerContent className="shimmer">{label}</MarkerContent>
    </Marker>
  );
}

function AssistantPdfRegionActions({
  continueLabel,
  copyLabel,
  onContinue,
  onCopy,
}: {
  continueLabel: string;
  copyLabel: string;
  onContinue: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="xs" onClick={onContinue}>
        {continueLabel}
      </Button>
      <Button type="button" size="xs" variant="outline" onClick={onCopy}>
        {copyLabel}
      </Button>
    </div>
  );
}

function AssistantSources({
  sources,
  onClickSource,
}: {
  sources: SourceRef[];
  onClickSource: (source: SourceRef) => void;
}) {
  return (
    <div className="border-t pt-2">
      <SourceReference sources={sources} onClickSource={onClickSource} />
    </div>
  );
}

function AssistantTurnFooter({
  copied,
  formattedTime,
  onCopy,
  onRegenerate,
  copyTitle,
  regenerateTitle,
}: {
  copied: boolean;
  formattedTime: string;
  onCopy: () => void;
  onRegenerate?: () => void;
  copyTitle: string;
  regenerateTitle: string;
}) {
  return (
    <MessageFooter className="gap-0.5 opacity-0 transition-opacity group-hover/turn:opacity-100 motion-reduce:transition-none">
      <Button type="button" size="icon-xs" variant="ghost" onClick={onCopy} title={copyTitle}>
        <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
      </Button>
      {onRegenerate ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onRegenerate}
          title={regenerateTitle}
        >
          <HugeiconsIcon icon={RefreshIcon} />
        </Button>
      ) : null}
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formattedTime}</span>
    </MessageFooter>
  );
}

function ActionSuggestionsList({
  suggestions,
}: {
  suggestions: ReturnType<typeof extractActionSuggestions>;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {suggestions.map((suggestion) => (
        <ManyActionSuggestion key={suggestion.id} suggestion={suggestion} />
      ))}
    </div>
  );
}

/** Assistant / system turn — extracted for S3776. */
function ManyAssistantMessageTurn({
  message,
  isLastInGroup,
  onRegenerate,
  onClickCitation,
  className,
}: {
  message: ManyMessageData;
  isLastInGroup: boolean;
  onRegenerate?: () => void;
  onClickCitation?: (citationNumber: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';
  const thinkingIsLive = isAssistantThinkingLive(message);
  const traceCopy = useMemo(
    () => activityTraceCopyFromT((key, opts) => t(`chat.${key}`, opts)),
    [t],
  );

  const openCitation = useCallback(
    (citationNumber: number) => openMessageCitation(citationNumber, message, onClickCitation),
    [message, onClickCitation],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        message.content ? stripArtifactBlocks(message.content) : '',
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [message.content]);

  const pdfHandoffText = useCallback(
    () =>
      buildMessagePdfHandoff(message, {
        contextIntro: t('viewer.pdf_region_handoff_context_intro'),
        questionLabel: t('viewer.pdf_region_handoff_question_label'),
        answerLabel: t('viewer.pdf_region_handoff_answer_label'),
        answerSourceNote: t('viewer.pdf_region_handoff_answer_note'),
        followUpPrompt: t('viewer.pdf_region_handoff_follow_up'),
      }),
    [message, t],
  );

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

  const formattedTime = useMemo(() => formatMessageTime(message.timestamp), [message.timestamp]);

  // Keep artifact fences in the prose so visual cards can render in place.
  // Offsets on tool calls were measured against this original content.
  const messageParts = useMemo(
    () =>
      interleaveMessageParts(
        message.content ?? '',
        coalesceDuplicateToolCalls(message.toolCalls ?? []),
        t,
      ),
    [message.content, message.toolCalls, t],
  );

  const actionSuggestions = useMemo(
    () => extractActionSuggestions(message.toolCalls),
    [message.toolCalls],
  );

  const sourceReferences = useMemo(
    () => buildSourceReferences(message),
    [message.content, message.citationMap],
  );

  const showThinking = isAssistant && Boolean(message.thinking);
  const showStreamingStatus = Boolean(message.isStreaming && !message.content && isLastInGroup);
  const showIdleExtras = isAssistant && !message.isStreaming;
  const showPdfActions = showIdleExtras && Boolean(message.pdfRegionMeta);
  const showSources = showIdleExtras && sourceReferences.length > 0;
  const showFooter = showIdleExtras && isLastInGroup;

  return (
    <div className={cn('group/turn flex min-w-0 w-full flex-col gap-2', className)}>
      {showThinking && message.thinking ? (
        <ManyActivityTrace
          kind="reasoning"
          working={thinkingIsLive}
          copy={traceCopy}
          reasoning={message.thinking}
        />
      ) : null}

      <ActionSuggestionsList suggestions={actionSuggestions} />

      {message.agentLabel ? (
        <span className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {message.agentLabel}
        </span>
      ) : null}

      {/*
        Turn-level state, so only the last message renders it. A group can hold
        a persisted partial reply and the live streaming message at once; both
        drawing the spinner is what produced the doubled "Thinking…".
      */}
      {showStreamingStatus ? (
        <AssistantStreamingStatus label={message.streamingLabel || t('chat.processing')} />
      ) : null}

      <AssistantMessageParts
        parts={messageParts}
        isStreaming={Boolean(message.isStreaming)}
        citationMap={message.citationMap}
        onClickCitation={openCitation}
        copy={traceCopy}
        toolLabelT={t}
      />

      {showPdfActions ? (
        <AssistantPdfRegionActions
          continueLabel={t('viewer.pdf_region_qa_continue_many')}
          copyLabel={t('viewer.pdf_region_qa_copy_handoff')}
          onContinue={handlePdfRegionContinue}
          onCopy={() => {
            handlePdfRegionCopy().catch(() => {});
          }}
        />
      ) : null}

      {showSources ? (
        <AssistantSources
          sources={sourceReferences}
          onClickSource={(source) => openCitation(source.number)}
        />
      ) : null}

      {showFooter ? (
        <AssistantTurnFooter
          copied={copied}
          formattedTime={formattedTime}
          onCopy={() => {
            handleCopy().catch(() => {});
          }}
          onRegenerate={onRegenerate}
          copyTitle={t('chat.copy_message')}
          regenerateTitle={t('chat.regenerate')}
        />
      ) : null}
    </div>
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
  if (message.role === 'user') {
    return <ManyUserMessageTurn message={message} className={className} />;
  }

  return (
    <ManyAssistantMessageTurn
      message={message}
      isLastInGroup={isLastInGroup}
      onRegenerate={onRegenerate}
      onClickCitation={onClickCitation}
      className={className}
    />
  );
}
