'use client';

import { useMemo } from 'react';
import { User } from 'lucide-react';
import ChatMessage, { type ChatMessageData } from './ChatMessage';
import MartinAvatar from '@/components/common/MartinAvatar';

/**
 * ChatMessageGroup - Groups consecutive messages from the same role
 * Shows avatar only once per group (Slack-style)
 */

interface ChatMessageGroupProps {
  messages: ChatMessageData[];
  onRegenerate?: (messageId: string) => void;
  className?: string;
}

export default function ChatMessageGroup({
  messages,
  onRegenerate,
  className = '',
}: ChatMessageGroupProps) {
  const firstMessage = messages[0];
  if (!firstMessage) return null;

  const role = firstMessage.role;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  // Format group timestamp (first message in group)
  const groupTime = useMemo(() => {
    const date = new Date(firstMessage.timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }, [firstMessage.timestamp]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${className}`}>
      {/* Avatar - only for first message in group */}
      <div className="flex-shrink-0 w-8">
        {isAssistant ? (
          <MartinAvatar size="sm" />
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
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Helper function to group consecutive messages by role
 */
export function groupMessagesByRole(messages: ChatMessageData[]): ChatMessageData[][] {
  const groups: ChatMessageData[][] = [];
  let currentGroup: ChatMessageData[] = [];
  let currentRole: string | null = null;

  for (const message of messages) {
    if (message.role !== currentRole) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [message];
      currentRole = message.role;
    } else {
      currentGroup.push(message);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}
