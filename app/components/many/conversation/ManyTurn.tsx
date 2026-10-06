import { memo } from 'react';
import { Message, MessageAvatar, MessageContent, MessageGroup } from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import ManyAvatar, { type ManyAvatarState } from '@/components/many/ManyAvatar';
import { stableMessageGroupKey } from '@/lib/chat/stableMessageGroupKey';
import type { ManyMessageData, ManyMessageRenderer } from '@/lib/many/types';

interface ManyTurnProps {
  messages: ManyMessageData[];
  renderMessage: ManyMessageRenderer;
  onRegenerate?: (messageId: string) => void;
  assistantState?: ManyAvatarState;
  scrollAnchor?: boolean;
  className?: string;
}

/**
 * One turn of the conversation: consecutive messages from the same role.
 * The Many avatar (with its state halo) marks only the last assistant row.
 */
export default memo(function ManyTurn({
  messages,
  renderMessage,
  onRegenerate,
  assistantState = 'idle',
  scrollAnchor = false,
  className,
}: ManyTurnProps) {
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
          return (
            <Message key={message.id} align={isUser ? 'end' : 'start'}>
              {isAssistant ? (
                <MessageAvatar className="bg-transparent">
                  {isLastInGroup ? <ManyAvatar size="sm" state={assistantState} /> : null}
                </MessageAvatar>
              ) : null}
              <MessageContent>
                {renderMessage({
                  message,
                  isLastInGroup,
                  onRegenerate:
                    onRegenerate && isAssistant && isLastInGroup
                      ? () => onRegenerate(message.id)
                      : undefined,
                })}
              </MessageContent>
            </Message>
          );
        })}
      </MessageGroup>
    </MessageScrollerItem>
  );
}, (previous, next) => previous.renderMessage === next.renderMessage && previous.onRegenerate === next.onRegenerate
  && previous.assistantState === next.assistantState && previous.scrollAnchor === next.scrollAnchor
  && previous.className === next.className && previous.messages.length === next.messages.length
  && previous.messages.every((message, index) => message === next.messages[index]));
