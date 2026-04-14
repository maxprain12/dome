
import { useMemo, memo } from 'react';
import { User } from 'lucide-react';
import ChatMessage, { type ChatMessageData } from './ChatMessage';
import ManyAvatar from '@/components/many/ManyAvatar';

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
  className?: string;
}

export default memo(function ChatMessageGroup({
  messages,
  onRegenerate,
  onSaveAsNote,
  assistantAvatarSrc,
  showAvatar = true,
  className = '',
}: ChatMessageGroupProps) {
  const firstMessage = messages[0];

  // Format group timestamp (first message in group)
  const groupTime = useMemo(() => {
    if (!firstMessage) return '';
    const date = new Date(firstMessage.timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }, [firstMessage]);

  if (!firstMessage) return null;

  const role = firstMessage.role;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${className}`}>
      {/* Avatar - only for first message in group */}
      <div className={`flex-shrink-0 ${showAvatar ? 'w-8' : 'w-0 overflow-hidden'}`}>
        {isAssistant ? (
          assistantAvatarSrc ? (
            <img
              src={assistantAvatarSrc}
              alt=""
              className="w-8 h-8 object-contain rounded-lg"
            />
          ) : (
            <ManyAvatar size="sm" />
          )
        ) : isUser ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <User size={16} className="text-white" />
          </div>
        ) : null}
      </div>

      {/* Messages */}
      <div className={`flex-1 space-y-1 ${isUser ? 'items-end' : ''}`}>
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            showAvatar={false}
            isFirstInGroup={index === 0}
            isLastInGroup={index === messages.length - 1}
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
