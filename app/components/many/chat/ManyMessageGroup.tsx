import { memo } from 'react';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
} from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import ManyAvatar, { type ManyAvatarState } from '@/components/many/ManyAvatar';
import ManyMessageBody from '@/components/many/chat/ManyMessageBody';
import type { ManyMessageData } from '@/components/many/chat/types';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';

interface ManyMessageGroupProps {
  messages: ManyMessageData[];
  onRegenerate?: (messageId: string) => void;
  onSaveAsNote?: (content: string) => void;
  assistantState?: ManyAvatarState;
  scrollAnchor?: boolean;
  className?: string;
}

export default memo(function ManyMessageGroup({
  messages,
  onRegenerate,
  onSaveAsNote,
  assistantState = 'idle',
  scrollAnchor = false,
  className,
}: ManyMessageGroupProps) {
  const first = messages[0];
  if (!first) return null;

  const isUser = first.role === 'user';
  const isAssistant = first.role === 'assistant';
  const groupId = stableMessageGroupKey(messages);

  return (
    <MessageScrollerItem messageId={groupId} scrollAnchor={scrollAnchor} className={className}>
      <MessageGroup>
        {messages.map((message, index) => {
          const isLastInGroup = index === messages.length - 1;
          const showAvatar = isLastInGroup;
          return (
            <Message key={message.id} align={isUser ? 'end' : 'start'}>
              <MessageAvatar className="rounded-lg bg-transparent">
                {showAvatar && isAssistant ? (
                  <ManyAvatar size="sm" state={isLastInGroup ? assistantState : 'idle'} />
                ) : null}
              </MessageAvatar>
              <MessageContent>
                <ManyMessageBody
                  message={message}
                  isFirstInGroup={index === 0}
                  isLastInGroup={isLastInGroup}
                  onRegenerate={
                    onRegenerate && isAssistant && isLastInGroup
                      ? () => onRegenerate(message.id)
                      : undefined
                  }
                  onSaveAsNote={onSaveAsNote}
                />
              </MessageContent>
            </Message>
          );
        })}
      </MessageGroup>
    </MessageScrollerItem>
  );
});

export function ManyAnalyzingMarker({ label }: { label: string }) {
  return (
    <MessageScrollerItem messageId="many-analyzing-marker">
      <Message align="start">
        <MessageAvatar className="rounded-lg bg-transparent">
          <ManyAvatar size="sm" state="thinking" />
        </MessageAvatar>
        <MessageContent>
          <Marker role="status">
            <MarkerIcon>
              <Spinner />
            </MarkerIcon>
            <MarkerContent className="shimmer">{label}</MarkerContent>
          </Marker>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

export function ManyErrorMarker({
  title,
  message,
  onRetry,
  onReport,
  retryLabel,
  reportLabel,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  onReport: () => void;
  retryLabel: string;
  reportLabel: string;
}) {
  return (
    <MessageScrollerItem messageId="many-error-marker">
      <Message align="start">
        <MessageContent className="flex flex-col gap-2">
          <Bubble variant="destructive">
            <BubbleContent>
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm opacity-90">{message}</p>
            </BubbleContent>
          </Bubble>
          <MessageFooter className="gap-2">
            <Button type="button" size="xs" onClick={onRetry}>
              {retryLabel}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={onReport}>
              {reportLabel}
            </Button>
          </MessageFooter>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}
