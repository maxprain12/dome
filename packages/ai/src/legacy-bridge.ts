/**
 * Convert Dome legacy chat messages / tool schemas into agent `Context`.
 */

import { Type } from 'typebox';
import type { Context, Message, Tool, ToolResultMessage, UserMessage } from './types.js';
import type { ToolSchema } from './tool-schema.js';

type LegacyMessage = {
  role: string;
  content?: unknown;
  text?: string;
  toolCalls?: Array<{ id: string; name: string; arguments?: Record<string, unknown> }>;
  toolCallId?: string;
  name?: string;
  attachments?: {
    images?: Array<{ dataUrl: string; mime?: string; name?: string }>;
    videos?: Array<{ dataUrl?: string; fileId?: string; mime?: string; name?: string; sizeBytes?: number }>;
  };
};

function contentToUserContent(content: unknown): UserMessage['content'] {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === 'string') return { type: 'text' as const, text: block };
      if (block && typeof block === 'object') {
        const b = block as { type?: string; text?: string; image_url?: { url?: string }; data?: string; mimeType?: string };
        if (b.type === 'text' && typeof b.text === 'string') return { type: 'text' as const, text: b.text };
        if (b.type === 'image_url' && b.image_url?.url) {
          const url = b.image_url.url;
          const m = /^data:([^;]+);base64,(.+)$/.exec(url);
          if (m) return { type: 'image' as const, mimeType: m[1]!, data: m[2]! };
        }
        if (b.type === 'image' && b.data && b.mimeType) {
          return { type: 'image' as const, mimeType: b.mimeType, data: b.data };
        }
      }
      return { type: 'text' as const, text: JSON.stringify(block) };
    });
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

function legacyAssistantToMessage(m: LegacyMessage, timestamp: number): Message {
  const text = typeof m.text === 'string' ? m.text : typeof m.content === 'string' ? m.content : '';
  const content: import('./types.js').AssistantMessage['content'] = [];
  if (text) content.push({ type: 'text', text });
  for (const tc of m.toolCalls ?? []) {
    content.push({
      type: 'toolCall',
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments ?? {},
    });
  }
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openai',
    model: 'unknown',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: (m.toolCalls?.length ?? 0) > 0 ? 'toolUse' : 'stop',
    timestamp,
  };
}

function toolSchemaToPiTool(schema: ToolSchema): Tool {
  return {
    name: schema.function.name,
    description: schema.function.description,
    parameters: Type.Unsafe(schema.function.parameters ?? {}),
  };
}

/** Map Dome thinking level to `SimpleStreamOptions.reasoning`. */
export function mapThinkingLevel(
  level: string | undefined,
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  if (!level || level === 'off') return undefined;
  if (level === 'minimal' || level === 'low' || level === 'medium' || level === 'high' || level === 'xhigh') {
    return level;
  }
  return undefined;
}

export function legacyMessagesToContext(
  systemPrompt: string,
  messages: LegacyMessage[],
  tools?: ToolSchema[],
): Context {
  const contextMessages: Message[] = [];
  const now = Date.now();

  for (const m of messages ?? []) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'system') continue;

    if (m.role === 'user') {
      let content = contentToUserContent(m.content);
      if (m.attachments?.images?.length) {
        if (typeof content === 'string') {
          content = content ? [{ type: 'text' as const, text: content }] : [];
        }
        if (Array.isArray(content)) {
          for (const img of m.attachments.images) {
            const url = img.dataUrl;
            const match = /^data:([^;]+);base64,(.+)$/.exec(url || '');
            if (match) {
              content.push({ type: 'image' as const, mimeType: match[1]!, data: match[2]! });
            }
          }
        }
      }
      contextMessages.push({
        role: 'user',
        content,
        timestamp: now,
      });
      continue;
    }

    if (m.role === 'assistant' || ('text' in m && m.role !== 'user' && m.role !== 'tool' && m.role !== 'toolResult')) {
      contextMessages.push(legacyAssistantToMessage(m, now));
      continue;
    }

    if (m.role === 'tool' || m.role === 'toolResult') {
      const toolMsg: ToolResultMessage = {
        role: 'toolResult',
        toolCallId: m.toolCallId || 'tool',
        toolName: m.name || 'tool',
        content: [{ type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }],
        isError: false,
        timestamp: now,
      };
      contextMessages.push(toolMsg);
    }
  }

  return {
    systemPrompt: systemPrompt || undefined,
    messages: contextMessages,
    tools: tools?.map(toolSchemaToPiTool),
  };
}
