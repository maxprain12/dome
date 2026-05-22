
import { memo } from 'react';
import { User } from 'lucide-react';
import ChatMessage, { type ChatMessageData, type ChatSurfaceVariant } from './ChatMessage';
import ManyAvatar, { type ManyAvatarState } from '@/components/many/ManyAvatar';

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
    <div
      className={`flex ${isUser ? `flex-row-reverse ${hideUserAvatar ? 'gap-1' : 'gap-3'}` : showThreadRule ? 'gap-2' : 'gap-3'} ${className}`}
    >
      {/* Avatar - only for first message in group */}
      <div className={`flex-shrink-0 ${showAvatar && !hideUserAvatar ? 'w-8' : 'w-0 overflow-hidden'}`}>
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
          <div
            className="size-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <User size={16} className="text-white" />
          </div>
        ) : null}
      </div>

      {showThreadRule ? (
        <div
          className="many-thread-rule w-px shrink-0 self-stretch bg-[var(--border)] opacity-45"
          aria-hidden
        />
      ) : null}

      {/* Messages */}
      <div className={`flex-1 space-y-1 min-w-0 ${isUser ? 'items-end' : ''}`}>
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
      </div>
    </div>
  );
});

/**
 * Helper function to group consecutive messages by role
 */
export function groupMessagesByRole(messages: ChatMessageData[]): ChatMessageData[][] {
  const groups: ChatMessageData[][] = [];
  let currentGroup: ChatMessageData[] = [];
  let currentRole: string | null = null;
  let currentAgentLabel: string | undefined;

  for (const message of messages) {
    if (message.role !== currentRole || message.agentLabel !== currentAgentLabel) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [message];
      currentRole = message.role;
      currentAgentLabel = message.agentLabel;
    } else {
      currentGroup.push(message);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}
