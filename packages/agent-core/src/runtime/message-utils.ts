/**
 * @dome/agent-core — agent loop message helpers (pi + legacy shapes).
 */

import type { AgentMessage, AgentToolCall, LegacyAgentMessage } from '../types.js';

export function isLegacyAssistantMessage(msg: AgentMessage): msg is LegacyAgentMessage {
  if (!msg || typeof msg !== 'object') return false;
  const r = (msg as { role?: string }).role;
  return r === 'assistant' && 'text' in msg && typeof (msg as LegacyAgentMessage).text === 'string';
}

export function isPiAssistantMessage(
  msg: AgentMessage,
): msg is import('@dome/ai').AssistantMessage {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { role?: string }).role === 'assistant' &&
    'content' in msg &&
    Array.isArray((msg as import('@dome/ai').AssistantMessage).content)
  );
}

export function isToolResultMessage(msg: AgentMessage): boolean {
  const r = (msg as { role?: string }).role;
  return r === 'toolResult' || r === 'tool';
}

export function toUserMessage(text: string): AgentMessage {
  return { role: 'user', content: text, timestamp: Date.now() };
}

export function toAssistantAgentMessage(text: string, toolCalls: AgentToolCall[]): AgentMessage {
  return {
    role: 'assistant',
    content: text,
    text,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

export function toToolResultMessage(
  call: AgentToolCall,
  resultText: string,
  isError: boolean,
): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: 'text', text: resultText }],
    isError,
    timestamp: Date.now(),
  };
}
