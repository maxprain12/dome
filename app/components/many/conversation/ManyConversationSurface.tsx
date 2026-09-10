import { useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Wrench01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChatToolMarker } from '@/components/chat/ChatToolMarker';
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

function ToolMarker({
  tool,
  toolsLabel,
}: {
  tool: ManySurfaceToolCall;
  toolsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const result = formatToolResult(tool.result);
  const hasDetails = Boolean(
    tool.error || result || Object.keys(tool.arguments).length > 0,
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <ChatToolMarker
        label={tool.name.replaceAll('_', ' ')}
        summary={tool.progress}
        status={tool.status}
        icon={Wrench01Icon}
        expanded={open}
        expandable={hasDetails}
        onToggle={() => setOpen((value) => !value)}
      />
      {hasDetails ? (
        <CollapsibleContent className="ml-3 border-l px-3 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {toolsLabel}
          </p>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[11px]">
            {tool.error || result || JSON.stringify(tool.arguments, null, 2)}
          </pre>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function ReasoningBlock({
  text,
  label,
  live,
}: {
  text: string;
  label: string;
  live: boolean;
}) {
  const [open, setOpen] = useState(live);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted">
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className={cn('transition-transform', open && 'rotate-90')}
        />
        <span className={cn(live && 'shimmer')}>{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-1.5 border-l py-1 pl-3.5">
        <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  renderAssistant,
  approval,
  notices,
  className,
}: ManyConversationSurfaceProps) {
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
                            <div className="flex max-w-[88%] flex-col items-end gap-1.5">
                              {message.text ? (
                                <Bubble variant="secondary" align="end" className="max-w-full">
                                  <BubbleContent>
                                    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                      {message.text}
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
                            <div className="group/turn flex min-w-0 w-full flex-col gap-2">
                              {message.reasoning ? (
                                <ReasoningBlock
                                  text={message.reasoning}
                                  label={reasoningLabel}
                                  live={Boolean(message.isStreaming && !message.text)}
                                />
                              ) : null}
                              {message.tools?.map((tool) => (
                                <ToolMarker key={tool.id} tool={tool} toolsLabel={toolsLabel} />
                              ))}
                              {message.text ? (
                                <div className="min-w-0 break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                                  {renderAssistant ? renderAssistant(message) : message.text}
                                  {message.isStreaming ? (
                                    <span
                                      aria-hidden
                                      className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current"
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
