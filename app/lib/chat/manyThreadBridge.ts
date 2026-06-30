import type { ManyMessage } from '@/lib/store/useManyStore';
import { harnessMessagesToManyMessages as convertHarnessMessages } from '@/lib/chat/harnessToManyMessages';
import { mergeManySessionMessages } from '@/lib/chat/mergeManySessionMessages';
import {
  getDeletedManySessionIds,
  loadManySessionUiMeta,
  deriveManySessionTitle,
  sanitizeManySessionTitle,
} from '@/lib/store/manySessionStorage';

export { harnessMessagesToManyMessages } from '@/lib/chat/harnessToManyMessages';

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
  /** First user message (from threads:list), used as a readable list title. */
  title?: string | null;
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
          title: (thread as { title?: string | null }).title ?? null,
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
    return convertHarnessMessages(raw) as ManyMessage[];
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
  const uiMeta = loadManySessionUiMeta();
  return {
    messages: merged,
    title: deriveManySessionTitle({
      storedTitle: uiMeta[threadId]?.title,
      messages: merged,
      firstUser,
    }),
  };
}
