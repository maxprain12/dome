import type { ChatMessageData } from '@/components/chat/ChatMessage';

type LiveAssistant = {
  id: string;
  role: string;
  content: string;
  agentLabel?: string;
  isStreaming?: boolean;
  toolCalls?: unknown[];
};

function assistantOverlapScore(message: LiveAssistant): number {
  let score = message.content.trim().length;
  if (Array.isArray(message.toolCalls)) score += message.toolCalls.length * 200;
  return score;
}

/**
 * Persist (`addMessage`) and the live bubble race on terminal. Many always
 * writes the user turn before the run, so two trailing assistants are the
 * same turn — never both. Agent-team keeps a boundary when labels differ.
 */
export function pickLiveAssistant<T extends LiveAssistant>(persisted: T, streaming: T): T {
  if (persisted.id === streaming.id) return streaming;
  const persistedText = persisted.content.trim();
  const streamText = streaming.content.trim();
  if (streamText && persistedText && streamText.startsWith(persistedText)) return streaming;
  if (streamText && persistedText && persistedText.startsWith(streamText)) return persisted;
  return assistantOverlapScore(streaming) >= assistantOverlapScore(persisted) ? streaming : persisted;
}

/**
 * Append the live streaming bubble unless the transcript already holds that
 * turn (terminal persist races Zustand `addMessage` ahead of clearing
 * `streamingMessage`, which used to render the same reply twice).
 */
export function withLiveStreamingMessage<T extends LiveAssistant>(
  messages: T[],
  streaming: T | null,
): T[] {
  if (!streaming) return messages;
  const last = messages.at(-1);
  if (last?.role !== 'assistant' || streaming.role !== 'assistant') {
    return [...messages, streaming];
  }
  if (last.agentLabel && streaming.agentLabel && last.agentLabel !== streaming.agentLabel) {
    return [...messages, streaming];
  }
  const chosen = pickLiveAssistant(last, streaming);
  return [...messages.slice(0, -1), chosen];
}

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
