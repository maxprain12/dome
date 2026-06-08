import type { ManyMessage } from '@/lib/store/useManyStore';
import { mergeManySessionMessages } from '@/lib/chat/mergeManySessionMessages';
import {
  getDeletedManySessionIds,
  loadManySessionUiMeta,
  sanitizeManySessionTitle,
} from '@/lib/store/manySessionStorage';

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

function extractToolCalls(content: unknown): ManyMessage['toolCalls'] | undefined {
  if (!Array.isArray(content)) return undefined;
  const calls = content
    .filter(
      (block): block is PiContentBlock & { type: 'toolCall'; id: string; name: string } =>
        Boolean(block && typeof block === 'object' && (block as PiContentBlock).type === 'toolCall'),
    )
    .map((tc) => ({
      id: tc.id!,
      name: tc.name!,
      arguments: tc.arguments ?? {},
    }));
  return calls.length > 0 ? calls : undefined;
}

function extractThinking(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter(
      (block): block is PiContentBlock & { type: 'thinking'; thinking: string } =>
        Boolean(block && typeof block === 'object' && (block as PiContentBlock).type === 'thinking'),
    )
    .map((b) => b.thinking!)
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/** Convert agent harness messages (JSONL context) into Many UI messages. */
export function harnessMessagesToManyMessages(raw: unknown[]): ManyMessage[] {
  const out: ManyMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const msg = item as PiMessage;
    const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();

    if (msg.role === 'user') {
      const text = extractTextFromContent(msg.content);
      if (!text.trim()) continue;
      out.push({
        id: `msg-${ts}-${out.length}`,
        role: 'user',
        content: text,
        timestamp: ts,
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const text = extractTextFromContent(msg.content);
      const toolCalls = extractToolCalls(msg.content);
      const thinking = extractThinking(msg.content);
      if (!text.trim() && !toolCalls?.length) continue;
      out.push({
        id: `msg-${ts}-${out.length}`,
        role: 'assistant',
        content: text,
        timestamp: ts,
        toolCalls,
        thinking,
      });
    }
  }
  return out;
}

function parseThreadCreatedAt(metadata: Record<string, unknown> | undefined): number {
  const raw = metadata?.createdAt;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return Date.now();
}

export interface ThreadSessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** Nested harness sessions (subagents, team delegates, forks) — not shown in Many sidebar. */
export const NESTED_MANY_THREAD_ID_RE = /_(sub|member|fork)_/;

/** Non-Many surfaces (Learn/Studio generation, agent-canvas nodes) — not Many chats. */
const NON_MANY_THREAD_PREFIXES = ['studio-', 'canvas-'];

export function isNestedManyThreadId(threadId: string): boolean {
  return (
    NESTED_MANY_THREAD_ID_RE.test(threadId) ||
    threadId.startsWith('many_') ||
    NON_MANY_THREAD_PREFIXES.some((p) => threadId.startsWith(p))
  );
}

/**
 * List JSONL sessions (source of truth) for the Many sidebar.
 * `ok` distinguishes "no sessions" from "listing failed" so callers can avoid
 * garbage-collecting local UI meta on a transient IPC error.
 */
export async function listManyThreadSummariesResult(
  limit = 50,
): Promise<{ ok: boolean; summaries: ThreadSessionSummary[] }> {
  if (!window.electron?.threads?.list) return { ok: false, summaries: [] };
  try {
    const result = await window.electron.threads.list({ limit, rootOnly: true });
    if (result.error || !Array.isArray(result.threads)) return { ok: false, summaries: [] };
    const deleted = getDeletedManySessionIds();
    const uiMeta = loadManySessionUiMeta();
    const summaries = result.threads
      .filter((thread) => !deleted.has(thread.threadId) && !isNestedManyThreadId(thread.threadId))
      .map((thread) => {
        const meta = uiMeta[thread.threadId];
        const createdAt = meta?.createdAt ?? parseThreadCreatedAt(thread.metadata as Record<string, unknown>);
        return {
          id: thread.threadId,
          createdAt,
          updatedAt: meta?.updatedAt ?? createdAt,
          messageCount: thread.checkpointCount ?? 0,
        };
      });
    return { ok: true, summaries };
  } catch (err) {
    console.warn('[Many] threads:list failed:', err);
    return { ok: false, summaries: [] };
  }
}

/** List JSONL sessions (source of truth) for Many sidebar. */
export async function listManyThreadSummaries(limit = 50): Promise<ThreadSessionSummary[]> {
  const { summaries } = await listManyThreadSummariesResult(limit);
  return summaries;
}

/** Load messages for a thread from JSONL via threads:get-state. */
export async function fetchManyMessagesFromThread(threadId: string): Promise<ManyMessage[]> {
  if (!window.electron?.threads?.getState) return [];
  try {
    const result = await window.electron.threads.getState(threadId);
    if (result.error || !result.state) return [];
    const checkpoint = result.state.checkpoint as {
      channel_values?: { messages?: unknown[] };
    } | undefined;
    const raw = checkpoint?.channel_values?.messages;
    if (!Array.isArray(raw)) return [];
    return harnessMessagesToManyMessages(raw);
  } catch (err) {
    console.warn('[Many] threads:get-state failed:', err);
    return [];
  }
}

/**
 * Refresh in-memory messages from JSONL after a run completes.
 * Returns false when thread data is not ready yet (keep streaming UI).
 */
export async function refreshManySessionFromThread(
  threadId: string,
  localMessages: ManyMessage[],
): Promise<{ messages: ManyMessage[]; title: string } | null> {
  const threadMessages = await fetchManyMessagesFromThread(threadId);
  if (threadMessages.length === 0) return null;

  const lastThread = threadMessages[threadMessages.length - 1];
  if (!lastThread || lastThread.role !== 'assistant') return null;
  const hasUser = threadMessages.some((m) => m.role === 'user');
  if (!hasUser) return null;

  const hasContent = !!lastThread.content?.trim();
  const hasToolCalls = Array.isArray(lastThread.toolCalls) && lastThread.toolCalls.length > 0;
  if (!hasContent && !hasToolCalls) return null;

  const merged = mergeManySessionMessages(localMessages, threadMessages);
  const localAssistants = localMessages.filter((m) => m.role === 'assistant').length;
  const mergedAssistants = merged.filter((m) => m.role === 'assistant').length;
  if (merged.length < localMessages.length || mergedAssistants < localAssistants) {
    return null;
  }

  const firstUser = merged.find((m) => m.role === 'user')?.content ?? '';
  return {
    messages: merged,
    title: sanitizeManySessionTitle(firstUser),
  };
}
