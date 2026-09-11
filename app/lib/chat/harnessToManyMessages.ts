import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { newAttachmentId, type StructuredMessageAttachments } from '@/lib/chat/attachmentTypes';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { truncateToolResultForRenderer } from '@/lib/chat/truncateToolResult';

/** Session `custom` / `custom_message` type for composer pins (JSONL v4). */
export const DOME_PINS_CUSTOM_TYPE = 'dome.pins';

export type HarnessPinnedResource = {
  id: string;
  title: string;
  type: string;
  kind?: string;
};

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
  attachments?: StructuredMessageAttachments;
  pinnedResources?: HarnessPinnedResource[];
};

type PiContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  data?: string;
  mimeType?: string;
};

type PiMessage = {
  role?: string;
  content?: unknown;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: unknown;
  customType?: string;
  data?: unknown;
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

function imageDataUrl(mime: string, data: string): string {
  if (data.startsWith('data:')) return data;
  return `data:${mime};base64,${data}`;
}

function extractImagesFromContent(content: unknown): StructuredMessageAttachments['images'] {
  if (!Array.isArray(content)) return [];
  const images: StructuredMessageAttachments['images'] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as PiContentBlock;
    if (b.type !== 'image' || typeof b.data !== 'string' || !b.data) continue;
    const mime = typeof b.mimeType === 'string' && b.mimeType ? b.mimeType : 'image/png';
    images.push({
      id: newAttachmentId(),
      dataUrl: imageDataUrl(mime, b.data),
      mime,
      name: 'image',
    });
  }
  return images;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePinnedResources(value: unknown): HarnessPinnedResource[] {
  if (!Array.isArray(value)) return [];
  const pins: HarnessPinnedResource[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) continue;
    if (typeof item.title !== 'string') continue;
    pins.push({
      id: item.id,
      title: item.title,
      type: typeof item.type === 'string' ? item.type : 'resource',
      ...(typeof item.kind === 'string' ? { kind: item.kind } : {}),
    });
  }
  return pins;
}

function parseDomePinsPayload(msg: PiMessage): {
  messageTimestamp?: number;
  pinnedResources: HarnessPinnedResource[];
} | null {
  if (msg.customType !== DOME_PINS_CUSTOM_TYPE) return null;
  const payload = isRecord(msg.details) ? msg.details : isRecord(msg.data) ? msg.data : null;
  if (!payload) return null;
  const pinnedResources = parsePinnedResources(payload.pinnedResources);
  if (pinnedResources.length === 0) return null;
  return {
    messageTimestamp: typeof payload.messageTimestamp === 'number' ? payload.messageTimestamp : undefined,
    pinnedResources,
  };
}

function attachPinsToUser(
  out: HarnessManyMessage[],
  pins: { messageTimestamp?: number; pinnedResources: HarnessPinnedResource[] },
): boolean {
  if (pins.messageTimestamp !== undefined) {
    const byTs = [...out].reverse().find(
      (m) => m.role === 'user' && m.timestamp === pins.messageTimestamp,
    );
    if (byTs) {
      byTs.pinnedResources = pins.pinnedResources;
      return true;
    }
  }
  const nearest = [...out].reverse().find((m) => m.role === 'user');
  if (nearest) {
    nearest.pinnedResources = pins.pinnedResources;
    return true;
  }
  return false;
}

/** Skip or replace a later assistant block that restates the turn so far. */
function pushAssistantTextPart(parts: string[], text: string): boolean {
  const incoming = text.trim();
  if (!incoming) return false;
  const acc = parts.join('\n\n').trim();
  if (!acc) {
    parts.push(text);
    return true;
  }
  if (acc === incoming) return false;
  if (parts.some((part) => part.trim() === incoming)) return false;
  if (incoming.startsWith(acc) && incoming.length > acc.length) {
    parts.length = 0;
    parts.push(text);
    return true;
  }
  if (acc.startsWith(incoming)) return false;
  parts.push(text);
  return true;
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

type AssistantTurnState = {
  toolCallsById: Map<string, ToolCallData>;
  toolCallOrder: string[];
  textParts: string[];
  thinkingParts: string[];
  // Prose length at the moment each call was issued. The session content array
  // is already ordered, so the interleaving is recoverable here — flattening it
  // into "all text" + "all tools" is what made a reloaded turn show every card
  // above the reply.
  offsetByToolCallId: Map<string, number>;
  /** Length of `textParts.join('\n\n')` so far, tracked instead of re-joining. */
  joinedTextLength: number;
  timestamp: number;
};

function createAssistantTurnState(): AssistantTurnState {
  return {
    toolCallsById: new Map(),
    toolCallOrder: [],
    textParts: [],
    thinkingParts: [],
    offsetByToolCallId: new Map(),
    joinedTextLength: 0,
    timestamp: Date.now(),
  };
}

function appendAssistantText(state: AssistantTurnState, text: string): void {
  if (pushAssistantTextPart(state.textParts, text)) {
    state.joinedTextLength = state.textParts.join('\n\n').length;
  }
}

function appendAssistantThinking(state: AssistantTurnState, thinking: string): void {
  state.thinkingParts.push(thinking);
}

function registerAssistantToolCallBlock(
  state: AssistantTurnState,
  block: PiContentBlock,
): void {
  if (!block.id || !block.name) return;
  if (!state.toolCallsById.has(block.id)) {
    state.toolCallOrder.push(block.id);
    state.offsetByToolCallId.set(block.id, state.joinedTextLength);
  }
  const prev = state.toolCallsById.get(block.id);
  state.toolCallsById.set(block.id, {
    id: block.id,
    name: block.name,
    arguments: block.arguments ?? prev?.arguments ?? {},
    status: prev?.status ?? 'running',
    result: prev?.result,
    error: prev?.error,
  });
}

function handleAssistantContentBlock(
  state: AssistantTurnState,
  block: unknown,
): void {
  if (!block || typeof block !== 'object') return;
  const b = block as PiContentBlock;
  if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
    appendAssistantText(state, b.text);
  } else if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
    appendAssistantThinking(state, b.thinking);
  } else if (b.type === 'toolCall') {
    registerAssistantToolCallBlock(state, b);
  }
}

function handleAssistantMessage(state: AssistantTurnState, msg: PiMessage): void {
  state.timestamp = typeof msg.timestamp === 'number' ? msg.timestamp : state.timestamp;
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      handleAssistantContentBlock(state, block);
    }
    return;
  }
  appendAssistantText(state, extractTextFromContent(msg.content));
}

function recordToolResult(state: AssistantTurnState, msg: PiMessage): void {
  if (!msg.toolCallId) return;
  const id = String(msg.toolCallId);
  const { result, status } = parseToolResultPayload(msg);
  const errorField =
    status === 'error'
      ? { error: typeof result === 'string' ? result : 'Tool error' }
      : {};
  const existing = state.toolCallsById.get(id);
  if (existing) {
    state.toolCallsById.set(id, {
      ...existing,
      name: existing.name || msg.toolName || 'tool',
      status,
      result,
      ...errorField,
    });
    return;
  }
  if (!state.toolCallOrder.includes(id)) state.toolCallOrder.push(id);
  state.toolCallsById.set(id, {
    id,
    name: msg.toolName ?? 'tool',
    arguments: {},
    status,
    result,
    ...errorField,
  });
}

function advanceAssistantTurnIndex(
  raw: unknown[],
  startIndex: number,
  state: AssistantTurnState,
): number {
  let i = startIndex;
  while (i < raw.length) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      i += 1;
      continue;
    }
    const msg = item as PiMessage;
    // Pins are persisted after the assistant turn. Stop so the outer loop
    // can attach `dome.pins` to the preceding user instead of swallowing them.
    if (msg.role === 'user' || msg.role === 'custom') break;
    if (msg.role === 'assistant') {
      handleAssistantMessage(state, msg);
      i += 1;
      continue;
    }
    if (msg.role === 'toolResult') {
      recordToolResult(state, msg);
      i += 1;
      continue;
    }
    i += 1;
  }
  return i;
}

function applyToolCallOffset(
  tc: ToolCallData,
  offset: number | undefined,
  leadingTrimmed: number,
  contentLength: number,
): ToolCallData {
  if (typeof offset !== 'number') return tc;
  return {
    ...tc,
    contentOffset: Math.min(Math.max(offset - leadingTrimmed, 0), contentLength),
  };
}

function finalizeAssistantToolCalls(
  state: AssistantTurnState,
  leadingTrimmed: number,
  contentLength: number,
): ToolCallData[] | undefined {
  const toolCalls = state.toolCallOrder
    .map((id) => state.toolCallsById.get(id))
    .filter((tc): tc is ToolCallData => Boolean(tc))
    .map((tc) =>
      tc.status === 'running' ? { ...tc, status: 'success' as const } : tc,
    )
    .map((tc) =>
      applyToolCallOffset(
        tc,
        state.offsetByToolCallId.get(tc.id),
        leadingTrimmed,
        contentLength,
      ),
    );
  return toolCalls.length > 0 ? coalesceDuplicateToolCalls(toolCalls) : undefined;
}

function consumeAssistantTurn(
  raw: unknown[],
  startIndex: number,
  messageIndex: number,
): { nextIndex: number; message?: HarnessManyMessage } {
  const state = createAssistantTurnState();
  const nextIndex = advanceAssistantTurnIndex(raw, startIndex, state);

  const rawContent = state.textParts.join('\n\n');
  const content = rawContent.trim();
  // `trim()` drops leading whitespace, so shift the offsets by the same amount.
  const leadingTrimmed = rawContent.length - rawContent.trimStart().length;

  const coalescedTools = finalizeAssistantToolCalls(
    state,
    leadingTrimmed,
    content.length,
  );
  if (!content && !coalescedTools?.length) {
    return { nextIndex };
  }

  return {
    nextIndex,
    message: {
      id: `msg-${state.timestamp}-${messageIndex}`,
      role: 'assistant',
      content,
      timestamp: state.timestamp,
      toolCalls: coalescedTools,
      thinking: state.thinkingParts.length > 0 ? state.thinkingParts.join('\n') : undefined,
    },
  };
}

/** Convert agent harness messages (JSONL context) into Many UI messages. */
export function harnessMessagesToManyMessages(raw: unknown[]): HarnessManyMessage[] {
  const out: HarnessManyMessage[] = [];
  let index = 0;
  let pendingPins: { messageTimestamp?: number; pinnedResources: HarnessPinnedResource[] } | null =
    null;

  while (index < raw.length) {
    const item = raw[index];
    if (!item || typeof item !== 'object') {
      index += 1;
      continue;
    }
    const msg = item as PiMessage;

    if (msg.role === 'user') {
      const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
      const images = extractImagesFromContent(msg.content);
      // Keep empty user turns (chip-only pins) so JSONL↔local counts stay aligned.
      out.push({
        id: `msg-${ts}-${out.length}`,
        role: 'user',
        content: extractTextFromContent(msg.content),
        timestamp: ts,
        ...(images.length > 0 ? { attachments: { images, videos: [] } } : {}),
      });
      if (pendingPins) {
        attachPinsToUser(out, pendingPins);
        pendingPins = null;
      }
      index += 1;
      continue;
    }

    if (msg.role === 'custom') {
      const pins = parseDomePinsPayload(msg);
      if (pins && !attachPinsToUser(out, pins)) pendingPins = pins;
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
