/**
 * Shared chat session types.
 *
 * Both `useManyStore` and `useAgentChatStore` expose conceptually the same
 * session/message shape. This module exports a canonical type definition
 * so renderer code (hooks, components, persistence) can depend on it
 * instead of duplicating structural interfaces per surface.
 *
 * NOTE: the two stores still live separately because they carry surface
 * specific flags (voice, pinned resources, agent id, WhatsApp, pdf region…).
 * A future refactor can collapse them into a single `useChatSessionStore`
 * with specialized slices; in the meantime they both speak this common
 * language at the message/session layer.
 */

import type { ToolCallData } from '@/components/chat/ChatToolCard';

export interface ChatMessageBase {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallData[];
  thinking?: string;
}

export interface ChatSessionBase<TMessage extends ChatMessageBase = ChatMessageBase> {
  id: string;
  title: string;
  messages: TMessage[];
  createdAt: number;
}

export type ChatSurface = 'many' | 'agent' | 'team';

export type ChatStatus = 'idle' | 'thinking' | 'speaking' | 'listening';

/**
 * Minimum contract a chat store must expose so shared hooks
 * (useLangGraphRunStream, useUnifiedChatSend in the future…) can
 * operate on any surface without knowing the full store shape.
 */
export interface ChatSessionStoreApi<TMessage extends ChatMessageBase = ChatMessageBase> {
  currentSessionId: string | null;
  messages: TMessage[];
  addMessage: (message: Omit<TMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
}
