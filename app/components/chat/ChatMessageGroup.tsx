
import { memo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { UserIcon } from '@hugeicons/core-free-icons';
import ChatMessage, { type ChatMessageData, type ChatSurfaceVariant } from './ChatMessage';
import ManyAvatar, { type ManyAvatarState } from '@/components/many/ManyAvatar';
import { Message, MessageAvatar, MessageContent, MessageGroup } from '@/components/ui/message';
import { cn } from '@/lib/utils';

/**
 * ChatMessageGroup - Groups consecutive messages from the same role
 * Shows avatar only once per group (Slack-style)
 */

interface ChatMessageGroupProps {
  messages: ChatMessageData[];
  onRegenerate?: (messageId: string) => void;
  onSaveAsNote?: (content: string) => void;
  /** Custom avatar for assistant (e.g. agent sprite). When set, overrides ManyAvatar */
  assistantAvatarSrc?: string;
  /** Whether to show avatar. Default true */
  showAvatar?: boolean;
  /** Visual skin for Many panel vs default agent chat */
  surfaceVariant?: ChatSurfaceVariant;
  /** State of the last message in this group — drives avatar animation */
  assistantState?: ManyAvatarState;
  className?: string;
}

export default memo(function ChatMessageGroup({
  messages,
  onRegenerate,
  onSaveAsNote,
  assistantAvatarSrc,
  showAvatar = true,
  surfaceVariant = 'default',
  assistantState = 'idle',
  className = '',
}: ChatMessageGroupProps) {
  const firstMessage = messages[0];

  if (!firstMessage) return null;

  const role = firstMessage.role;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const showThreadRule = surfaceVariant === 'many' && isAssistant && showAvatar;
  const hideUserAvatar = surfaceVariant === 'many' && isUser;

  return (
    <MessageGroup className={className}>
      <Message align={isUser ? 'end' : 'start'} className={cn(hideUserAvatar && 'gap-1', showThreadRule && 'gap-2')}>
      {/* Avatar - only for first message in group */}
      <MessageAvatar className={cn(!(showAvatar && !hideUserAvatar) && 'w-0 min-w-0 overflow-hidden')}>
        {hideUserAvatar ? null : isAssistant ? (
          assistantAvatarSrc ? (
            <img
              src={assistantAvatarSrc}
              alt=""
              className="size-8 object-contain rounded-lg"
            />
          ) : (
            <ManyAvatar size="sm" state={surfaceVariant === 'many' ? assistantState : 'idle'} />
          )
        ) : isUser ? (
          <div className="flex size-8 items-center justify-center rounded-full bg-primary">
            <HugeiconsIcon icon={UserIcon} className="text-primary-foreground" />
          </div>
        ) : null}
      </MessageAvatar>

      {showThreadRule ? (
        <div
          className="many-thread-rule w-px shrink-0 self-stretch bg-[var(--border)] opacity-45"
          aria-hidden
        />
      ) : null}

      {/* Messages */}
      <MessageContent className={cn('gap-1', isUser && 'items-end')}>
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            showAvatar={false}
            isFirstInGroup={index === 0}
            isLastInGroup={index === messages.length - 1}
            surfaceVariant={surfaceVariant}
            onRegenerate={
              isAssistant && index === messages.length - 1 && onRegenerate
                ? () => onRegenerate(message.id)
                : undefined
            }
            onSaveAsNote={isAssistant ? onSaveAsNote : undefined}
          />
        ))}
      </MessageContent>
      </Message>
    </MessageGroup>
  );
});
