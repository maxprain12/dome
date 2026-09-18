import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Wrench01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
} from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import ManyAvatar from '@/components/many/ManyAvatar';
import ManyActivityTrace, { ManyActivityBlocks } from '@/components/many/conversation/ManyActivityTrace';
import { ManyReferenceCards } from '@/components/many/conversation/ManyVisualCards';
import { ManySkillChipList } from '@/components/many/PinnedResourceChipList';
import {
  activitySegmentsFromCalls,
  activityTraceCopyFromT,
  type ActivityToolCall,
  type ActivityTraceCopy,
} from '@/lib/chat/manyActivityTrace';
import { skillChipsFromUserTurn, stripSkillInvocationText } from '@/lib/chat/userTurnContext';
import { cn } from '@/lib/utils';

export interface ManySurfaceToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  progress?: string;
}

export interface ManySurfaceImage {
  id: string;
  name: string;
  dataUrl: string;
}

export interface ManyConversationSurfaceMessage {
  id: string;
  role: 'user' | 'assistant' | 'toolResult';
  text: string;
  timestamp?: number | null;
  reasoning?: string;
  tools?: ManySurfaceToolCall[];
  images?: ManySurfaceImage[];
  toolLabel?: string;
  isStreaming?: boolean;
  usageLabel?: string;
  skills?: Array<{ id: string; name: string }>;
}

interface ManyConversationSurfaceProps {
  threadId: string;
  messages: ManyConversationSurfaceMessage[];
  ariaLabel: string;
  emptyState: ReactNode;
  manyImageSrc?: string;
  loadingLabel?: string;
  reasoningLabel: string;
  toolsLabel: string;
  imageLabel: string;
  traceCopy?: ActivityTraceCopy;
  renderAssistant?: (message: ManyConversationSurfaceMessage) => ReactNode;
  approval?: ReactNode;
  notices?: ReactNode;
  className?: string;
}

function formatToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function toToolCall(tool: ManySurfaceToolCall): ActivityToolCall {
  return {
    id: tool.id,
    name: tool.name,
    arguments: tool.arguments,
    status: tool.status,
    result: tool.result,
    error: tool.error,
  };
}

function SurfaceToolDetail({ call }: { call: ActivityToolCall }) {
  const text = call.error || formatToolResult(call.result) || JSON.stringify(call.arguments, null, 2);
  return (
    <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[11px]">
      {text}
    </pre>
  );
}

function resolveTraceCopy(
  t: (key: string, opts?: Record<string, unknown>) => string,
  override?: ActivityTraceCopy,
): ActivityTraceCopy {
  if (override) return override;
  return activityTraceCopyFromT((key, opts) => {
    const nested = t(`chat.${key}`, opts);
    if (typeof nested === 'string' && nested !== `chat.${key}`) return nested;
    return String(t(key, opts ?? {}));
  });
}

function defaultLinkMode(): 'ipc' | 'anchor' {
  const host = globalThis as {
    window?: { electron?: { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> } };
  };
  return typeof host.window?.electron?.invoke === 'function' ? 'ipc' : 'anchor';
}

function SurfaceUserTurn({
  message,
  imageLabel,
}: {
  message: ManyConversationSurfaceMessage;
  imageLabel: string;
}) {
  const skills = skillChipsFromUserTurn(message.text, message.skills);
  const body = stripSkillInvocationText(message.text);
  return (
    <div className="flex max-w-[88%] flex-col items-end gap-1.5">
      {skills.length > 0 ? (
        <ManySkillChipList skills={skills} align="end" className="max-w-full" />
      ) : null}
      {body ? (
        <Bubble variant="secondary" align="end" className="max-w-full">
          <BubbleContent>
            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {body}
            </span>
          </BubbleContent>
        </Bubble>
      ) : null}
      {message.images && message.images.length > 0 ? (
        <AttachmentGroup className="max-w-full justify-end">
          {message.images.map((image) => (
            <Attachment key={image.id} state="done" size="sm">
              <AttachmentMedia variant="image">
                <img
                  src={image.dataUrl}
                  alt={image.name || imageLabel}
                  loading="lazy"
                />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>
                  {image.name || imageLabel}
                </AttachmentTitle>
              </AttachmentContent>
            </Attachment>
          ))}
        </AttachmentGroup>
      ) : null}
    </div>
  );
}

function SurfaceAssistantActivity({
  message,
  copy,
  reasoningLabel,
  renderAssistant,
  linkMode,
}: {
  message: ManyConversationSurfaceMessage;
  copy: ActivityTraceCopy;
  reasoningLabel: string;
  renderAssistant?: (message: ManyConversationSurfaceMessage) => ReactNode;
  linkMode: 'ipc' | 'anchor';
}) {
  const { t } = useTranslation();
  const live = Boolean(message.isStreaming && !message.text);
  const segments = useMemo(
    () => activitySegmentsFromCalls((message.tools ?? []).map(toToolCall)),
    [message.tools],
  );
  return (
    <div className="group/turn flex min-w-0 w-full flex-col gap-2">
      {message.reasoning ? (
        <ManyActivityTrace
          kind="reasoning"
          working={live}
          copy={copy}
          title={live ? reasoningLabel : copy.reasoningDone}
          reasoning={message.reasoning}
          linkMode={linkMode}
        />
      ) : null}
      {segments.length > 0 ? (
        <ManyActivityBlocks
          segments={segments}
          copy={copy}
          toolLabelT={t}
          linkMode={linkMode}
          renderToolDetail={(call) => <SurfaceToolDetail call={call} />}
        />
      ) : null}
      {message.tools && message.tools.length > 0 ? <ManyReferenceCards calls={message.tools} /> : null}
      {message.text ? (
        <div className="min-w-0 break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
          {renderAssistant ? renderAssistant(message) : message.text}
          {message.isStreaming ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current motion-reduce:animate-none"
            />
          ) : null}
        </div>
      ) : null}
      {message.usageLabel ? (
        <MessageFooter>
          <Badge variant="outline" className="font-normal tabular-nums">
            {message.usageLabel}
          </Badge>
        </MessageFooter>
      ) : null}
    </div>
  );
}

/**
 * Store-agnostic transcript with the same conversation primitives and visual
 * hierarchy as Desktop Many. Runtime adapters provide messages and callbacks.
 */
export default function ManyConversationSurface({
  threadId,
  messages,
  ariaLabel,
  emptyState,
  manyImageSrc,
  loadingLabel,
  reasoningLabel,
  toolsLabel,
  imageLabel,
  traceCopy,
  renderAssistant,
  approval,
  notices,
  className,
}: ManyConversationSurfaceProps) {
  const { t } = useTranslation();
  const copy = useMemo(() => resolveTraceCopy(t, traceCopy), [t, traceCopy]);
  const linkMode = defaultLinkMode();
  return (
    <MessageScrollerProvider key={threadId} autoScroll defaultScrollPosition="end">
      <MessageScroller className={cn('min-h-0 flex-1', className)} data-surface="many">
        <MessageScrollerViewport aria-label={ariaLabel}>
          <MessageScrollerContent className="gap-5 px-4 py-5">
            <div className="mx-auto flex w-full max-w-none flex-col gap-5">
              {messages.length === 0 && !loadingLabel ? emptyState : null}
              {messages.map((message) => {
                const isUser = message.role === 'user';
                const isToolResult = message.role === 'toolResult';
                return (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={isUser}
                  >
                    <MessageGroup>
                      <Message align={isUser ? 'end' : 'start'}>
                        {!isUser && !isToolResult ? (
                          <MessageAvatar className="bg-transparent">
                            <ManyAvatar
                              size="sm"
                              state={message.isStreaming ? 'thinking' : 'idle'}
                              imageSrc={manyImageSrc}
                            />
                          </MessageAvatar>
                        ) : null}
                        <MessageContent>
                          {isUser ? (
                            <SurfaceUserTurn message={message} imageLabel={imageLabel} />
                          ) : isToolResult ? (
                            <Marker variant="border">
                              <MarkerIcon>
                                <HugeiconsIcon icon={Wrench01Icon} />
                              </MarkerIcon>
                              <MarkerContent className="truncate">
                                {message.toolLabel || toolsLabel}
                                {message.text ? (
                                  <span className="ml-1.5 text-muted-foreground">
                                    {message.text}
                                  </span>
                                ) : null}
                              </MarkerContent>
                            </Marker>
                          ) : (
                            <SurfaceAssistantActivity
                              message={message}
                              copy={copy}
                              reasoningLabel={reasoningLabel}
                              renderAssistant={renderAssistant}
                              linkMode={linkMode}
                            />
                          )}
                        </MessageContent>
                      </Message>
                    </MessageGroup>
                  </MessageScrollerItem>
                );
              })}
              {notices}
              {approval}
              {loadingLabel ? (
                <MessageScrollerItem messageId="many-surface-loading">
                  <Marker role="status">
                    <MarkerIcon>
                      <Spinner />
                    </MarkerIcon>
                    <MarkerContent className="shimmer">{loadingLabel}</MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}
            </div>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
