import type { ChatMessageData } from '@/components/chat/ChatMessage';

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
