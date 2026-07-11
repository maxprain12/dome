import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { truncateToolResultForRenderer } from '@/lib/chat/truncateToolResult';

/** Minimal shape persisted in JSONL thread checkpoints. */
export type HarnessManyMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status?: string;
    result?: unknown;
    error?: string;
  }>;
  thinking?: string;
};

type PiContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

type PiMessage = {
  role?: string;
  content?: unknown;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: unknown;
};

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content != null ? String(content) : '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block && typeof block === 'object') {
        const b = block as PiContentBlock;
        if (b.type === 'text' && typeof b.text === 'string') return b.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseToolResultPayload(msg: PiMessage): { result: unknown; status: 'success' | 'error' } {
  const status: 'success' | 'error' = msg.isError ? 'error' : 'success';
  if (msg.details !== undefined && msg.details !== null) {
    return { result: truncateToolResultForRenderer(msg.details), status };
  }
  if (Array.isArray(msg.content)) {
    const text = extractTextFromContent(msg.content);
    if (text) {
      try {
        return { result: truncateToolResultForRenderer(JSON.parse(text)), status };
      } catch {
        return { result: truncateToolResultForRenderer(text), status };
      }
    }
  }
  if (typeof msg.content === 'string' && msg.content.trim()) {
    try {
      return { result: truncateToolResultForRenderer(JSON.parse(msg.content)), status };
    } catch {
      return { result: truncateToolResultForRenderer(msg.content), status };
    }
  }
  return { result: truncateToolResultForRenderer(msg.content ?? ''), status };
}

function consumeAssistantTurn(
  raw: unknown[],
  startIndex: number,
  messageIndex: number,
): { nextIndex: number; message?: HarnessManyMessage } {
  const toolCallsById = new Map<string, ToolCallData>();
  const toolCallOrder: string[] = [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  let timestamp = Date.now();

  let i = startIndex;
  while (i < raw.length) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      i += 1;
      continue;
    }
    const msg = item as PiMessage;
    if (msg.role === 'user') break;

    if (msg.role === 'assistant') {
      timestamp = typeof msg.timestamp === 'number' ? msg.timestamp : timestamp;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (!block || typeof block !== 'object') continue;
          const b = block as PiContentBlock;
          if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
            textParts.push(b.text);
          } else if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
            thinkingParts.push(b.thinking);
          } else if (b.type === 'toolCall' && b.id && b.name) {
            if (!toolCallsById.has(b.id)) toolCallOrder.push(b.id);
            const prev = toolCallsById.get(b.id);
            toolCallsById.set(b.id, {
              id: b.id,
              name: b.name,
              arguments: b.arguments ?? prev?.arguments ?? {},
              status: prev?.status ?? 'running',
              result: prev?.result,
              error: prev?.error,
            });
          }
        }
      } else {
        const text = extractTextFromContent(msg.content);
        if (text.trim()) textParts.push(text);
      }
      i += 1;
      continue;
    }

    if (msg.role === 'toolResult' && msg.toolCallId) {
      const id = String(msg.toolCallId);
      const { result, status } = parseToolResultPayload(msg);
      const existing = toolCallsById.get(id);
      if (existing) {
        toolCallsById.set(id, {
          ...existing,
          name: existing.name || msg.toolName || 'tool',
          status,
          result,
          ...(status === 'error' ? { error: typeof result === 'string' ? result : 'Tool error' } : {}),
        });
      } else {
        if (!toolCallOrder.includes(id)) toolCallOrder.push(id);
        toolCallsById.set(id, {
          id,
          name: msg.toolName ?? 'tool',
          arguments: {},
          status,
          result,
          ...(status === 'error' ? { error: typeof result === 'string' ? result : 'Tool error' } : {}),
        });
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  const toolCalls = toolCallOrder
    .map((id) => toolCallsById.get(id))
    .filter((tc): tc is ToolCallData => Boolean(tc))
    .map((tc) => (tc.status === 'running' ? { ...tc, status: 'success' as const } : tc));

  const content = textParts.join('\n\n').trim();
  const coalescedTools = toolCalls.length > 0 ? coalesceDuplicateToolCalls(toolCalls) : undefined;
  if (!content && !coalescedTools?.length) {
    return { nextIndex: i };
  }

  return {
    nextIndex: i,
    message: {
      id: `msg-${timestamp}-${messageIndex}`,
      role: 'assistant',
      content,
      timestamp,
      toolCalls: coalescedTools,
      thinking: thinkingParts.length > 0 ? thinkingParts.join('\n') : undefined,
    },
  };
}

function buildUserMessage(msg: PiMessage, messageIndex: number): HarnessManyMessage | null {
  const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
  const text = extractTextFromContent(msg.content);
  if (!text.trim()) return null;
  return {
    id: `msg-${ts}-${messageIndex}`,
    role: 'user',
    content: text,
    timestamp: ts,
  };
}

/** Convert agent harness messages (JSONL context) into Many UI messages. */
export function harnessMessagesToManyMessages(raw: unknown[]): HarnessManyMessage[] {
  const out: HarnessManyMessage[] = [];
  let index = 0;

  while (index < raw.length) {
    const item = raw[index];
    if (!item || typeof item !== 'object') {
      index += 1;
      continue;
    }
    const msg = item as PiMessage;

    if (msg.role === 'user') {
      const userMsg = buildUserMessage(msg, out.length);
      if (userMsg) out.push(userMsg);
      index += 1;
      continue;
    }

    if (msg.role === 'assistant' || msg.role === 'toolResult') {
      const turn = consumeAssistantTurn(raw, index, out.length);
      index = turn.nextIndex;
      if (turn.message) out.push(turn.message);
      continue;
    }

    index += 1;
  }

  return out;
}
