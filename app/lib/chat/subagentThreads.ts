import { fetchManyMessagesFromThread } from '@/lib/chat/manyThreadBridge';
import type { ManyMessage } from '@/lib/store/useManyStore';

/**
 * A subagent run keeps its own JSONL session, nested under the parent thread as
 * `<parentThreadId>_sub_<agent>_<timestamp>`. Nothing in the parent transcript
 * shows what it did — only the text it handed back — so opening that session is
 * the only way to see its reasoning and tool calls.
 */
export type SubagentThread = {
  threadId: string;
  agentKey: string;
  startedAt: number;
};

const NESTED_SUFFIX_RE = /^_sub_([a-z0-9-]+)_(\d+)$/i;

/**
 * Parse the nested-session naming convention.
 * Returns null for anything that is not a subagent session of `parentThreadId`.
 */
export function parseSubagentThreadId(
  parentThreadId: string,
  threadId: string,
): SubagentThread | null {
  if (!parentThreadId || !threadId.startsWith(parentThreadId)) return null;
  const match = NESTED_SUFFIX_RE.exec(threadId.slice(parentThreadId.length));
  if (!match) return null;
  const startedAt = Number(match[2]);
  return {
    threadId,
    agentKey: match[1]!.toLowerCase(),
    startedAt: Number.isFinite(startedAt) ? startedAt : 0,
  };
}

/**
 * Subagent sessions spawned by a Many conversation, oldest first.
 * Returns [] when the thread bridge is unavailable rather than throwing — the
 * history is an enrichment, never a requirement for showing the turn.
 */
export async function listSubagentThreads(parentThreadId: string): Promise<SubagentThread[]> {
  if (!parentThreadId || !window.electron?.threads?.list) return [];
  try {
    const result = await window.electron.threads.list({ limit: 200, rootOnly: false });
    if (result.error || !Array.isArray(result.threads)) return [];
    return result.threads
      .map((thread) => parseSubagentThreadId(parentThreadId, thread.threadId))
      .filter((entry): entry is SubagentThread => entry !== null)
      .sort((a, b) => a.startedAt - b.startedAt);
  } catch (err) {
    console.warn('[Many] could not list subagent threads:', err);
    return [];
  }
}

/** Messages of one subagent session, in the same shape as the main transcript. */
export async function fetchSubagentMessages(threadId: string): Promise<ManyMessage[]> {
  if (!threadId) return [];
  try {
    return await fetchManyMessagesFromThread(threadId);
  } catch (err) {
    console.warn('[Many] could not load subagent transcript:', threadId, err);
    return [];
  }
}
